import { 
    pipeline, 
    env, 
    AutoTokenizer, 
    AutoModelForCausalLM, 
    AutoProcessor, 
    Florence2ForConditionalGeneration, 
    RawImage 
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.4';

// 1. CONFIGURACIÓN DEL ENTORNO
env.allowLocalModels = false;
env.useBrowserCache = true;
// Optimización CPU (WASM) por si falla la GPU
env.backends.onnx.wasm.numThreads = 1; 
env.backends.onnx.wasm.simd = true;

// Variables Globales
let asr_pipeline;           // Whisper
let classifier_pipeline;    // Orquestador
let embed_pipeline;         // RAG
let text_model, text_tokenizer; // LLM (Qwen)
let vlm_model, vlm_processor, vlm_tokenizer; // Visión (Florence-2)

// Estado
let isProcessingAudio = false;

// Callback de progreso mejorado
const progressCallback = (data) => {
    // Solo enviamos actualizaciones relevantes para no saturar
    if (data.status === 'progress') {
        const percent = (data.loaded / data.total) * 100;
        // Enviamos mensaje solo cada 10% o al terminar para aligerar
        if (Math.round(percent) % 10 === 0 || percent >= 100) {
            self.postMessage({ 
                type: 'progress_update', 
                percent, 
                file: data.file, 
                task: data.name || 'modelo',
                message: `Descargando ${data.file} (${Math.round(percent)}%)`
            });
        }
    }
};

self.onmessage = async (e) => {
    const { type, data } = e.data;

    // --- CARGA DE MODELOS ---
    if (type === 'load') {
        try {
            self.postMessage({ status: 'progress', message: 'Iniciando carga de sistemas...' });

            // 1. ORQUESTADOR (Zero-Shot) - Muy ligero
            if (!classifier_pipeline) {
                self.postMessage({ status: 'progress', message: 'Cargando Orquestador...' });
                classifier_pipeline = await pipeline('zero-shot-classification', 'Xenova/nli-deberta-v3-xsmall');
                self.postMessage({ status: 'ready', task: 'classifier' });
            }

            // 2. RAG (Embeddings) - Muy ligero
            if (!embed_pipeline) {
                embed_pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
                self.postMessage({ status: 'ready', task: 'rag' });
            }

            // 3. AUDIO (Whisper)
            if (!asr_pipeline) {
                try {
                    asr_pipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
                    self.postMessage({ status: 'ready', task: 'asr' });
                } catch (err) { console.warn("Fallo Whisper", err); }
            }

            // 4. LLM DE TEXTO (Qwen 2.5) - EL IMPORTANTE
            // CAMBIO CLAVE: Usamos 'onnx-community' que es el repositorio oficial compatible
            const llm_id = 'onnx-community/Qwen2.5-0.5B-Instruct'; 
            
            if (!text_model) {
                self.postMessage({ status: 'progress', message: 'Cargando Qwen 2.5 (esto puede tardar)...' });
                
                try {
                    text_tokenizer = await AutoTokenizer.from_pretrained(llm_id);
                    
                    // Intentamos cargar primero con WebGPU
                    try {
                        console.log("Intentando cargar LLM con WebGPU...");
                        text_model = await AutoModelForCausalLM.from_pretrained(llm_id, {
                            dtype: "q4f16",    // Formato optimizado para GPU
                            device: "webgpu",  // Forzamos GPU
                            progress_callback: progressCallback
                        });
                        console.log("LLM cargado en WebGPU exitosamente.");
                    } catch (gpuError) {
                        console.warn("Fallo WebGPU, cambiando a CPU (WASM)...", gpuError);
                        self.postMessage({ type: 'debug', text: "⚠️ WebGPU falló. Usando modo CPU (más lento)." });
                        
                        // Fallback a CPU
                        text_model = await AutoModelForCausalLM.from_pretrained(llm_id, {
                            dtype: "q4",      // Más comprimido para RAM
                            device: "wasm",
                            progress_callback: progressCallback
                        });
                    }
                    
                    self.postMessage({ status: 'ready', task: 'llm' });

                } catch (err) {
                    console.error("Error FATAL cargando Qwen:", err);
                    self.postMessage({ type: 'debug', text: `❌ Error cargando Qwen: ${err.message}. Revisa la consola.` });
                    throw err;
                }
            }

            // 5. VISIÓN (Florence-2)
            if (!vlm_model) {
                self.postMessage({ status: 'progress', message: 'Cargando Visión (Florence-2)...' });
                const vision_id = 'onnx-community/Florence-2-base-ft'; // Modelo base robusto
                
                try {
                    vlm_processor = await AutoProcessor.from_pretrained(vision_id);
                    vlm_tokenizer = await AutoTokenizer.from_pretrained(vision_id);
                    
                    try {
                        vlm_model = await Florence2ForConditionalGeneration.from_pretrained(vision_id, {
                            dtype: "fp16", 
                            device: "webgpu",
                            progress_callback: progressCallback
                        });
                    } catch (gpuErr) {
                         console.warn("Fallo WebGPU Visión, usando CPU", gpuErr);
                         vlm_model = await Florence2ForConditionalGeneration.from_pretrained(vision_id, {
                            dtype: "q4", 
                            device: "wasm",
                            progress_callback: progressCallback
                        });
                    }
                    self.postMessage({ status: 'ready', task: 'vlm' });

                } catch (err) {
                    console.error("Error cargando Visión:", err);
                    self.postMessage({ type: 'debug', text: "❌ Error fatal en módulo de visión." });
                }
            }

            self.postMessage({ status: 'complete', message: 'Sistemas Listos' });

        } catch (error) {
            self.postMessage({ status: 'error', message: error.message });
        }
    }

    // --- RESTO DE LÓGICA (Igual que antes) ---

    // ORQUESTADOR
    if (type === 'classify_intent') {
        if (!classifier_pipeline) return;
        const labels = ["datos objetivos", "emociones", "riesgos criticas", "beneficios", "ideas creatividad", "resumen control"];
        const output = await classifier_pipeline(data.text, labels, { multi_label: false });
        const map = { "datos objetivos": "white", "emociones": "red", "riesgos criticas": "black", "beneficios": "yellow", "ideas creatividad": "green", "resumen control": "blue" };
        if (output.scores[0] > 0.25) self.postMessage({ type: 'intent_result', hat: map[output.labels[0]], confidence: output.scores[0] });
    }

    // GENERACIÓN (QWEN)
    if (type === 'generate') {
        if (!text_model || !text_tokenizer) {
            self.postMessage({ type: 'debug', text: "⚠️ El modelo aún se está cargando, espera..." });
            return;
        }

        const messages = [
            { role: "system", content: "Eres un asistente útil y conciso en español." },
            { role: "user", content: data.prompt }
        ];
        
        // Renderizar template manualmente si apply_chat_template falla en v3
        const promptStr = `<|im_start|>system\nEres un asistente útil.<|im_end|>\n<|im_start|>user\n${data.prompt}<|im_end|>\n<|im_start|>assistant\n`;
        
        // Intentamos usar el tokenizer, si falla usamos raw
        let input_ids;
        try {
            const inputs = text_tokenizer.apply_chat_template(messages, { tokenize: true, add_generation_prompt: true, return_tensor: false });
            input_ids = await text_tokenizer.encode(inputs, { add_special_tokens: false });
        } catch (e) {
            // Fallback manual
            input_ids = await text_tokenizer.encode(promptStr, { add_special_tokens: false });
        }
        
        const outputs = await text_model.generate({
            input_ids: input_ids,
            max_new_tokens: 256,
            do_sample: true,
            temperature: 0.6,
        });

        const decoded = text_tokenizer.decode(outputs[0], { skip_special_tokens: true });
        // Limpieza robusta
        let response = decoded.replace(promptStr, '').replace(/<\|im_.*?\|>/g, '').trim();
        // Si sigue sucio por el decode completo:
        if (response.includes("assistant\n")) response = response.split("assistant\n").pop();

        self.postMessage({ type: 'generation_result', text: response, hat: data.hat });
    }

    // VISIÓN
    if (type === 'vision') {
        if (!vlm_model) return;
        try {
            const image = await RawImage.read(data.image);
            const task = '<MORE_DETAILED_CAPTION>'; 
            const prompts = vlm_processor.construct_prompts(task);
            const text_inputs = vlm_tokenizer(prompts);
            const vision_inputs = await vlm_processor(image);
            
            const generated_ids = await vlm_model.generate({
                ...text_inputs,
                pixel_values: vision_inputs.pixel_values,
                max_new_tokens: 100,
            });

            const generated_text = vlm_tokenizer.batch_decode(generated_ids, { skip_special_tokens: false })[0];
            const result = vlm_processor.post_process_generation(generated_text, task, image.size);
            self.postMessage({ type: 'vision_result', text: result['<MORE_DETAILED_CAPTION>'] });
        } catch (err) { 
            console.error(err); 
            self.postMessage({ type: 'vision_result', text: "Error analizando imagen." });
        }
    }

    if (type === 'audio_chunk') {
        if (!asr_pipeline || isProcessingAudio) return;
        isProcessingAudio = true;
        try {
            const out = await asr_pipeline(data, { chunk_length_s: 30, language: 'spanish' });
            if (out?.text?.length > 1) self.postMessage({ type: 'transcription_result', text: out.text.trim() });
        } catch (e) {} finally { isProcessingAudio = false; }
    }

    if (type === 'embed') {
        if (embed_pipeline) {
            const out = await embed_pipeline(data.text || data, { pooling: 'mean', normalize: true });
            self.postMessage({ type: 'embedding_result', embedding: out.data, id: data.id });
        }
    }
};