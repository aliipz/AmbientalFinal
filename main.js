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

    // Solo limpiar input si fue escrito
    if (!inputText) userInput.value = '';

    addMessageToChat('user', text);
    agents.addToHistory('User', text);

    // LÓGICA DEL ORQUESTADOR
    // 1. Si está activo el modo "Auto", preguntamos al orquestador qué hacer
    if (agents.isAutoMode) {
        addMessageToChat('system', '🧠 Analizando intención...', 'info');
        worker.postMessage({ type: 'classify_intent', data: { text: text } });
        return; // Esperamos a que el worker decida el sombrero
    }

    // 2. Si hay documentos cargados, probamos RAG
    const hasDocuments = rag.documents.some(d => d.isReady);
    if (hasDocuments) {
        addMessageToChat('system', '🔍 Buscando en documentos...', 'info');
        worker.postMessage({ type: 'embed', data: text, id: `QUERY:${text}` });
    } else {
        // 3. Chat por defecto (Azul/General)
        agents.triggerHat('blue', text);
    }
};

if (btnSend) btnSend.addEventListener('click', () => handleUserMessage());
if (userInput) userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUserMessage(); });

// --- RESPUESTAS DEL WORKER ---
worker.onmessage = (e) => {
    const { status, task, type, text, percent, message, embedding, id, hat, confidence } = e.data;

    // A. Progreso y Carga
    if (status === 'progress' || type === 'progress_update') {
        handleProgress(percent, message);
    }
    if (status === 'ready') {
        const statusMap = { 'asr': 'status-whisper', 'llm': 'status-llm', 'vlm': 'status-vision', 'classifier': 'status-llm' }; // Classifier comparte status con LLM visualmente
        const el = document.getElementById(statusMap[task]);
        if (el) el.classList.add('connected');
    }

    // B. Resultado de Transcripción
    if (type === 'transcription_result') {
        const caption = document.getElementById('live-caption');
        if (caption) caption.innerText = text;
        // Procesamos como mensaje de usuario
        handleUserMessage(text);
    }

    // C. Resultado del Orquestador (INTENCIÓN DETECTADA)
    if (type === 'intent_result') {
        addMessageToChat('system', `💡 Intención detectada: Sombrero ${hat.toUpperCase()} (${(confidence*100).toFixed(0)}%)`, hat);
        // Activamos el agente correspondiente automáticamente
        agents.triggerHat(hat); 
    }

    // D. RAG
    if (type === 'embedding_result') {
        if (id && id.startsWith('QUERY:')) {
            const originalQuery = id.split('QUERY:')[1];
            const results = rag.search(embedding, 3);

            if (results.length > 0 && results[0].score > 0.35) {
                const bestChunk = results[0];
                addMessageToChat('system', `📄 <b>Fuente:</b> "...${bestChunk.text.substring(0, 100)}..."`, 'white');
                
                // Prompt RAG Específico
                const prompt = `Contexto: "${bestChunk.text}". Pregunta: "${originalQuery}". Responde basándote ÚNICAMENTE en el contexto.`;
                worker.postMessage({ type: 'generate', data: { prompt, hat: 'white' } });
            } else {
                // Si no encuentra nada, pasa al chat general
                addMessageToChat('system', '❌ No hallado en PDF. Usando conocimiento general.', 'warning');
                agents.triggerHat('blue', originalQuery);
            }
        } else {
            rag.handleEmbedding(id, embedding);
        }
    }

    // E. Generación de Texto (Agentes)
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
    
    let content = text;
    // Formateo simple de markdown negrita
    content = content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

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