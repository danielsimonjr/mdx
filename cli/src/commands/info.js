/**
 * Info command - Displays MDX file information in terminal
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const AdmZip = require('adm-zip');
const { marked } = require('marked');

// Terminal renderer configuration (loaded dynamically to handle ESM)
let terminalConfigured = false;
function configureTerminal() {
    if (terminalConfigured) return;
    try {
        const TerminalRenderer = require('marked-terminal');
        // Handle both ESM default export and CommonJS
        const Renderer = TerminalRenderer.default || TerminalRenderer;
        marked.setOptions({
            renderer: new Renderer({
                reflowText: true,
                width: 80
            })
        });
    } catch (e) {
        // Log the fallback to stderr rather than silently degrading — users
        // seeing raw HTML tags in their terminal deserve a hint about why.
        // Using stderr (not stdout) keeps the info output clean for pipes.
        console.error(
            chalk.yellow('[mdz info] terminal markdown renderer unavailable:'),
            e.message,
            '\n  Falling back to raw markdown output. Install marked-terminal',
            'to enable pretty rendering.'
        );
    }
    terminalConfigured = true;
}

async function infoCommand(file, options) {
    const spinner = ora('Reading MDX file...').start();

    try {
        const filePath = path.resolve(file);

        if (!fs.existsSync(filePath)) {
            spinner.fail(chalk.red(`File not found: ${filePath}`));
            process.exit(1);
        }

        // Read MDX file
        const zip = new AdmZip(filePath);
        const entries = zip.getEntries();

        // Get file stats
        const stats = fs.statSync(filePath);

        // Extract manifest
        const manifestEntry = entries.find(e => e.entryName === 'manifest.json');
        if (!manifestEntry) {
            spinner.fail(chalk.red('Invalid MDX file: missing manifest.json'));
            process.exit(1);
        }
        const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));

        spinner.stop();

        // Display header
        console.log('\n' + chalk.cyan('╔═══════════════════════════════════════════════════════════╗'));
        console.log(chalk.cyan('║') + '  ' + chalk.bold.white('MDX Document Information') + '                                 ' + chalk.cyan('║'));
        console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════╝'));

        // Document info
        const doc = manifest.document || {};
        console.log('\n' + chalk.yellow.bold('📄 Document'));
        console.log(chalk.gray('───────────────────────────────────────'));
        console.log(`  ${chalk.white('Title:')}       ${doc.title || 'Untitled'}`);
        if (doc.subtitle) console.log(`  ${chalk.white('Subtitle:')}    ${doc.subtitle}`);
        if (doc.description) console.log(`  ${chalk.white('Description:')} ${doc.description}`);
        console.log(`  ${chalk.white('Version:')}     ${doc.version || '1.0.0'}`);
        console.log(`  ${chalk.white('Language:')}    ${doc.language || 'en'}`);
        console.log(`  ${chalk.white('ID:')}          ${chalk.gray(doc.id || 'N/A')}`);

        // Authors
        if (doc.authors && doc.authors.length > 0) {
            console.log('\n' + chalk.yellow.bold('👥 Authors'));
            console.log(chalk.gray('───────────────────────────────────────'));
            for (const author of doc.authors) {
                let line = `  • ${author.name}`;
                if (author.email) line += chalk.gray(` <${author.email}>`);
                if (author.role) line += chalk.cyan(` (${author.role})`);
                console.log(line);
            }
        }

        // Dates
        console.log('\n' + chalk.yellow.bold('📅 Timestamps'));
        console.log(chalk.gray('───────────────────────────────────────'));
        if (doc.created) console.log(`  ${chalk.white('Created:')}  ${new Date(doc.created).toLocaleString()}`);
        if (doc.modified) console.log(`  ${chalk.white('Modified:')} ${new Date(doc.modified).toLocaleString()}`);

        // File info
        console.log('\n' + chalk.yellow.bold('📦 Archive'));
        console.log(chalk.gray('───────────────────────────────────────'));
        console.log(`  ${chalk.white('File:')}        ${path.basename(filePath)}`);
        console.log(`  ${chalk.white('Size:')}        ${formatSize(stats.size)}`);
        console.log(`  ${chalk.white('MDX Version:')} ${manifest.mdx_version || '1.0.0'}`);
        console.log(`  ${chalk.white('Total Files:')} ${entries.filter(e => !e.isDirectory).length}`);

        // Assets summary
        if (manifest.assets) {
            console.log('\n' + chalk.yellow.bold('🗂️  Assets'));
            console.log(chalk.gray('───────────────────────────────────────'));

            const icons = {
                images: '🖼️ ', video: '🎬', audio: '🎵', models: '📦',
                data: '📊', documents: '📄', fonts: '🔤', styles: '🎨'
            };

            let totalAssets = 0;
            for (const [category, items] of Object.entries(manifest.assets)) {
                if (Array.isArray(items) && items.length > 0) {
                    const icon = icons[category] || '📁';
                    console.log(`  ${icon} ${chalk.white(category)}: ${items.length} file(s)`);
                    totalAssets += items.length;

                    if (options.assets) {
                        for (const item of items) {
                            const name = item.path.split('/').pop();
                            const size = item.size_bytes ? formatSize(item.size_bytes) : '';
                            console.log(chalk.gray(`     └── ${name} ${size}`));
                        }
                    }
                }
            }
            console.log(chalk.gray(`  Total: ${totalAssets} assets`));
        }

        // Features
        console.log('\n' + chalk.yellow.bold('✨ Features'));
        console.log(chalk.gray('───────────────────────────────────────'));

        const features = [];
        if (manifest.history?.enabled) features.push('📜 Version History');
        if (manifest.collaboration?.allow_annotations) features.push('💬 Annotations');
        if (manifest.styles) features.push('🎨 Custom Styling');
        if (manifest.content?.extensions?.length > 0) {
            features.push(`📝 Extensions: ${manifest.content.extensions.join(', ')}`);
        }

        // v1.1: Show alignment and attributes info
        if (manifest.styles?.alignment_classes) {
            const alignClasses = Object.keys(manifest.styles.alignment_classes);
            features.push(`📐 Alignment: ${alignClasses.join(', ')}`);
        }
        if (manifest.rendering?.attributes?.enabled) {
            let attrInfo = '📋 Attributes: enabled';
            if (manifest.rendering.attributes.allow_inline_styles) {
                attrInfo += ' (inline styles allowed)';
            }
            features.push(attrInfo);
        }

        // v2.0 features
        if (manifest.content?.locales?.available?.length) {
            const tags = manifest.content.locales.available.map(l => l.tag).join(', ');
            features.push(`🌍 Locales: ${tags} (default: ${manifest.content.locales.default})`);
        }
        if (manifest.content?.variants?.length) {
            const ids = manifest.content.variants.map(v => v.id).join(', ');
            features.push(`🔀 Variants: ${ids}`);
        }
        if (manifest.content?.includes?.length) {
            features.push(`📎 Includes: ${manifest.content.includes.length} target(s)`);
        }
        if (manifest.document?.profile) {
            features.push(`📐 Profile: ${manifest.document.profile}`);
        }
        if (manifest.document?.accessibility?.features?.length) {
            const a11y = manifest.document.accessibility.features.join(', ');
            features.push(`♿ Accessibility: ${a11y}`);
        }
        if (manifest.document?.derived_from?.length) {
            features.push(`🔗 Derived from: ${manifest.document.derived_from.length} source(s)`);
        }
        if (manifest.security?.signatures?.length) {
            const roles = manifest.security.signatures.map(s => s.role).join(', ');
            features.push(`✍️  Signatures: ${roles}`);
        }
        if (manifest.interactivity?.kernels?.length) {
            const ids = manifest.interactivity.kernels.map(k => k.id).join(', ');
            features.push(`🧮 Kernels: ${ids}`);
        }

        if (features.length > 0) {
            features.forEach(f => console.log(`  ${f}`));
        } else {
            console.log(chalk.gray('  No special features enabled'));
        }

        // Show manifest if requested
        if (options.manifest) {
            console.log('\n' + chalk.yellow.bold('📋 Full Manifest'));
            console.log(chalk.gray('───────────────────────────────────────'));
            console.log(JSON.stringify(manifest, null, 2));
        }

        // Show content if requested
        if (options.content) {
            const entryPoint = manifest.content?.entry_point || 'document.md';
            const contentEntry = entries.find(e => e.entryName === entryPoint);

            if (contentEntry) {
                console.log('\n' + chalk.yellow.bold('📝 Document Content'));
                console.log(chalk.gray('═══════════════════════════════════════\n'));

                configureTerminal();
                const content = contentEntry.getData().toString('utf8');
                console.log(marked(content));
            }
        }

        console.log('');

    } catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        // Print the stack trace to stderr so it isn't silently swallowed
        // when the CLI is used in an automation pipeline. Users who pipe
        // stdout still get clean output; scripts that capture stderr see
        // the root cause. DEBUG=1 forces full detail regardless.
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = infoCommand;
