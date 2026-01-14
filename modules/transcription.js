export class TranscriptionModule {
    constructor(worker) {
        this.worker = worker;
        this.isRecording = false;
        this.mediaStream = null;
        this.audioContext = null;
        this.processor = null;
        this.analyser = null; // Para medir volumen
        this.buffer = [];
        
        // CONFIGURACIÓN VAD
        this.SILENCE_THRESHOLD = 0.02; // Sensibilidad (ajustar si hay mucho ruido de fondo)
        this.SILENCE_DURATION = 1500;  // 1.5 segundos de silencio para cortar
        this.MAX_RECORDING_TIME = 15000; // Corte forzoso a los 15s para no saturar memoria
        
        this.lastSpeechTime = Date.now();
        this.speechDetectedInChunk = false;
    }

    async start() {
        if (this.isRecording) return;

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            
            // Analizador de volumen
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512;
            
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Procesador de script
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

            // Conexiones: Fuente -> Analizador -> Procesador -> Destino
            source.connect(this.analyser);
            this.analyser.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            // Resetear variables
            this.buffer = [];
            this.lastSpeechTime = Date.now();
            this.speechDetectedInChunk = false;

            this.processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                this.handleAudioData(inputData);
            };

            this.isRecording = true;
            this.worker.postMessage({ type: 'reset_asr' });
            console.log("🎤 Micrófono inteligente activado.");

        } catch (error) {
            console.error("Error micrófono:", error);
            alert("Error al acceder al micrófono.");
        }
    }

    handleAudioData(inputData) {
        if (!this.isRecording) return;

        // 1. Detectar volumen (RMS)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
            this.buffer.push(inputData[i]); // Guardamos siempre
        }
        const rms = Math.sqrt(sum / inputData.length);

        // 2. Lógica de Silencio
        const now = Date.now();

        if (rms > this.SILENCE_THRESHOLD) {
            // Usuario hablando
            this.lastSpeechTime = now;
            this.speechDetectedInChunk = true;
            
            // Feedback visual opcional: "Escuchando..."
            const ind = document.querySelector('.recording-indicator');
            if(ind && !ind.classList.contains('active')) ind.style.opacity = '1';
        } else {
            // Silencio... bajamos intensidad visual
            const ind = document.querySelector('.recording-indicator');
            if(ind) ind.style.opacity = '0.5';
        }

        // 3. Decidir si enviamos
        const timeSinceSpeech = now - this.lastSpeechTime;
        const bufferDurationMs = (this.buffer.length / 16000) * 1000;

        // CONDICIÓN DE ENVÍO:
        // (Hay silencio suficiente Y hemos detectado voz previamente) O (Buffer demasiado grande)
        if ((timeSinceSpeech > this.SILENCE_DURATION && this.speechDetectedInChunk) || 
            bufferDurationMs > this.MAX_RECORDING_TIME) {
            
            console.log(`Enviando audio: ${bufferDurationMs.toFixed(0)}ms (Silencio: ${timeSinceSpeech}ms)`);
            this.sendBuffer();
        }
    }

    sendBuffer() {
        if (this.buffer.length === 0) return;

        const audioData = new Float32Array(this.buffer);
        this.worker.postMessage({
            type: 'audio_chunk',
            data: audioData
        });

        // Limpiar para la siguiente frase
        this.buffer = [];
        this.speechDetectedInChunk = false;
        this.lastSpeechTime = Date.now(); // Reset timer
    }

    async stop() {
        if (!this.isRecording) return;
        
        // Enviar lo que quede si es útil
        if (this.speechDetectedInChunk && this.buffer.length > 0) {
            this.sendBuffer();
        }

        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        if (this.analyser) {
            this.analyser.disconnect();
            this.analyser = null;
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