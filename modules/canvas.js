export class CanvasModule {
    constructor(canvasId, worker) {
        this.canvasId = canvasId;
        this.worker = worker;

        this.fCanvas = new fabric.Canvas(canvasId, {
            isDrawingMode: true,
            width: 800,
            height: 600,
            backgroundColor: '#ffffff' // Importante para la visión
        });

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.setupTools();
    }

    resizeCanvas() {
        const container = document.getElementById('canvas-panel');
        if (container) {
            this.fCanvas.setWidth(container.clientWidth);
            this.fCanvas.setHeight(container.clientHeight - 50);
            this.fCanvas.renderAll();
        }
    }

    setupTools() {
        this.fCanvas.freeDrawingBrush.width = 5;
        this.fCanvas.freeDrawingBrush.color = '#000000';

        document.querySelectorAll('.tool').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const tool = btn.dataset.tool;
                if (tool === 'pen') {
                    this.fCanvas.isDrawingMode = true;
                    this.fCanvas.freeDrawingBrush.color = '#000000';
                    this.fCanvas.freeDrawingBrush.width = 5;
                } else if (tool === 'eraser') {
                    this.fCanvas.isDrawingMode = true;
                    this.fCanvas.freeDrawingBrush.color = '#ffffff';
                    this.fCanvas.freeDrawingBrush.width = 30;
                } else if (tool === 'clear') {
                    this.fCanvas.clear();
                    this.fCanvas.setBackgroundColor('#ffffff', this.fCanvas.renderAll.bind(this.fCanvas));
                }
            });
        });

        const toggleBtn = document.getElementById('toggle-canvas');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                document.getElementById('canvas-panel').classList.toggle('open');
            });
        }

        const analyzeBtn = document.getElementById('btn-analyze-canvas');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => this.analyze());
        }
    }

    async analyze() {
        if (this.fCanvas.getObjects().length === 0) {
            alert("Dibuja algo primero.");
            return;
        }

        const btn = document.getElementById('btn-analyze-canvas');
        const originalText = btn.innerHTML;
        btn.innerHTML = "<span>👁️ Mirando...</span>";
        btn.disabled = true;

        // Exportar a JPEG
        const dataURL = this.fCanvas.toDataURL({
            format: 'jpeg',
            quality: 0.8,
            multiplier: 0.5
        });

        document.dispatchEvent(new CustomEvent('debug-image', { detail: dataURL }));
        this.worker.postMessage({ type: 'vision', data: { image: dataURL } });

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 4000);
    }
}