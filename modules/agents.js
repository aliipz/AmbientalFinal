export class AgentModule {
    constructor(worker, ragModule) {
        this.worker = worker;
        this.rag = ragModule;
        this.conversationHistory = [];
        this.isAutoMode = true;

        // PROMPTS ESPAÑOL
        this.hatPrompts = {
            white: "Actúa como analista. Proporciona solo hechos objetivos y datos sobre",
            red: "Actúa emocionalmente. Expresa una intuición o sentimiento fuerte sobre",
            black: "Actúa como crítico cauteloso. Identifica riesgos y problemas potenciales de",
            yellow: "Actúa con optimismo. Destaca los beneficios y valores positivos de",
            green: "Sé creativo. Sugiere una idea alternativa innovadora para",
            blue: "Actúa como moderador. Resume y organiza brevemente la discusión sobre"
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
        if (autoBtn) {
            autoBtn.addEventListener('click', () => {
                this.isAutoMode = !this.isAutoMode;
                autoBtn.classList.toggle('active');
                if (this.isAutoMode) alert("Modo Auto activado: La IA analizará tu intención.");
            });
        }
    }

    addToHistory(role, text) {
        this.conversationHistory.push(`${role}: ${text}`);
        if (this.conversationHistory.length > 5) this.conversationHistory.shift();
        
        // Se eliminó la lógica aleatoria (Math.random) para evitar intervenciones sin sentido.
    }

    async triggerHat(hat) {
        const btn = document.querySelector(`.btn-hat[data-hat="${hat}"]`);
        if (btn) {
            btn.style.transform = "scale(1.2)";
            setTimeout(() => btn.style.transform = "", 200);
        }

        const lastMsg = this.conversationHistory[this.conversationHistory.length - 1] || "el tema";
        const content = lastMsg.includes(':') ? lastMsg.split(':')[1] : lastMsg;

        const instruction = this.hatPrompts[hat];
        const fullPrompt = `${instruction}: "${content}". Responde en español brevemente:`;

        this.worker.postMessage({
            type: 'generate',
            data: { prompt: fullPrompt, hat: hat }
        });
    }
}