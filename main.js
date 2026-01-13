import { TranscriptionModule } from './modules/transcription.js';
import { RAGModule } from './modules/rag.js';
import { AgentModule } from './modules/agents.js';
import { CanvasModule } from './modules/canvas.js';

const worker = new Worker('worker.js', { type: 'module' });

// Módulos
const transcription = new TranscriptionModule(worker);
const rag = new RAGModule(worker);
const agents = new AgentModule(worker, rag);
const canvas = new CanvasModule('drawing-board', worker);

// UI
const btnMic = document.getElementById('btn-mic');
const btnSend = document.getElementById('btn-send');
const userInput = document.getElementById('user-input');

// Controles Micrófono
if (btnMic) {
    btnMic.addEventListener('click', () => {
        btnMic.classList.toggle('active');
        if (btnMic.classList.contains('active')) {
            transcription.start();
            document.querySelector('.recording-indicator').classList.add('visible');
        } else {
            transcription.stop();
            document.querySelector('.recording-indicator').classList.remove('visible');
        }
    });
}

// Manejo de mensajes del usuario
const handleUserMessage = (inputText = null) => {
    const text = inputText || userInput.value.trim();
    if (!text) return;

    if (!inputText) userInput.value = '';

    addMessageToChat('user', text);
    agents.addToHistory('User', text);

    // 1. Modo Auto (Orquestador)
    if (agents.isAutoMode) {
        addMessageToChat('system', '🧠 Analizando intención...', 'info');
        worker.postMessage({ type: 'classify_intent', data: { text: text } });
        return;
    }

    // 2. RAG (Búsqueda en documentos)
    const hasDocuments = rag.documents.some(d => d.isReady);
    if (hasDocuments) {
        addMessageToChat('system', '🔍 Buscando en documentos...', 'info');
        // CORRECCIÓN: Enviamos 'id' dentro de 'data'
        worker.postMessage({
            type: 'embed',
            data: { text: text, id: `QUERY:${text}` }
        });
    } else {
        // 3. Chat General
        agents.triggerHat('blue', text);
    }
};

if (btnSend) btnSend.addEventListener('click', () => handleUserMessage());
if (userInput) userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUserMessage(); });

// --- RESPUESTAS DEL WORKER ---
worker.onmessage = (e) => {
    const { status, task, type, text, percent, message, embedding, id, hat, confidence } = e.data;

    // A. Progreso
    if (status === 'progress' || type === 'progress_update') {
        handleProgress(percent, message);
    }
    if (status === 'ready') {
        const statusMap = { 'asr': 'status-whisper', 'llm': 'status-llm', 'vlm': 'status-vision', 'classifier': 'status-llm' };
        const el = document.getElementById(statusMap[task]);
        if (el) el.classList.add('connected');
    }

    // B. Transcripción
    if (type === 'transcription_result') {
        const caption = document.getElementById('live-caption');
        if (caption) caption.innerText = text;
        handleUserMessage(text);
    }

    // C. Orquestador
    if (type === 'intent_result') {
        addMessageToChat('system', `💡 Intención: Sombrero ${hat.toUpperCase()} (${(confidence * 100).toFixed(0)}%)`, hat);
        agents.triggerHat(hat);
    }

    // D. RAG (Mejorado)
    if (type === 'embedding_result') {
        // Verificamos que sea una respuesta a una pregunta y no un chunk
        if (id && typeof id === 'string' && (id.startsWith('QUERY:') || id.startsWith('QUERY_RAG:'))) {
            const isRagSpecific = id.startsWith('QUERY_RAG:');
            const prefix = isRagSpecific ? 'QUERY_RAG:' : 'QUERY:';
            const originalQuery = id.split(prefix)[1];

            const results = rag.search(originalQuery, embedding, 3); // Top 3 resultados (Híbrido)

            if (results.length > 0 && results[0].score > 0.25) {
                const bestChunk = results[0];

                // Feedback visual de lo encontrado
                // Feedback visual de lo encontrado
                addMessageToChat('system', `📄 <b>Encontrado en PDF (${(results[0].score * 100).toFixed(0)}%):</b><br>"${bestChunk.text}"`, 'white');

                // Prompt específico para que el modelo conteste usando el contexto
                const prompt = `Contexto del Documento: "${bestChunk.text}"
Pregunta del Usuario: "${originalQuery}"
Instrucción: Como Sombrero Blanco, responde a la pregunta basándote SOLAMENTE en el contexto proporcionado. Sé objetivo.
Respuesta:`;

                worker.postMessage({ type: 'generate', data: { prompt, hat: 'white' } });
            } else {
                if (isRagSpecific) {
                    addMessageToChat('system', '⚠️ No encontrado en documentos. Usando conocimiento general.', 'warning');
                    // Fallback a generación normal sin contexto pero como sombrero blanco
                    // Llamamos manualmente a worker.generate simulando que agents.js lo envió
                    const promptFallback = `Contexto: Brainstorming.
Entrada: "${originalQuery}"
Instrucción: El usuario preguntó esto buscando datos, pero no hay documentos. Como Sombrero Blanco, responde con un dato objetivo general.
Respuesta:`;
                    worker.postMessage({ type: 'generate', data: { prompt: promptFallback, hat: 'white' } });
                } else {
                    // Fallback antiguo (probablemente no se usa ya)
                    agents.triggerHat('blue', originalQuery);
                }
            }
        } else if (id) {
            // Es un chunk de un documento cargándose
            rag.handleEmbedding(id, embedding);
        }
    }

    // E. Generación de Texto
    if (type === 'generation_result') {
        addMessageToChat('bot', text, hat);
        agents.addToHistory('AI', text);
    }

    // F. Visión
    if (type === 'vision_result') {
        addMessageToChat('bot', `👁️ Análisis visual: ${text}`, 'blue');
    }
};

// UI Helpers
function handleProgress(percent, msg) {
    const container = document.getElementById('progress-container');
    const bar = document.getElementById('progress-bar');
    const txt = document.getElementById('progress-text');

    if (container && msg) {
        container.style.display = 'block';
        txt.innerText = msg;
    }
    if (bar && percent) {
        bar.style.width = `${percent}%`;
    }
    if (percent >= 100) {
        setTimeout(() => container.style.display = 'none', 2000);
    }
}

function addMessageToChat(role, text, hat = null) {
    const chatContainer = document.getElementById('chat-stream');
    const msgDiv = document.createElement('div');
    const isSystem = role === 'system';

    msgDiv.className = `message ${role} ${hat ? 'hat-' + hat : ''}`;
    let content = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    if (isSystem) {
        msgDiv.innerHTML = `<div class="bubble system-bubble">${content}</div>`;
    } else {
        const avatar = role === 'user' ? '👤' : '🤖';
        msgDiv.innerHTML = `<div class="avatar">${avatar}</div><div class="bubble">${content}</div>`;
    }
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

document.addEventListener('debug-image', (e) => {
    addMessageToChat('system', `<img src="${e.detail}" style="max-height:100px; border-radius:8px;">`, 'info');
});

// Iniciar carga
worker.postMessage({ type: 'load' });