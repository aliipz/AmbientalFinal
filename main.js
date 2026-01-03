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

// Controles
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

const handleUserMessage = () => {
    const text = userInput.value.trim();
    if (!text) return;

    addMessageToChat('user', text);
    userInput.value = '';
    agents.addToHistory('User', text);

    // RAG: Buscar en docs si existen
    const hasDocuments = rag.documents.some(d => d.isReady);
    if (hasDocuments) {
        addMessageToChat('system', '🔍 Buscando en documentos...', 'info');
        worker.postMessage({ type: 'embed', data: text, id: `QUERY:${text}` });
    } else {
        // Chat normal (Agente Azul)
        worker.postMessage({
            type: 'generate',
            data: { prompt: `Usuario dice: "${text}". Responde útilmente en español:`, hat: 'blue' }
        });
    }
};

if (btnSend) btnSend.addEventListener('click', handleUserMessage);
if (userInput) userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUserMessage(); });


// --- RESPUESTAS DEL WORKER ---
worker.onmessage = (e) => {
    const { status, task, type, text, percent, message, embedding, id, hat } = e.data;

    // 1. BARRA DE PROGRESO
    if (status === 'progress') {
        const container = document.getElementById('progress-container');
        const txt = document.getElementById('progress-text');
        if (container) container.style.display = 'block';
        if (txt) txt.innerText = message;
    }

    if (type === 'progress_update') {
        const bar = document.getElementById('progress-bar');
        if (bar) {
            bar.style.width = `${percent.toFixed(1)}%`;
            if (percent > 99) bar.style.backgroundColor = '#22c55e';
            else bar.style.backgroundColor = '#6366f1';
        }
    }

    if (status === 'complete') {
        const container = document.getElementById('progress-container');
        if (container) {
            setTimeout(() => {
                container.style.opacity = '0';
                setTimeout(() => container.style.display = 'none', 500);
            }, 1500);
        }
        addMessageToChat('system', '✅ Sistema cargado y listo.', 'info');
    }

    // 2. ESTADO
    if (status === 'ready') {
        const statusMap = { 'asr': 'status-whisper', 'llm': 'status-llm', 'vlm': 'status-vision' };
        const el = document.getElementById(statusMap[task]);
        if (el) {
            el.classList.remove('disconnected', 'busy');
            el.classList.add('connected');
        }
    }

    // 3. TRANSCRIPCIÓN
    if (type === 'transcription_result') {
        const caption = document.getElementById('live-caption');
        if (caption) caption.innerText = text;
        addMessageToChat('user', text);
        agents.addToHistory('User', text);
    }

    // 4. RESULTADOS RAG
    if (type === 'embedding_result') {
        if (id && id.startsWith('QUERY:')) {
            const originalQuery = id.split('QUERY:')[1];
            const results = rag.search(embedding, 3);

            if (results.length > 0 && results[0].score > 0.3) {
                const bestChunk = results[0];
                addMessageToChat('system', `📄 <b>Fuente (${(bestChunk.score * 100).toFixed(0)}%):</b><br>"...${bestChunk.text.substring(0, 120)}..."`, 'white');

                const prompt = `Contexto: "${bestChunk.text}". Pregunta: "${originalQuery}". Usando el contexto, responde en español:`;
                worker.postMessage({ type: 'generate', data: { prompt, hat: 'white' } });
            } else {
                addMessageToChat('system', '❌ No encontré esa información en el PDF.', 'warning');
            }
        } else {
            rag.handleEmbedding(id, embedding);
        }
    }

    // 5. GENERACIÓN
    if (type === 'generation_result') {
        addMessageToChat('bot', text, hat);
        agents.addToHistory('AI', text);
    }

    // 6. VISIÓN
    if (type === 'vision_result') {
        addMessageToChat('bot', `👁️ ${text}`, 'blue');
    }

    // 7. DEBUG
    if (type === 'debug') {
        console.log(text);
        if (text.includes('❌')) addMessageToChat('system', text, 'warning');
    }
};

document.addEventListener('debug-image', (e) => {
    addMessageToChat('system', `<img src="${e.detail}" style="max-height:100px; border:1px solid #555;">`, 'info');
});

function addMessageToChat(role, text, hat = null) {
    const chatContainer = document.getElementById('chat-stream');
    const msgDiv = document.createElement('div');

    if (role === 'system') {
        msgDiv.className = `message system ${hat || ''}`;
        msgDiv.innerHTML = `<div class="bubble system-bubble">${text}</div>`;
    } else {
        msgDiv.className = `message ${role} ${hat ? 'hat-' + hat : ''}`;
        const avatar = role === 'user' ? '👤' : '🤖';
        msgDiv.innerHTML = `<div class="avatar">${avatar}</div><div class="bubble">${text}</div>`;
    }
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

worker.postMessage({ type: 'load', model: 'all' });