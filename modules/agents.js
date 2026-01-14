export class AgentModule {
    constructor(worker, ragModule) {
        this.worker = worker;
        this.rag = ragModule;
        this.conversationHistory = [];
<<<<<<< HEAD
        
        // ESTADO
        this.isAutoMode = true; // Empieza en automático
        this.activeHat = null;  // Ningún sombrero fijo al inicio

        // PROMPTS (Se mantienen igual que antes...)
        this.hatPrompts = {
            white: "Eres el Sombrero Blanco (Analista Objetivo). Tu objetivo es localizar hechos concretos, cifras y datos. No des opiniones. Formato: 'Dato: [Hecho]'. Texto:",
            red: "Eres el Sombrero Rojo (Emoción e Intuición). Reacciona con corazonadas y sentimientos viscerales. No uses lógica. Formato: 'Sentimiento: [Reacción]'. Texto:",
            black: "Eres el Sombrero Negro (El Juez Crítico). Identifica riesgos, peligros y debilidades fatales. Sé pesimista. Formato: 'Riesgo: [Crítica]'. Texto:",
            yellow: "Eres el Sombrero Amarillo (Optimista). Identifica beneficios y valor añadido. Explica por qué funcionará. Formato: 'Beneficio: [Positivo]'. Texto:",
            green: "Eres el Sombrero Verde (Creatividad). Ignora limitaciones. Propone alternativas innovadoras y soluciones radicales. Formato: 'Idea: [Propuesta]'. Texto:",
            blue: "Eres el Sombrero Azul (Moderador). Sintetiza la discusión, por orden y define pasos. Formato: 'Resumen: [Síntesis]'. Texto:",
=======
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
>>>>>>> de507002fc80c4795b0864743870aed83065017e
        };

        this.setupListeners();
    }

    setupListeners() {
        const autoBtn = document.getElementById('btn-auto-hat');
        const hatButtons = document.querySelectorAll('.btn-hat');

        // 1. CLICK EN SOMBREROS DE COLORES (Modo Manual)
        hatButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const hat = btn.dataset.hat;
                
                // Cambiar estado
                this.isAutoMode = false;
                this.activeHat = hat;

                // Actualizar UI
                autoBtn.classList.remove('active');
                hatButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active'); // Iluminar el seleccionado

                console.log(`Modo Manual Activado: Sombrero ${hat.toUpperCase()}`);
            });
        });

<<<<<<< HEAD
        // 2. CLICK EN AUTO-FACILITADOR (Modo Automático)
=======
        const autoBtn = document.getElementById('btn-auto-hat');
        // Actualizar estado visual del botón si existe
        if (autoBtn && this.isAutoMode) autoBtn.classList.add('active');

>>>>>>> de507002fc80c4795b0864743870aed83065017e
        if (autoBtn) {
            // Activar visualmente al inicio
            if(this.isAutoMode) autoBtn.classList.add('active');

            autoBtn.addEventListener('click', () => {
<<<<<<< HEAD
                // Cambiar estado
                this.isAutoMode = true;
                this.activeHat = null;

                // Actualizar UI
                hatButtons.forEach(b => b.classList.remove('active'));
                autoBtn.classList.add('active');

                alert("🤖 Modo Auto activado: El sistema decidirá el mejor rol.");
=======
                this.isAutoMode = !this.isAutoMode;
                autoBtn.classList.toggle('active');
                if (this.isAutoMode) alert("Modo Auto activado: La IA clasificará tus ideas.");
>>>>>>> de507002fc80c4795b0864743870aed83065017e
            });
        }
    }

    addToHistory(role, text) {
        this.conversationHistory.push(`${role}: ${text}`);
        if (this.conversationHistory.length > 5) this.conversationHistory.shift();
<<<<<<< HEAD
=======

        // LÓGICA ALEATORIA ELIMINADA para garantizar clasificación real
>>>>>>> de507002fc80c4795b0864743870aed83065017e
    }

    // Método para llamar al worker
    triggerHat(hat, textOverride = null) {
        // Obtenemos el texto: o es nuevo (textOverride) o es el último del historial
        let content = textOverride;
        if (!content) {
            const lastMsg = this.conversationHistory[this.conversationHistory.length - 1] || "el tema";
            content = lastMsg.includes(':') ? lastMsg.split(':')[1] : lastMsg;
        }

<<<<<<< HEAD
        const instruction = this.hatPrompts[hat];
        const fullPrompt = `
### INSTRUCCIÓN DEL ROL:
${instruction}

### TEXTO DE ENTRADA:
"${content}"

### REQUISITOS:
- Responde EXCLUSIVAMENTE en español.
- Sé breve y directo.

### TU RESPUESTA:`;
=======
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
>>>>>>> de507002fc80c4795b0864743870aed83065017e

        this.worker.postMessage({
            type: 'generate',
            data: { prompt: fullPrompt, hat: hat }
        });
    }
}