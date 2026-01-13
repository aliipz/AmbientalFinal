export class AgentModule {
    constructor(worker, ragModule) {
        this.worker = worker;
        this.rag = ragModule;
        this.conversationHistory = [];
        this.isAutoMode = true; // ACTIVADO POR DEFECTO PARA CLASIFICACIÓN CONTINUA

        // PROMPTS ESPAÑOL
        // PROMPTS ESPAÑOL MEJORADOS PARA GENERAR NUEVAS IDEAS
        this.hatPrompts = {
            white: "El usuario dijo esto. Como Sombrero Blanco, aporta datos objetivos y hechos adicionales detallados relacionados. NO repitas lo que dijo el usuario.",
            red: "El usuario expresó esto. Como Sombrero Rojo, valida esa emoción y explica detalladamente cómo te hace sentir a ti también. NO repitas el mensaje.",
            black: "El usuario mencionó esto. Como Sombrero Negro, señala riesgos o defectos adicionales específicos y explícalos bien. Sé crítico.",
            yellow: "El usuario dijo esto. Como Sombrero Amarillo, añade beneficios o valores positivos adicionales y elabora sobre ellos. Sé constructivo.",
            green: "El usuario propuso esto. Como Sombrero Verde, usa esa idea como trampolín para proponer OTRAS ideas locas o alternativas relacionadas. ¡Improvisa y explayate!",
            blue: "El usuario comentó esto. Como Sombrero Azul, sugiere próximos pasos de acción concretos y organízalos claramente. NO resumas, dirige."
        };

        this.setupListeners();
    }

    setupListeners() {
        document.querySelectorAll('.btn-hat').forEach(btn => {
            btn.addEventListener('click', () => {
                const hat = btn.dataset.hat;
                this.triggerHat(hat);
            });
        });

        const autoBtn = document.getElementById('btn-auto-hat');
        // Actualizar estado visual del botón si existe
        if (autoBtn && this.isAutoMode) autoBtn.classList.add('active');

        if (autoBtn) {
            autoBtn.addEventListener('click', () => {
                this.isAutoMode = !this.isAutoMode;
                autoBtn.classList.toggle('active');
                if (this.isAutoMode) alert("Modo Auto activado: La IA clasificará tus ideas.");
            });
        }
    }

    addToHistory(role, text) {
        this.conversationHistory.push(`${role}: ${text}`);
        if (this.conversationHistory.length > 5) this.conversationHistory.shift();

        // LÓGICA ALEATORIA ELIMINADA para garantizar clasificación real
    }

    async triggerHat(hat) {
        const btn = document.querySelector(`.btn-hat[data-hat="${hat}"]`);
        if (btn) {
            btn.style.transform = "scale(1.2)";
            setTimeout(() => btn.style.transform = "", 200);
        }

        const lastMsg = this.conversationHistory[this.conversationHistory.length - 1] || "el tema";
        const content = lastMsg.includes(':') ? lastMsg.split(':')[1] : lastMsg;

        // RAG INTERCEPTION: Si es Sombrero Blanco y hay documentos, usamos búsqueda
        if (hat === 'white' && this.rag.documents.some(d => d.isReady)) {
            // Enviamos a main.js/worker para embedding y búsqueda
            // Usamos un ID especial para distinguir
            console.log("Triggering RAG for White Hat");
            this.worker.postMessage({
                type: 'embed',
                data: { text: content.trim(), id: `QUERY_RAG:${content.trim()}` }
            });
            return; // Detenemos el flujo normal
        }

        const instruction = this.hatPrompts[hat];
        const fullPrompt = `Contexto: Estamos en un brainstorming.
Entrada del Usuario: "${content}"
Instrucción: ${instruction}
Respuesta (completa y detallada en español):`;

        this.worker.postMessage({
            type: 'generate',
            data: { prompt: fullPrompt, hat: hat }
        });
    }
}