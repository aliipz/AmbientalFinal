export class RAGModule {
    constructor(worker) {
        this.worker = worker;
        this.documents = []; 
        this.chunkSize = 600; // Aumentado ligeramente para mejor contexto
        this.overlap = 150;   // Solapamiento para no perder frases en el corte
        
        this.setupDragDrop();
    }

    setupDragDrop() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        dropZone.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.handleFile(e.target.files[0]);
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', (e) => dropZone.classList.remove('dragover'));

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.handleFile(e.dataTransfer.files[0]);
        });
    }

    async handleFile(file) {
        if (file.type !== 'application/pdf') {
            alert('Solo se soportan archivos PDF.');
            return;
        }

        const docList = document.getElementById('document-list');
        const docItem = document.createElement('div');
        docItem.className = 'status-item';
        docItem.innerHTML = `<span>${file.name}</span> <span class="status-dot busy"></span>`;
        docList.appendChild(docItem);

        try {
            const text = await this.extractTextFromPDF(file);
            console.log("Texto extraído, longitud:", text.length);

            // Usamos la nueva función con overlap
            const chunks = this.chunkText(text, this.chunkSize, this.overlap);

            const docId = Date.now().toString();
            const documentEntry = {
                id: docId,
                name: file.name,
                chunks: chunks.map((txt, i) => ({ id: `${docId}_${i}`, text: txt, vector: null })),
                isReady: false
            };
            this.documents.push(documentEntry);

            // Generar Embeddings
            for (let i = 0; i < chunks.length; i++) {
                this.worker.postMessage({
                    type: 'embed',
                    data: { text: chunks[i], id: `${docId}_${i}` }
                });
            }

            // Referencia visual para actualizar cuando termine
            documentEntry.uiElement = docItem;

        } catch (err) {
            console.error("Error PDF:", err);
            docItem.querySelector('.status-dot').className = 'status-dot error';
        }
    }

    async extractTextFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        // Asumimos que pdfjsLib está cargado en el HTML globalmente
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + ' ';
        }
        return fullText.replace(/\s+/g, ' ').trim(); // Limpieza básica
    }

    // MEJORA: Chunking con solapamiento
    chunkText(text, size, overlap) {
        const chunks = [];
        let start = 0;
        
        while (start < text.length) {
            const end = Math.min(start + size, text.length);
            chunks.push(text.slice(start, end));
            
            // Avanzamos size - overlap para crear el solapamiento
            start += (size - overlap);
            
            // Evitar bucles infinitos al final
            if (start >= text.length) break;
        }
        return chunks;
    }

    handleEmbedding(id, vector) {
        const [docId, chunkIndex] = id.split('_');
        const doc = this.documents.find(d => d.id === docId);
        
        if (doc) {
            const chunk = doc.chunks.find(c => c.id === id);
            if (chunk) chunk.vector = vector;

            if (doc.chunks.every(c => c.vector !== null) && !doc.isReady) {
                doc.isReady = true;
                this.updateDocCount();
                if (doc.uiElement) {
                    const dot = doc.uiElement.querySelector('.status-dot');
                    dot.className = 'status-dot connected'; // Verde
                }
            }
        }
    }

    updateDocCount() {
        const count = document.getElementById('doc-count');
        if (count) count.innerText = this.documents.filter(d => d.isReady).length;
    }

    cosineSimilarity(a, b) {
        if (!a || !b) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    search(queryVector, topK = 3) {
        let allChunks = [];
        this.documents.forEach(doc => {
            if (doc.isReady) allChunks.push(...doc.chunks);
        });

        const scored = allChunks.map(chunk => ({
            text: chunk.text,
            score: this.cosineSimilarity(queryVector, chunk.vector)
        }));

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    }
}