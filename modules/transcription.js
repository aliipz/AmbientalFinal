export class TranscriptionModule {
    constructor(worker) {
        this.worker = worker;
        this.isRecording = false;
        this.mediaStream = null;
        this.audioContext = null;
        this.processor = null;
        this.buffer = [];
        this.BUFFER_SIZE = 4096;
    }

    async start() {
        if (this.isRecording) return;

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Using ScriptProcessor for simplicity in this prototype context
            // In production, AudioWorklet is preferred
            this.processor = this.audioContext.createScriptProcessor(this.BUFFER_SIZE, 1, 1);

            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            this.processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                this.handleAudioData(inputData);
            };

            this.isRecording = true;
            console.log("Microphone connected. Sample Rate:", this.audioContext.sampleRate);

            // Signal worker that we are ready or reset context if needed
            this.worker.postMessage({ type: 'reset_asr' });

        } catch (error) {
            console.error("Error accessing microphone:", error);
            alert("No se pudo acceder al micrófono. Por favor verifica los permisos.");
        }
    }

    handleAudioData(inputData) {
        // VAD: Detección de Actividad de Voz basada en Energía (RMS)

        // 1. Calcular RMS (Volumen promedio del chunk actual)
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
            const sample = inputData[i];
            sumSquares += sample * sample;
            this.buffer.push(sample);
        }
        const rms = Math.sqrt(sumSquares / inputData.length);

        // Umbrales
        const VAD_THRESHOLD = 0.02;     // Sensibilidad al volumen (ajustable)
        const SILENCE_SAMPLES = 24000;  // ~1.5 segundos a 16kHz
        const MAX_BUFFER = 240000;      // Max 15 segundos para evitar memoria infinita

        // 2. Lógica de estado
        if (rms > VAD_THRESHOLD) {
            // Hay voz, reiniciamos contador de silencio
            this.silenceCounter = 0;
        } else {
            // Silencio
            if (this.buffer.length > 0) {
                this.silenceCounter = (this.silenceCounter || 0) + inputData.length;
            }
        }

        // 3. Decisión de envío
        // Enviar si: (Silencio largo detectado Y tenemos datos suficientes) O (Buffer lleno)
        const isLongSilence = this.silenceCounter > SILENCE_SAMPLES;
        const hasEnoughData = this.buffer.length > 8000; // Mínimo 0.5s para evitar ruiditos
        const isBufferFull = this.buffer.length > MAX_BUFFER;

        if ((isLongSilence && hasEnoughData) || isBufferFull) {
            console.log(`Sending buffer: ${this.buffer.length} samples. Reason: ${isBufferFull ? 'FULL' : 'SILENCE'}`);

            const audioData = new Float32Array(this.buffer);
            this.worker.postMessage({
                type: 'audio_chunk',
                data: audioData
            });

            // Limpieza
            this.buffer = [];
            this.silenceCounter = 0;
        } else if (isLongSilence && !hasEnoughData) {
            // Si es puro silencio y poco dato, limpiamos para no acumular ruido de fondo infinito
            // pero mantenemos un pequeño solapamiento si quisiéramos (aquí limpieza total para simpleza)
            if (this.buffer.length > SILENCE_SAMPLES * 2) {
                this.buffer = [];
                this.silenceCounter = 0;
            }
        }
    }

    async stop() {
        if (!this.isRecording) return;

        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        this.isRecording = false;
        this.buffer = [];
    }
}
