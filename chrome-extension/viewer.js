/**
 * MDX Viewer - Chrome Extension
 * Read-only viewer for MDX (Markdown eXtended Container) files
 */

class MDXViewer {
    constructor() {
        this.document = null;
        this.assets = new Map();
        this.currentAsset = null;

        this.init();
    }

    init() {
        this.setupElements();
        this.setupEventListeners();
        this.setupDragDrop();
    }

    setupElements() {
        this.elements = {
            // Screens
            welcomeScreen: document.getElementById('welcomeScreen'),
            documentView: document.getElementById('documentView'),
            documentContent: document.getElementById('documentContent'),

            // Header
            docTitle: document.getElementById('docTitle'),
            docMeta: document.getElementById('docMeta'),
            btnOpen: document.getElementById('btnOpen'),
            btnOpenWelcome: document.getElementById('btnOpenWelcome'),
            btnExport: document.getElementById('btnExport'),
            btnInfo: document.getElementById('btnInfo'),

            // Sidebar
            outlineList: document.getElementById('outlineList'),
            assetList: document.getElementById('assetList'),
            assetCount: document.getElementById('assetCount'),

            // Status
            statusLeft: document.getElementById('statusLeft'),
            statusRight: document.getElementById('statusRight'),

            // File input
            fileInput: document.getElementById('fileInput'),

            // Modals
            infoModal: document.getElementById('infoModal'),
            infoModalBody: document.getElementById('infoModalBody'),
            assetModal: document.getElementById('assetModal'),
            assetModalTitle: document.getElementById('assetModalTitle'),
            assetModalBody: document.getElementById('assetModalBody'),
            exportModal: document.getElementById('exportModal'),

            // Drop overlay
            dropOverlay: document.getElementById('dropOverlay')
        };
    }

