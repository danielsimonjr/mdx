/**
 * View command - Opens MDX file in browser viewer
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const chalk = require('chalk');
const open = require('open');
const ora = require('ora');
const AdmZip = require('adm-zip');

// Embedded viewer HTML
const viewerHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MDX Viewer</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/11.1.1/marked.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
    <style>
        :root {
            --primary: #2563eb;
            --bg: #0f172a;
            --surface: #1e293b;
            --text: #f1f5f9;
            --text-muted: #94a3b8;
            --border: #475569;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', system-ui, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
            min-height: 100vh;
        }
        .header {
            background: var(--surface);
            border-bottom: 1px solid var(--border);
            padding: 1rem 2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        .logo {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 1.25rem;
            font-weight: 700;
        }
        .logo-icon {
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, var(--primary), #f59e0b);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 0.9rem;
        }
        .container { display: flex; height: calc(100vh - 65px); }
        .sidebar {
            width: 280px;
            background: var(--surface);
            border-right: 1px solid var(--border);
            padding: 1rem;
            overflow-y: auto;
        }
        .sidebar h3 {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
            margin-bottom: 0.75rem;
        }
        .asset-item {
            padding: 0.5rem;
            background: #334155;
            border-radius: 6px;
            margin-bottom: 0.5rem;
            font-size: 0.85rem;
            cursor: pointer;
        }
        .asset-item:hover { background: var(--border); }
        .content {
            flex: 1;
            overflow-y: auto;
            padding: 2rem 4rem;
        }
        .meta {
            margin-bottom: 2rem;
            padding-bottom: 1.5rem;
            border-bottom: 1px solid var(--border);
        }
        .meta h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
        .meta-info { color: var(--text-muted); font-size: 0.9rem; }
        .markdown-content { max-width: 800px; }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 { margin-top: 1.5rem; margin-bottom: 0.75rem; }
        .markdown-content h1 { font-size: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
        .markdown-content h2 { font-size: 1.5rem; }
        .markdown-content h3 { font-size: 1.25rem; }
        .markdown-content p { margin-bottom: 1rem; }
        .markdown-content pre { background: var(--surface); padding: 1rem; border-radius: 8px; overflow-x: auto; margin: 1rem 0; }
        .markdown-content code { font-family: 'JetBrains Mono', monospace; }
        .markdown-content img { max-width: 100%; border-radius: 8px; margin: 1rem 0; }
        .markdown-content table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
        .markdown-content th, .markdown-content td { padding: 0.75rem; border-bottom: 1px solid var(--border); text-align: left; }
        .markdown-content th { background: var(--surface); }
        .markdown-content blockquote { border-left: 4px solid var(--primary); padding: 0.5rem 1rem; margin: 1rem 0; background: var(--surface); }
        .markdown-content a { color: var(--primary); }
        .markdown-content ul, .markdown-content ol { margin: 1rem 0; padding-left: 1.5rem; }
    </style>
</head>
<body>
    <header class="header">
        <div class="logo">
            <div class="logo-icon">MDX</div>
            <span id="docTitle">MDX Viewer</span>
        </div>
        <div id="docVersion" style="color: var(--text-muted);"></div>
    </header>
    <div class="container">
        <aside class="sidebar">
            <h3>Assets</h3>
            <div id="assetList"></div>
        </aside>
        <main class="content">
            <div class="meta">
                <h1 id="title"></h1>
                <p id="description" style="color: var(--text-muted); font-size: 1.1rem;"></p>
                <div class="meta-info" id="metaInfo"></div>
            </div>
            <article class="markdown-content" id="markdownContent"></article>
        </main>
    </div>
    <script>
        const MDX_DATA = __MDX_DATA__;

        document.getElementById('docTitle').textContent = MDX_DATA.manifest.document?.title || 'MDX Document';
        document.getElementById('title').textContent = MDX_DATA.manifest.document?.title || 'Untitled';
        document.getElementById('description').textContent = MDX_DATA.manifest.document?.description || '';
        document.getElementById('docVersion').textContent = 'v' + (MDX_DATA.manifest.document?.version || '1.0.0');

        const doc = MDX_DATA.manifest.document || {};
        const authors = doc.authors?.map(a => a.name).join(', ') || 'Unknown';
        const modified = doc.modified ? new Date(doc.modified).toLocaleDateString() : '';
        document.getElementById('metaInfo').innerHTML = \`\${authors} &bull; \${modified}\`;

        // Render markdown
        let content = MDX_DATA.content || '';
        for (const [assetPath, dataUrl] of Object.entries(MDX_DATA.assets || {})) {
            content = content.replace(new RegExp(assetPath.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'g'), dataUrl);
        }
        marked.setOptions({
            highlight: (code, lang) => {
                if (lang && hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return hljs.highlightAuto(code).value;
            }
        });
        document.getElementById('markdownContent').innerHTML = marked.parse(content);

        // Asset list
        const assetList = document.getElementById('assetList');
        const assets = MDX_DATA.manifest.assets || {};
        const icons = { images: '🖼️', video: '🎬', audio: '🎵', models: '📦', data: '📊', documents: '📄' };
        for (const [category, items] of Object.entries(assets)) {
            for (const item of items) {
                const name = item.path.split('/').pop();
                const div = document.createElement('div');
                div.className = 'asset-item';
                div.innerHTML = \`\${icons[category] || '📁'} \${name}\`;
                div.onclick = () => {
                    const url = MDX_DATA.assets[item.path];
                    if (url) window.open(url, '_blank');
                };
                assetList.appendChild(div);
            }
        }
    </script>
</body>
</html>`;

async function viewCommand(file, options) {
    const spinner = ora('Loading MDX file...').start();

    try {
        const filePath = path.resolve(file);

        if (!fs.existsSync(filePath)) {
            spinner.fail(chalk.red(`File not found: ${filePath}`));
            process.exit(1);
        }

        // Read and parse MDX file
        const zip = new AdmZip(filePath);
        const entries = zip.getEntries();

        // Extract manifest
        const manifestEntry = entries.find(e => e.entryName === 'manifest.json');
        if (!manifestEntry) {
            spinner.fail(chalk.red('Invalid MDX file: missing manifest.json'));
            process.exit(1);
        }
        const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));

        // Extract content
        const entryPoint = manifest.content?.entry_point || 'document.md';
        const contentEntry = entries.find(e => e.entryName === entryPoint);
        const content = contentEntry ? contentEntry.getData().toString('utf8') : '';

        // Extract assets as data URLs
        const assets = {};
        for (const entry of entries) {
            if (entry.entryName.startsWith('assets/') && !entry.isDirectory) {
                const data = entry.getData();
                const ext = path.extname(entry.entryName).toLowerCase();
                const mimeTypes = {
                    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
                    '.mp4': 'video/mp4', '.webm': 'video/webm',
                    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
                    '.pdf': 'application/pdf', '.json': 'application/json',
                    '.csv': 'text/csv', '.gltf': 'model/gltf+json'
                };
                const mime = mimeTypes[ext] || 'application/octet-stream';
                assets[entry.entryName] = `data:${mime};base64,${data.toString('base64')}`;
            }
        }

        // Create HTML with embedded data
        const mdxData = { manifest, content, assets };
        const html = viewerHTML.replace('__MDX_DATA__', JSON.stringify(mdxData));

        // Start local server
        const port = parseInt(options.port) || 3000;
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
        });

        server.listen(port, () => {
            spinner.succeed(chalk.green(`Viewer running at http://localhost:${port}`));
            console.log(chalk.gray('Press Ctrl+C to stop the server\n'));

            // Open in browser
            open(`http://localhost:${port}`);
        });

        // Handle shutdown
        process.on('SIGINT', () => {
            console.log(chalk.yellow('\nShutting down server...'));
            server.close();
            process.exit(0);
        });

    } catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
    }
}

module.exports = viewCommand;
