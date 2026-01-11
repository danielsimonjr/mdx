/**
 * Edit command - Interactive MDX editor
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

class MDXEditor {
    constructor(filePath) {
        this.filePath = filePath;
        this.zip = null;
        this.manifest = null;
        this.content = '';
        this.modified = false;
    }

    async load() {
        const spinner = ora('Loading MDX file...').start();

        try {
            this.zip = new AdmZip(this.filePath);
            const entries = this.zip.getEntries();

            // Load manifest
            const manifestEntry = entries.find(e => e.entryName === 'manifest.json');
            if (!manifestEntry) {
                throw new Error('Invalid MDX file: missing manifest.json');
            }
            this.manifest = JSON.parse(manifestEntry.getData().toString('utf8'));

            // Load content
            const entryPoint = this.manifest.content?.entry_point || 'document.md';
            const contentEntry = entries.find(e => e.entryName === entryPoint);
            this.content = contentEntry ? contentEntry.getData().toString('utf8') : '';

            spinner.succeed(chalk.green('MDX file loaded'));
            return true;
        } catch (error) {
            spinner.fail(chalk.red(`Error: ${error.message}`));
            return false;
        }
    }

    async run() {
        if (!await this.load()) return;

        console.log(chalk.cyan('\n╔═══════════════════════════════════════════════════════════╗'));
        console.log(chalk.cyan('║') + '  ' + chalk.bold.white('MDX Interactive Editor') + '                                  ' + chalk.cyan('║'));
        console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════╝\n'));

        console.log(chalk.white('Document: ') + chalk.yellow(this.manifest.document?.title || 'Untitled'));
        console.log(chalk.white('File: ') + chalk.gray(path.basename(this.filePath)));
        console.log('');

        await this.mainMenu();
    }

    async mainMenu() {
        while (true) {
            const { action } = await inquirer.prompt([{
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    { name: '📄 Edit Document Metadata', value: 'metadata' },
                    { name: '✏️  Edit Content', value: 'content' },
                    { name: '👥 Manage Authors', value: 'authors' },
                    { name: '🗂️  Manage Assets', value: 'assets' },
                    { name: '📜 Version History', value: 'history' },
                    { name: '⚙️  Settings & Extensions', value: 'settings' },
                    new inquirer.Separator(),
                    { name: '👁️  Preview Document', value: 'preview' },
                    { name: '📋 View Manifest', value: 'manifest' },
                    new inquirer.Separator(),
                    { name: chalk.green('💾 Save Changes'), value: 'save' },
                    { name: chalk.red('🚪 Exit'), value: 'exit' }
                ]
            }]);

            switch (action) {
                case 'metadata': await this.editMetadata(); break;
                case 'content': await this.editContent(); break;
                case 'authors': await this.manageAuthors(); break;
                case 'assets': await this.manageAssets(); break;
                case 'history': await this.manageHistory(); break;
                case 'settings': await this.editSettings(); break;
                case 'preview': await this.previewDocument(); break;
                case 'manifest': this.viewManifest(); break;
                case 'save': await this.save(); break;
                case 'exit':
                    if (this.modified) {
                        const { confirmExit } = await inquirer.prompt([{
                            type: 'confirm',
                            name: 'confirmExit',
                            message: 'You have unsaved changes. Exit anyway?',
                            default: false
                        }]);
                        if (!confirmExit) continue;
                    }
                    console.log(chalk.yellow('\nGoodbye! 👋\n'));
                    return;
            }
        }
    }

    async editMetadata() {
        const doc = this.manifest.document || {};

        const answers = await inquirer.prompt([
            { type: 'input', name: 'title', message: 'Title:', default: doc.title },
            { type: 'input', name: 'subtitle', message: 'Subtitle:', default: doc.subtitle || '' },
            { type: 'input', name: 'description', message: 'Description:', default: doc.description || '' },
            { type: 'input', name: 'version', message: 'Version:', default: doc.version || '1.0.0' },
            { type: 'input', name: 'language', message: 'Language:', default: doc.language || 'en-US' }
        ]);

        this.manifest.document = {
            ...this.manifest.document,
            ...answers,
            modified: new Date().toISOString()
        };

        // Remove empty fields
        Object.keys(this.manifest.document).forEach(key => {
            if (this.manifest.document[key] === '') delete this.manifest.document[key];
        });

        this.modified = true;
        console.log(chalk.green('\n✓ Metadata updated\n'));
    }

    async editContent() {
        console.log(chalk.yellow('\nCurrent content preview (first 500 chars):\n'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(this.content.substring(0, 500) + (this.content.length > 500 ? '...' : ''));
        console.log(chalk.gray('─'.repeat(50)));

        const { editAction } = await inquirer.prompt([{
            type: 'list',
            name: 'editAction',
            message: 'Content action:',
            choices: [
                { name: 'Append text', value: 'append' },
                { name: 'Replace all content', value: 'replace' },
                { name: 'Edit in external editor', value: 'external' },
                { name: 'Back to main menu', value: 'back' }
            ]
        }]);

        if (editAction === 'back') return;

        if (editAction === 'append') {
            const { text } = await inquirer.prompt([{
                type: 'editor',
                name: 'text',
                message: 'Enter text to append:'
            }]);
            this.content += '\n' + text;
            this.modified = true;
            console.log(chalk.green('\n✓ Content appended\n'));
        } else if (editAction === 'replace') {
            const { confirm } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: 'Replace all content? This cannot be undone.',
                default: false
            }]);
            if (confirm) {
                const { text } = await inquirer.prompt([{
                    type: 'editor',
                    name: 'text',
                    message: 'Enter new content:'
                }]);
                this.content = text;
                this.modified = true;
                console.log(chalk.green('\n✓ Content replaced\n'));
            }
        } else if (editAction === 'external') {
            console.log(chalk.yellow('\nTo edit in external editor:'));
            console.log('1. Run: mdx extract ' + path.basename(this.filePath));
            console.log('2. Edit the document.md file');
            console.log('3. Repackage using: mdx create\n');
        }
    }

    async manageAuthors() {
        const authors = this.manifest.document?.authors || [];

        while (true) {
            console.log(chalk.yellow('\nCurrent Authors:'));
            if (authors.length === 0) {
                console.log(chalk.gray('  No authors defined'));
            } else {
                authors.forEach((a, i) => {
                    console.log(`  ${i + 1}. ${a.name}${a.email ? ` <${a.email}>` : ''} ${a.role ? chalk.cyan(`(${a.role})`) : ''}`);
                });
            }

            const { action } = await inquirer.prompt([{
                type: 'list',
                name: 'action',
                message: 'Author action:',
                choices: [
                    { name: 'Add author', value: 'add' },
                    { name: 'Remove author', value: 'remove', disabled: authors.length === 0 },
                    { name: 'Back to main menu', value: 'back' }
                ]
            }]);

            if (action === 'back') break;

            if (action === 'add') {
                const author = await inquirer.prompt([
                    { type: 'input', name: 'name', message: 'Name:', validate: v => v.length > 0 },
                    { type: 'input', name: 'email', message: 'Email (optional):' },
                    { type: 'list', name: 'role', message: 'Role:', choices: ['author', 'contributor', 'editor', 'reviewer'] }
                ]);
                if (!author.email) delete author.email;
                authors.push(author);
                this.manifest.document.authors = authors;
                this.modified = true;
                console.log(chalk.green('\n✓ Author added\n'));
            } else if (action === 'remove') {
                const { index } = await inquirer.prompt([{
                    type: 'list',
                    name: 'index',
                    message: 'Select author to remove:',
                    choices: authors.map((a, i) => ({ name: a.name, value: i }))
                }]);
                authors.splice(index, 1);
                this.manifest.document.authors = authors;
                this.modified = true;
                console.log(chalk.green('\n✓ Author removed\n'));
            }
        }
    }

    async manageAssets() {
        const assets = this.manifest.assets || {};
        const entries = this.zip.getEntries().filter(e => e.entryName.startsWith('assets/') && !e.isDirectory);

        console.log(chalk.yellow('\nCurrent Assets:'));
        if (entries.length === 0) {
            console.log(chalk.gray('  No assets in document'));
        } else {
            const icons = { images: '🖼️', video: '🎬', audio: '🎵', models: '📦', data: '📊' };
            for (const entry of entries) {
                const category = entry.entryName.split('/')[1] || 'other';
                console.log(`  ${icons[category] || '📁'} ${entry.entryName} (${formatSize(entry.header.size)})`);
            }
        }

        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: 'Asset action:',
            choices: [
                { name: 'Add asset from file', value: 'add' },
                { name: 'List asset details', value: 'list' },
                { name: 'Back to main menu', value: 'back' }
            ]
        }]);

        if (action === 'add') {
            const { filePath } = await inquirer.prompt([{
                type: 'input',
                name: 'filePath',
                message: 'Path to file to add:'
            }]);

            if (fs.existsSync(filePath)) {
                const ext = path.extname(filePath).toLowerCase();
                const categories = {
                    '.png': 'images', '.jpg': 'images', '.jpeg': 'images', '.gif': 'images', '.svg': 'images',
                    '.mp4': 'video', '.webm': 'video',
                    '.mp3': 'audio', '.wav': 'audio',
                    '.csv': 'data', '.json': 'data',
                    '.gltf': 'models', '.glb': 'models',
                    '.pdf': 'documents'
                };
                const category = categories[ext] || 'other';
                const assetPath = `assets/${category}/${path.basename(filePath)}`;

                const data = fs.readFileSync(filePath);
                this.zip.addFile(assetPath, data);

                // Update manifest
                if (!this.manifest.assets) this.manifest.assets = {};
                if (!this.manifest.assets[category]) this.manifest.assets[category] = [];
                this.manifest.assets[category].push({
                    path: assetPath,
                    mime_type: getMimeType(ext),
                    size_bytes: data.length,
                    checksum: `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`
                });

                this.modified = true;
                console.log(chalk.green(`\n✓ Added: ${assetPath}\n`));
            } else {
                console.log(chalk.red('\nFile not found\n'));
            }
        }
    }

    async manageHistory() {
        const history = this.manifest.history || {};

        console.log(chalk.yellow('\nVersion History Settings:'));
        console.log(`  Enabled: ${history.enabled ? chalk.green('Yes') : chalk.red('No')}`);

        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: 'History action:',
            choices: [
                { name: history.enabled ? 'Disable history' : 'Enable history', value: 'toggle' },
                { name: 'Create version snapshot', value: 'snapshot', disabled: !history.enabled },
                { name: 'Back to main menu', value: 'back' }
            ]
        }]);

        if (action === 'toggle') {
            if (!this.manifest.history) {
                this.manifest.history = {
                    enabled: true,
                    versions_file: 'history/versions.json',
                    snapshots_directory: 'history/snapshots'
                };
            } else {
                this.manifest.history.enabled = !this.manifest.history.enabled;
            }
            this.modified = true;
            console.log(chalk.green(`\n✓ History ${this.manifest.history.enabled ? 'enabled' : 'disabled'}\n`));
        }
    }

    async editSettings() {
        const content = this.manifest.content || {};
        const extensions = content.extensions || [];

        const { selectedExtensions } = await inquirer.prompt([{
            type: 'checkbox',
            name: 'selectedExtensions',
            message: 'Select Markdown extensions:',
            choices: [
                { name: 'Tables', value: 'tables', checked: extensions.includes('tables') },
                { name: 'Footnotes', value: 'footnotes', checked: extensions.includes('footnotes') },
                { name: 'Task Lists', value: 'task-lists', checked: extensions.includes('task-lists') },
                { name: 'Math (LaTeX)', value: 'math', checked: extensions.includes('math') },
                { name: 'Strikethrough', value: 'strikethrough', checked: extensions.includes('strikethrough') },
                { name: 'Autolinks', value: 'autolinks', checked: extensions.includes('autolinks') }
            ]
        }]);

        if (!this.manifest.content) this.manifest.content = {};
        this.manifest.content.extensions = selectedExtensions;
        this.modified = true;
        console.log(chalk.green('\n✓ Extensions updated\n'));
    }

    async previewDocument() {
        const { marked } = require('marked');

        // Try to use terminal renderer for better output
        try {
            const TerminalRenderer = require('marked-terminal');
            const Renderer = TerminalRenderer.default || TerminalRenderer;
            marked.setOptions({
                renderer: new Renderer({ reflowText: true, width: 80 })
            });
        } catch (e) {
            // Use default renderer if terminal renderer fails
        }

        console.log(chalk.cyan('\n═══════════════════════════════════════'));
        console.log(chalk.bold.white('  ' + (this.manifest.document?.title || 'Untitled')));
        console.log(chalk.cyan('═══════════════════════════════════════\n'));
        console.log(marked(this.content));
        console.log(chalk.cyan('═══════════════════════════════════════\n'));

        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }

    viewManifest() {
        console.log(chalk.yellow('\nManifest:'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(JSON.stringify(this.manifest, null, 2));
        console.log(chalk.gray('─'.repeat(50)) + '\n');
    }

    async save() {
        const spinner = ora('Saving MDX file...').start();

        try {
            // Update modified timestamp
            if (this.manifest.document) {
                this.manifest.document.modified = new Date().toISOString();
            }

            // Update manifest in zip
            this.zip.updateFile('manifest.json', Buffer.from(JSON.stringify(this.manifest, null, 2)));

            // Update content
            const entryPoint = this.manifest.content?.entry_point || 'document.md';
            this.zip.updateFile(entryPoint, Buffer.from(this.content, 'utf8'));

            // Write file
            this.zip.writeZip(this.filePath);

            this.modified = false;
            spinner.succeed(chalk.green('Changes saved!'));
        } catch (error) {
            spinner.fail(chalk.red(`Save failed: ${error.message}`));
        }
    }
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMimeType(ext) {
    const types = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
        '.mp4': 'video/mp4', '.webm': 'video/webm',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
        '.pdf': 'application/pdf', '.json': 'application/json',
        '.csv': 'text/csv', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary'
    };
    return types[ext] || 'application/octet-stream';
}

async function editCommand(file) {
    const filePath = path.resolve(file);

    if (!fs.existsSync(filePath)) {
        console.log(chalk.red(`File not found: ${filePath}`));
        process.exit(1);
    }

    const editor = new MDXEditor(filePath);
    await editor.run();
}

module.exports = editCommand;
