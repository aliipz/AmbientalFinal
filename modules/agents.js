export class AgentModule {
    constructor(worker, ragModule) {
        this.worker = worker;
        this.rag = ragModule;
        this.conversationHistory = [];
        this.isAutoMode = false;

        // PROMPTS ESPAÑOL
        this.hatPrompts = {
            // Sombrero Blanco: Neutro, busca datos. (Clave para RAG)
            white: "Eres el Sombrero Blanco (Analista Objetivo). Tu objetivo es localizar hechos concretos, cifras y datos en el texto proporcionado. No des opiniones ni emociones. Si la información no está, indica que faltan datos. Formato de respuesta: 'Dato: [Hecho encontrado]'. Texto a analizar:",

            // Sombrero Rojo: Emocional, intuición.
            red: "Eres el Sombrero Rojo (Emoción e Intuición). Reacciona al siguiente texto basándote en corazonadas, sentimientos viscerales o impresiones inmediatas. No justifiques tu respuesta con lógica. ¿Qué te hace sentir esto (miedo, entusiasmo, duda)? Formato de respuesta: 'Sentimiento: [Tu reacción]'. Texto:",

            // Sombrero Negro: Crítico, cauteloso, pesimista.
            black: "Eres el Sombrero Negro (El Juez Crítico). Tu trabajo es identificar riesgos, peligros, debilidades legales o problemas fatales en la siguiente idea. Sé pesimista y cauteloso. Formato de respuesta: 'Riesgo: [Crítica principal]'. Idea a criticar:",

            // Sombrero Amarillo: Optimista, busca beneficios.
            yellow: "Eres el Sombrero Amarillo (Optimista). Identifica los beneficios, el valor añadido y los aspectos positivos de esta idea. Explica por qué funcionará y qué ganaremos. Formato de respuesta: 'Beneficio: [Aspecto positivo]'. Idea a analizar:",

            // Sombrero Verde: Creativo, provocador.
            green: "Eres el Sombrero Verde (Creatividad Lateral). Ignora las limitaciones actuales. Propone una alternativa innovadora, una mejora radical o una solución 'fuera de la caja' basada en lo siguiente. Formato de respuesta: 'Idea: [Nueva propuesta]'. Contexto:",

            // Sombrero Azul: Control, resumen, moderador.
            blue: "Eres el Sombrero Azul (Moderador y Organización). Tu tarea es sintetizar la discusión, poner orden y definir el siguiente paso o conclusión lógica. Mantén la calma y la estructura. Formato de respuesta: 'Resumen: [Síntesis breve]'. Discusión:",
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
        const fullPrompt = `
### INSTRUCCIÓN DEL ROL:
${instruction}

### TEXTO DE ENTRADA (Analiza solo esto):
"${content}"

### REQUISITOS:
- No inventes información externa.
- Responde EXCLUSIVAMENTE en español.
- Sé breve y directo.

### TU RESPUESTA:`

        this.worker.postMessage({
            type: 'generate',
            data: { prompt: fullPrompt, hat: hat }
        });
    }
}