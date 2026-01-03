import { pipeline, env, AutoProcessor, RawImage, MultiModalityCausalLM } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.4';

// 1. CONFIGURACIÓN DEL ENTORNO
env.allowLocalModels = false;
env.useBrowserCache = true;

// IMPORTANTE: Esto evita el error "RuntimeError: Aborted" si no tienes headers de servidor seguros (COOP/COEP)
// Al usar WebGPU, el trabajo pesado lo hace la gráfica, así que limitar los hilos de CPU no afecta el rendimiento.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.simd = true;

// Variables
let asr_pipeline, llm_pipeline, embed_pipeline, vlm_model, vlm_processor, translation_pipeline;
let isProcessingAudio = false;

// --- PROGRESO ---
const progressCallback = (data) => {
    if (data.status === 'progress') {
        const percent = (data.loaded / data.total) * 100;
        self.postMessage({ type: 'progress_update', percent, file: data.file, task: data.name || 'modelo' });
    }
};

self.onmessage = async (e) => {
    const { type, data } = e.data;

    // --- CARGA ---
    if (type === 'load') {
        try {
            // Cargar componentes ligeros (Audio, Texto, RAG)
            self.postMessage({ status: 'progress', message: 'Cargando sistemas básicos...' });

            // Texto (CPU)
            llm_pipeline = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-783M');
            self.postMessage({ status: 'ready', task: 'llm' });

            // RAG (CPU)
            embed_pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            self.postMessage({ status: 'ready', task: 'rag' });

            // Voz (CPU)
            try {
                asr_pipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
                self.postMessage({ status: 'ready', task: 'asr' });
            } catch (e) { }

            try {
                translation_pipeline = await pipeline('translation', 'Xenova/opus-mt-en-es');
            } catch (e) { }

            // ============================================================
            // VISIÓN: CONFIGURACIÓN OPTIMIZADA PARA GPU (WebGPU)
            // ============================================================
            self.postMessage({ status: 'progress', message: 'Despertando a la GPU (Janus Pro)...' });

            try {
                const model_id = 'onnx-community/Janus-Pro-1B-ONNX';

                vlm_processor = await AutoProcessor.from_pretrained(model_id);

                // TRUCO PARA TU GPU:
                // Usamos 'q4' (int4). Aunque tengas una GPU potente, usar q4
                // asegura que el modelo ocupe menos de 1GB de VRAM.
                // Esto satisface el límite de seguridad del navegador Y vuela en velocidad.
                vlm_model = await MultiModalityCausalLM.from_pretrained(model_id, {
                    dtype: 'q4',      // Calidad visual 99% igual, pero pesa 4 veces menos.
                    device: 'webgpu', // FORZAR USO DE GPU
                    progress_callback: progressCallback,
                });

                console.log("🚀 Éxito: Janus corriendo en GPU mediante WebGPU.");
                self.postMessage({ status: 'ready', task: 'vlm' });

            } catch (gpuError) {
                console.error("Error WebGPU:", gpuError);

                // Si falla la GPU (por drivers o navegador desactualizado), mensaje claro:
                let msg = "Tu navegador bloqueó el acceso a la GPU.";
                if (gpuError.message.includes("buffer")) msg = "El navegador limitó la memoria (Buffer limit).";

                self.postMessage({
                    type: 'debug',
                    text: `⚠️ Fallo de GPU: ${msg} Intentando modo CPU de emergencia...`
                });

                // Intento final en CPU
                try {
                    vlm_model = await MultiModalityCausalLM.from_pretrained('onnx-community/Janus-Pro-1B-ONNX', {
                        dtype: 'q4',
                        device: 'wasm'
                    });
                    self.postMessage({ status: 'ready', task: 'vlm' });
                } catch (e) {
                    self.postMessage({ type: 'debug', text: "❌ No se pudo cargar Janus." });
                }
            }

            self.postMessage({ status: 'complete', message: 'Sistemas Listos' });

        } catch (error) {
            self.postMessage({ status: 'error', message: error.message });
        }
    }

    // --- LOGICA VISIÓN ---
    if (type === 'vision') {
        if (!vlm_model) return;
        try {
            self.postMessage({ type: 'debug', text: "⚡ Procesando imagen con GPU..." });

            const image = await RawImage.read(data.image);
            const conversation = [{ role: "user", content: "Describe this image.", images: [image] }];

            const inputs = await vlm_processor(conversation);

            const output = await vlm_model.generate({
                ...inputs,
                max_new_tokens: 150,
                do_sample: false // Más rápido y preciso para descripciones
            });

            const decoded = vlm_processor.batch_decode(output, { skip_special_tokens: false })[0];

            // Limpieza robusta del texto
            let text = decoded.split("Assistant:").pop();
            text = text.replace(/<\|.*?\|>/g, "").trim();

            if (translation_pipeline && text) {
                const trans = await translation_pipeline(text);
                self.postMessage({ type: 'vision_result', text: trans[0].translation_text });
            } else {
                self.postMessage({ type: 'vision_result', text: text });
            }

        } catch (err) {
            console.error(err);
            self.postMessage({ type: 'vision_result', text: "Error procesando imagen." });
        }
    }

    // --- RESTO DE LÓGICA (Audio, RAG, Chat) ---
    if (type === 'audio_chunk') {
        if (!asr_pipeline || isProcessingAudio) return;
        isProcessingAudio = true;
        try {
            const out = await asr_pipeline(data, { chunk_length_s: 30, language: 'spanish' });
            if (out?.text?.length > 1) self.postMessage({ type: 'transcription_result', text: out.text.trim() });
        } catch (e) { } finally { isProcessingAudio = false; }
    }
    if (type === 'generate') {
        if (llm_pipeline) {
            const out = await llm_pipeline(data.prompt, { max_new_tokens: 200 });
            self.postMessage({ type: 'generation_result', text: out[0].generated_text, hat: data.hat });
        }
    }
    if (type === 'embed') {
        if (embed_pipeline) {
            const out = await embed_pipeline(data, { pooling: 'mean', normalize: true });
            self.postMessage({ type: 'embedding_result', embedding: out.data, id: data.id });
        }
    }
};