export class RAGModule {
    constructor(worker) {
        this.worker = worker;
        this.documents = []; // { id, name, chunks: [{text, vector}] }
        this.chunkSize = 500;

        // Setup Drag & Drop
        this.setupDragDrop();
    }

    setupDragDrop() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        // Click to upload
        dropZone.addEventListener('click', () => {
            // Avoid triggering if clicking child elements bubbling up if needed, 
            // but here the whole zone is clickable.
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });

        // Drag handlers
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', (e) => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Stop click event from firing on drop if overlap
            dropZone.classList.remove('dragover');

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });
    }

    async handleFile(file) {
        if (file.type !== 'application/pdf') {
            alert('Solo se soportan archivos PDF.');
            return;
        }

        console.log("Procesando PDF:", file.name);

        // Update UI
        const docList = document.getElementById('document-list');
        const docItem = document.createElement('div');
        docItem.className = 'status-item';
        docItem.innerHTML = `<span>${file.name}</span> <span class="status-dot busy"></span>`;
        docList.appendChild(docItem);

        try {
            const text = await this.extractTextFromPDF(file);
            console.log("Longitud del texto extraído:", text.length);

            const chunks = this.chunkText(text, this.chunkSize);

            // Store document metadata
            const docId = Date.now().toString();
            const documentEntry = {
                id: docId,
                name: file.name,
                chunks: chunks.map((text, i) => ({ id: `${docId}_${i}`, text, vector: null })),
                isReady: false
            };
            this.documents.push(documentEntry);

            // Generate Embeddings for each chunk
            for (let i = 0; i < chunks.length; i++) {
                this.worker.postMessage({
                    type: 'embed',
                    data: chunks[i],
                    id: `${docId}_${i}`
                });
            }

        } catch (err) {
            console.error("Error leyendo PDF:", err);
            docItem.querySelector('.status-dot').className = 'status-dot error';
        }
    }

    async extractTextFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + ' ';
        }
        return fullText;
    }

    chunkText(text, size) {
        const chunks = [];
        for (let i = 0; i < text.length; i += size) {
            chunks.push(text.slice(i, i + size));
        }
        return chunks;
    }

    handleEmbedding(id, vector) {
        // Find chunk and assign vector
        const [docId, chunkIndex] = id.split('_');
        const doc = this.documents.find(d => d.id === docId);
        if (doc) {
            const chunk = doc.chunks.find(c => c.id === id);
            if (chunk) {
                chunk.vector = vector;
            }

            // Check if all chunks in doc have vectors
            const allReady = doc.chunks.every(c => c.vector !== null);
            if (allReady && !doc.isReady) {
                doc.isReady = true;
                console.log(`Documento ${doc.name} indexado completamente.`);
                // Update UI
                this.updateDocCount();
                // Find the docItem and turn green (simplified selector)
                // In real app, store reference to DOM element.
            }
        }
    }

    updateDocCount() {
        document.getElementById('doc-count').innerText = this.documents.filter(d => d.isReady).length;
    }

    cosineSimilarity(a, b) {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    async retrieve(queryText, topK = 3) {
        return [];
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