    setupEventListeners() {
        // Open buttons
        this.elements.btnOpen.onclick = () => this.elements.fileInput.click();
        this.elements.btnOpenWelcome.onclick = () => this.elements.fileInput.click();
        this.elements.fileInput.onchange = (e) => {
            if (e.target.files[0]) {
                this.openDocument(e.target.files[0]);
            }
        };

        // Export button
        this.elements.btnExport.onclick = () => this.openModal('exportModal');

        // Info button
        this.elements.btnInfo.onclick = () => this.showDocumentInfo();

        // Modal close buttons
        document.getElementById('closeInfoModal').onclick = () => this.closeModal('infoModal');
        document.getElementById('closeInfoModalBtn').onclick = () => this.closeModal('infoModal');
        document.getElementById('closeAssetModal').onclick = () => this.closeModal('assetModal');
        document.getElementById('closeAssetModalBtn').onclick = () => this.closeModal('assetModal');
        document.getElementById('closeExportModal').onclick = () => this.closeModal('exportModal');

        // Download asset button
        document.getElementById('downloadAsset').onclick = () => this.downloadCurrentAsset();

        // Export options
        document.querySelectorAll('.export-option').forEach(btn => {
            btn.onclick = () => this.exportDocument(btn.dataset.format);
        });

        // Click outside modal to close
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                }
            };
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'o') {
                    e.preventDefault();
                    this.elements.fileInput.click();
                }
            }
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active').forEach(m => {
                    m.classList.remove('active');
                });
            }
        });
    }

    setupDragDrop() {
        // Prevent default drag behaviors on document
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.body.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Show overlay on drag enter
        document.body.addEventListener('dragenter', () => {
            this.elements.dropOverlay.classList.add('active');
        });

        // Hide overlay on drag leave (from overlay)
        this.elements.dropOverlay.addEventListener('dragleave', (e) => {
            if (e.target === this.elements.dropOverlay) {
                this.elements.dropOverlay.classList.remove('active');
            }
        });

        // Handle drop
        this.elements.dropOverlay.addEventListener('drop', (e) => {
            this.elements.dropOverlay.classList.remove('active');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.openDocument(files[0]);
            }
        });
    }

    // Document Operations
    async openDocument(file) {
        if (!file) return;

        try {
            this.elements.statusLeft.textContent = 'Opening...';

            const zip = new JSZip();
            const contents = await zip.loadAsync(file);

            // Read manifest
            const manifestFile = contents.file('manifest.json');
            if (!manifestFile) {
                throw new Error('Invalid MDX file: missing manifest.json');
            }

            const manifest = JSON.parse(await manifestFile.async('text'));

            // Read content
            const entryPoint = manifest.content?.entry_point || 'document.md';
            const contentFile = contents.file(entryPoint);
            const content = contentFile ? await contentFile.async('text') : '';

            // Read assets
            this.assets.clear();
            for (const [path, entry] of Object.entries(contents.files)) {
                if (path.startsWith('assets/') && !entry.dir) {
                    const data = await entry.async('arraybuffer');
                    this.assets.set(path, data);
                }
            }

            // Store document data
            this.document = { manifest, content, filename: file.name };

            // Update UI
            this.showDocument();
            this.elements.statusLeft.textContent = `Opened: ${file.name}`;

        } catch (error) {
            console.error('Error opening file:', error);
            this.elements.statusLeft.textContent = 'Error opening file';
            alert('Error opening file: ' + error.message);
        }
    }

    showDocument() {
        // Hide welcome, show document view
        this.elements.welcomeScreen.classList.add('hidden');
        this.elements.documentView.classList.remove('hidden');

        // Update header
        const doc = this.document.manifest.document;
        this.elements.docTitle.textContent = doc.title || 'Untitled';

        const meta = [];
        if (doc.version) meta.push(`v${doc.version}`);
        if (doc.authors?.[0]?.name) meta.push(`by ${doc.authors[0].name}`);
        this.elements.docMeta.textContent = meta.join(' • ');

        // Enable buttons
        this.elements.btnExport.disabled = false;
        this.elements.btnInfo.disabled = false;

        // Render content
        this.renderContent();

        // Update sidebar
        this.updateOutline();
        this.updateAssetList();

        // Update status
        this.updateStatus();
    }

    renderContent() {
        // Configure marked for GFM (GitHub Flavored Markdown)
        marked.setOptions({
            gfm: true,
            breaks: false
        });

        // Render markdown
        let html = marked.parse(this.document.content);

        // Set content
        this.elements.documentContent.innerHTML = html;

        // Apply syntax highlighting to code blocks
        this.elements.documentContent.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });

        // Replace asset paths with blob URLs
        this.resolveAssetReferences();
    }

    resolveAssetReferences() {
        // Replace image sources
        const images = this.elements.documentContent.querySelectorAll('img');
        images.forEach(img => {
            const src = img.getAttribute('src');
            if (src && src.startsWith('assets/')) {
                const data = this.assets.get(src);
                if (data) {
                    const mimeType = this.getMimeType(src);
                    const blob = new Blob([data], { type: mimeType });
                    img.src = URL.createObjectURL(blob);
                }
            }
        });

        // Replace anchor hrefs for internal assets
        const links = this.elements.documentContent.querySelectorAll('a[href^="assets/"]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            link.onclick = (e) => {
                e.preventDefault();
                this.previewAsset(href);
            };
        });
    }

    updateOutline() {
        const headings = this.elements.documentContent.querySelectorAll('h1, h2, h3');

        if (headings.length === 0) {
            this.elements.outlineList.innerHTML = '<div class="empty-state">No headings</div>';
            return;
        }

        let html = '';
        headings.forEach((heading, index) => {
            const level = heading.tagName.toLowerCase().charAt(1);
            const text = heading.textContent;
            html += `
                <div class="outline-item" data-level="${level}" data-index="${index}">
                    <span class="level">H${level}</span>
                    <span class="text">${text}</span>
                </div>
            `;
        });

        this.elements.outlineList.innerHTML = html;

        // Add click handlers
        this.elements.outlineList.querySelectorAll('.outline-item').forEach(item => {
            item.onclick = () => {
                const index = parseInt(item.dataset.index);
                const headings = this.elements.documentContent.querySelectorAll('h1, h2, h3');
                if (headings[index]) {
                    headings[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            };
        });
    }

    updateAssetList() {
        const count = this.assets.size;
        this.elements.assetCount.textContent = count;

        if (count === 0) {
            this.elements.assetList.innerHTML = '<div class="empty-state">No assets</div>';
            return;
        }

        const icons = {
            images: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
            video: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
            audio: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
            data: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>',
            models: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>',
            documents: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
            default: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>'
        };

        let html = '';
        for (const [path, data] of this.assets) {
            const category = path.split('/')[1] || 'other';
            const name = path.split('/').pop();
            const size = this.formatSize(data.byteLength);
            const icon = icons[category] || icons.default;

            html += `
                <div class="asset-item" data-path="${path}">
                    <span class="icon">${icon}</span>
                    <span class="name">${name}</span>
                    <span class="size">${size}</span>
                </div>
            `;
        }

        this.elements.assetList.innerHTML = html;

        // Add click handlers
        this.elements.assetList.querySelectorAll('.asset-item').forEach(item => {
            item.onclick = () => this.previewAsset(item.dataset.path);
        });
    }

    updateStatus() {
        const text = this.elements.documentContent.textContent || '';
        const words = text.trim().split(/\s+/).filter(w => w).length;
        const readingTime = Math.ceil(words / 200);

        this.elements.statusRight.textContent =
            `${words.toLocaleString()} words • ${readingTime} min read • ${this.assets.size} assets`;
    }

    // Asset Preview
    previewAsset(path) {
        const data = this.assets.get(path);
        if (!data) {
            alert('Asset not found: ' + path);
            return;
        }

        this.currentAsset = { path, data };
        const name = path.split('/').pop();
        const mimeType = this.getMimeType(path);
        const category = path.split('/')[1];

        this.elements.assetModalTitle.textContent = name;

        let preview = '';
        if (category === 'images') {
            const blob = new Blob([data], { type: mimeType });
            const url = URL.createObjectURL(blob);
            preview = `<div class="asset-preview"><img src="${url}" alt="${name}"></div>`;
        } else if (category === 'video') {
            const blob = new Blob([data], { type: mimeType });
            const url = URL.createObjectURL(blob);
            preview = `<div class="asset-preview"><video src="${url}" controls></video></div>`;
        } else if (category === 'audio') {
            const blob = new Blob([data], { type: mimeType });
            const url = URL.createObjectURL(blob);
            preview = `<div class="asset-preview"><audio src="${url}" controls></audio></div>`;
        } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
            const text = new TextDecoder().decode(data);
            preview = `<div class="asset-preview"><pre>${this.escapeHtml(text)}</pre></div>`;
        } else {
            preview = `
                <div class="asset-preview">
                    <div style="text-align:center;color:var(--text-muted);">
                        <p>Preview not available</p>
                        <p style="font-size:0.8rem;">Type: ${mimeType}<br>Size: ${this.formatSize(data.byteLength)}</p>
                    </div>
                </div>
            `;
        }

        this.elements.assetModalBody.innerHTML = preview;
        this.openModal('assetModal');
    }

    downloadCurrentAsset() {
        if (!this.currentAsset) return;

        const { path, data } = this.currentAsset;
        const name = path.split('/').pop();
        const mimeType = this.getMimeType(path);

        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();

        URL.revokeObjectURL(url);
    }

    // Document Info
    showDocumentInfo() {
        const doc = this.document.manifest.document;

        const formatDate = (iso) => {
            if (!iso) return '—';
            return new Date(iso).toLocaleString();
        };

        let html = `
            <table class="info-table">
                <tr><th>Title</th><td>${doc.title || '—'}</td></tr>
                <tr><th>Subtitle</th><td>${doc.subtitle || '—'}</td></tr>
                <tr><th>Description</th><td>${doc.description || '—'}</td></tr>
                <tr><th>Authors</th><td>${doc.authors?.map(a => a.name).join(', ') || '—'}</td></tr>
                <tr><th>Version</th><td>${doc.version || '—'}</td></tr>
                <tr><th>Language</th><td>${doc.language || '—'}</td></tr>
                <tr><th>Created</th><td>${formatDate(doc.created)}</td></tr>
                <tr><th>Modified</th><td>${formatDate(doc.modified)}</td></tr>
                <tr><th>MDX Version</th><td>${this.document.manifest.mdx_version || '—'}</td></tr>
                <tr><th>Document ID</th><td style="font-size:0.75rem;font-family:monospace;">${doc.id || '—'}</td></tr>
            </table>
        `;

        if (doc.keywords?.length) {
            html += `<div style="margin-top:1rem;"><strong>Keywords:</strong> ${doc.keywords.join(', ')}</div>`;
        }

        this.elements.infoModalBody.innerHTML = html;
        this.openModal('infoModal');
    }

    // Export
    async exportDocument(format) {
        this.closeModal('exportModal');

        try {
            if (format === 'html') {
                await this.exportAsHTML();
            } else if (format === 'markdown') {
                await this.exportAsMarkdown();
            } else if (format === 'json') {
                this.exportAsJSON();
            }
            this.elements.statusLeft.textContent = `Exported as ${format.toUpperCase()}`;
        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed: ' + error.message);
        }
    }

    async exportAsHTML() {
        const title = this.document.manifest.document.title || 'Document';
        const content = this.elements.documentContent.innerHTML;

        const html = `<!DOCTYPE html>
<html lang="${this.document.manifest.document.language || 'en'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
        h1, h2, h3 { margin-top: 1.5em; }
        pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; }
        code { font-family: monospace; }
        img { max-width: 100%; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    </style>
</head>
<body>
${content}
</body>
</html>`;

        this.downloadFile(html, `${this.slugify(title)}.html`, 'text/html');
    }

    async exportAsMarkdown() {
        const title = this.document.manifest.document.title || 'Document';
        this.downloadFile(this.document.content, `${this.slugify(title)}.md`, 'text/markdown');
    }

    exportAsJSON() {
        const title = this.document.manifest.document.title || 'Document';
        const json = JSON.stringify(this.document.manifest, null, 2);
        this.downloadFile(json, `${this.slugify(title)}-manifest.json`, 'application/json');
    }

    // Utilities
    openModal(id) {
        document.getElementById(id).classList.add('active');
    }

    closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    getMimeType(path) {
        const ext = path.split('.').pop().toLowerCase();
        const mimeTypes = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'pdf': 'application/pdf',
            'json': 'application/json',
            'csv': 'text/csv',
            'txt': 'text/plain',
            'gltf': 'model/gltf+json',
            'glb': 'model/gltf-binary'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    slugify(text) {
        return text.toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize viewer
const viewer = new MDXViewer();
