/**
 * Validate command - Validates MDX file structure and manifest
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

// Validation result types
const Level = {
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
};

class MDXValidator {
    constructor(filePath) {
        this.filePath = filePath;
        this.errors = [];
        this.warnings = [];
        this.info = [];
        this.zip = null;
        this.manifest = null;
        this.entries = [];
    }

    addIssue(level, message, details = null) {
        const issue = { message, details };
        switch (level) {
            case Level.ERROR:
                this.errors.push(issue);
                break;
            case Level.WARNING:
                this.warnings.push(issue);
                break;
            case Level.INFO:
                this.info.push(issue);
                break;
        }
    }

    async validate() {
        // 1. Check file exists
        if (!fs.existsSync(this.filePath)) {
            this.addIssue(Level.ERROR, `File not found: ${this.filePath}`);
            return this.getResults();
        }

        // 2. Check it's a valid ZIP file
        try {
            this.zip = new AdmZip(this.filePath);
            this.entries = this.zip.getEntries();
        } catch (e) {
            this.addIssue(Level.ERROR, 'Not a valid ZIP archive', e.message);
            return this.getResults();
        }

        const fileNames = this.entries.map(e => e.entryName);

        // 3. Check required files
        if (!fileNames.includes('manifest.json')) {
            this.addIssue(Level.ERROR, 'Missing required file: manifest.json');
        }

        // 4. Parse and validate manifest
        const manifestEntry = this.entries.find(e => e.entryName === 'manifest.json');
        if (manifestEntry) {
            try {
                const manifestData = manifestEntry.getData().toString('utf8');
                this.manifest = JSON.parse(manifestData);
                this.validateManifest(fileNames);
            } catch (e) {
                this.addIssue(Level.ERROR, 'Invalid manifest.json', e.message);
                return this.getResults();
            }
        }

        // 5. Check entry point exists
        const entryPoint = this.manifest?.content?.entry_point || 'document.md';
        if (!fileNames.includes(entryPoint)) {
            this.addIssue(Level.ERROR, `Entry point '${entryPoint}' not found in archive`);
        } else {
            this.validateMarkdownContent(entryPoint);
        }

        // 6. Validate assets
        this.validateAssets(fileNames);

        // 7. Validate checksums if present
        this.validateChecksums();

        // 8. Check for common issues
        this.checkCommonIssues(fileNames);

        return this.getResults();
    }

    validateManifest(fileNames) {
        const manifest = this.manifest;

        // Required top-level fields
        if (!manifest.mdx_version) {
            this.addIssue(Level.ERROR, 'Missing required field: mdx_version');
        } else if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(manifest.mdx_version)) {
            this.addIssue(Level.WARNING, 'mdx_version should follow SemVer format', manifest.mdx_version);
        }

        // Document section
        if (!manifest.document) {
            this.addIssue(Level.ERROR, 'Missing required section: document');
        } else {
            const doc = manifest.document;

            if (!doc.id) {
                this.addIssue(Level.ERROR, 'Missing required field: document.id');
            } else if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(doc.id)) {
                this.addIssue(Level.WARNING, 'document.id should be a valid UUID v4', doc.id);
            }

            if (!doc.title) {
                this.addIssue(Level.ERROR, 'Missing required field: document.title');
            }

            if (!doc.created) {
                this.addIssue(Level.WARNING, 'Missing recommended field: document.created');
            } else if (!this.isValidISO8601(doc.created)) {
                this.addIssue(Level.WARNING, 'document.created should be ISO 8601 format', doc.created);
            }

            if (!doc.modified) {
                this.addIssue(Level.WARNING, 'Missing recommended field: document.modified');
            } else if (!this.isValidISO8601(doc.modified)) {
                this.addIssue(Level.WARNING, 'document.modified should be ISO 8601 format', doc.modified);
            }

            if (!doc.version) {
                this.addIssue(Level.INFO, 'Optional field document.version not set');
            }

            if (!doc.language) {
                this.addIssue(Level.INFO, 'Optional field document.language not set');
            }
        }

        // Content section
        if (!manifest.content) {
            this.addIssue(Level.ERROR, 'Missing required section: content');
        } else {
            if (!manifest.content.entry_point) {
                this.addIssue(Level.INFO, 'content.entry_point not set, defaulting to document.md');
            }
        }
    }

    validateAssets(fileNames) {
        const assets = this.manifest?.assets || {};
        const categories = ['images', 'video', 'audio', 'models', 'documents', 'data', 'fonts', 'other'];

        for (const category of categories) {
            const categoryAssets = assets[category];
            if (!categoryAssets || !Array.isArray(categoryAssets)) continue;

            for (const asset of categoryAssets) {
                if (!asset.path) {
                    this.addIssue(Level.ERROR, `Asset in ${category} missing required field: path`);
                    continue;
                }

                // Check asset exists in archive
                if (!fileNames.includes(asset.path)) {
                    this.addIssue(Level.ERROR, `Asset not found in archive: ${asset.path}`);
                }

                // Check path follows conventions
                if (!asset.path.startsWith(`assets/${category}/`)) {
                    this.addIssue(Level.WARNING, `Asset path should be under assets/${category}/`, asset.path);
                }

                // Check for required asset fields
                if (!asset.mime_type) {
                    this.addIssue(Level.WARNING, `Asset missing mime_type: ${asset.path}`);
                }

                if (asset.size_bytes === undefined) {
                    this.addIssue(Level.INFO, `Asset missing size_bytes: ${asset.path}`);
                }

                // Verify size matches actual file
                if (asset.size_bytes !== undefined) {
                    const entry = this.entries.find(e => e.entryName === asset.path);
                    if (entry && entry.header.size !== asset.size_bytes) {
                        this.addIssue(Level.WARNING,
                            `Asset size mismatch for ${asset.path}`,
                            `Manifest: ${asset.size_bytes}, Actual: ${entry.header.size}`
                        );
                    }
                }

                // Check for alt_text on images
                if (category === 'images' && !asset.alt_text) {
                    this.addIssue(Level.INFO, `Image missing alt_text: ${asset.path}`);
                }
            }
        }

        // Check for orphaned assets (in archive but not manifest)
        const manifestedPaths = new Set();
        for (const category of categories) {
            const categoryAssets = assets[category] || [];
            for (const asset of categoryAssets) {
                if (asset.path) manifestedPaths.add(asset.path);
            }
        }

        for (const entry of this.entries) {
            if (entry.entryName.startsWith('assets/') && !entry.isDirectory) {
                if (!manifestedPaths.has(entry.entryName)) {
                    this.addIssue(Level.WARNING, `Orphaned asset (not in manifest): ${entry.entryName}`);
                }
            }
        }
    }

    validateChecksums() {
        const assets = this.manifest?.assets || {};

        for (const [category, assetList] of Object.entries(assets)) {
            if (!Array.isArray(assetList)) continue;

            for (const asset of assetList) {
                if (!asset.checksum || !asset.path) continue;

                const entry = this.entries.find(e => e.entryName === asset.path);
                if (!entry) continue;

                // Parse checksum format (algorithm:hash)
                const [algorithm, expectedHash] = asset.checksum.split(':');
                if (!algorithm || !expectedHash) {
                    this.addIssue(Level.WARNING,
                        `Invalid checksum format for ${asset.path}`,
                        'Expected format: algorithm:hexdigest'
                    );
                    continue;
                }

                try {
                    const data = entry.getData();
                    const actualHash = crypto.createHash(algorithm).update(data).digest('hex');

                    if (actualHash !== expectedHash) {
                        this.addIssue(Level.ERROR,
                            `Checksum mismatch for ${asset.path}`,
                            `Expected: ${expectedHash}, Actual: ${actualHash}`
                        );
                    }
                } catch (e) {
                    this.addIssue(Level.WARNING,
                        `Cannot verify checksum for ${asset.path}`,
                        e.message
                    );
                }
            }
        }
    }

    validateMarkdownContent(entryPoint) {
        const entry = this.entries.find(e => e.entryName === entryPoint);
        if (!entry) return;

        const content = entry.getData().toString('utf8');

        // Check for broken asset references
        const assetRefRegex = /!\[([^\]]*)\]\(([^)]+)\)|::(?:video|audio|model|data|embed)\[[^\]]*\]\{[^}]*src="([^"]+)"[^}]*\}/g;
        let match;

        while ((match = assetRefRegex.exec(content)) !== null) {
            const assetPath = match[2] || match[3];
            if (assetPath && !assetPath.startsWith('http://') && !assetPath.startsWith('https://')) {
                const exists = this.entries.some(e => e.entryName === assetPath);
                if (!exists) {
                    this.addIssue(Level.ERROR, `Referenced asset not found: ${assetPath}`);
                }
            }
        }
    }

    checkCommonIssues(fileNames) {
        // Check for backslashes in paths (Windows artifact)
        for (const fileName of fileNames) {
            if (fileName.includes('\\')) {
                this.addIssue(Level.ERROR, `Path contains backslash: ${fileName}`, 'All paths must use forward slashes');
            }
        }

        // Check for very long paths
        for (const fileName of fileNames) {
            if (fileName.length > 255) {
                this.addIssue(Level.WARNING, `Path exceeds 255 characters: ${fileName.substring(0, 50)}...`);
            }
        }

        // Check for hidden/system files
        for (const fileName of fileNames) {
            if (fileName.startsWith('.') || fileName.includes('/.')) {
                this.addIssue(Level.INFO, `Hidden file in archive: ${fileName}`);
            }
            if (fileName.includes('__MACOSX') || fileName.includes('.DS_Store') || fileName.includes('Thumbs.db')) {
                this.addIssue(Level.WARNING, `System file in archive: ${fileName}`);
            }
        }

        // Check for large uncompressed files
        for (const entry of this.entries) {
            if (!entry.isDirectory && entry.header.size > 10 * 1024 * 1024) { // 10MB
                this.addIssue(Level.INFO,
                    `Large file: ${entry.entryName}`,
                    `Size: ${(entry.header.size / (1024 * 1024)).toFixed(1)} MB`
                );
            }
        }
    }

    isValidISO8601(dateString) {
        const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
        return iso8601Regex.test(dateString) && !isNaN(Date.parse(dateString));
    }

    getResults() {
        return {
            valid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings,
            info: this.info,
            summary: {
                errors: this.errors.length,
                warnings: this.warnings.length,
                info: this.info.length
            }
        };
    }
}

async function validateCommand(file, options) {
    const spinner = ora('Validating MDX file...').start();

    try {
        const filePath = path.resolve(file);
        const validator = new MDXValidator(filePath);
        const results = await validator.validate();

        spinner.stop();

        // Display header
        console.log('\n' + chalk.cyan('╔═══════════════════════════════════════════════════════════╗'));
        console.log(chalk.cyan('║') + '  ' + chalk.bold.white('MDX Validation Report') + '                                    ' + chalk.cyan('║'));
        console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════╝'));

        console.log(`\n${chalk.white('File:')} ${path.basename(filePath)}`);

        // Overall result
        if (results.valid) {
            console.log(chalk.green.bold('\n✓ Document is valid\n'));
        } else {
            console.log(chalk.red.bold('\n✗ Document has validation errors\n'));
        }

        // Display errors
        if (results.errors.length > 0) {
            console.log(chalk.red.bold(`Errors (${results.errors.length}):`));
            console.log(chalk.gray('───────────────────────────────────────'));
            for (const error of results.errors) {
                console.log(chalk.red('  ✗ ') + error.message);
                if (error.details && options.verbose) {
                    console.log(chalk.gray(`    └── ${error.details}`));
                }
            }
            console.log('');
        }

        // Display warnings
        if (results.warnings.length > 0) {
            console.log(chalk.yellow.bold(`Warnings (${results.warnings.length}):`));
            console.log(chalk.gray('───────────────────────────────────────'));
            for (const warning of results.warnings) {
                console.log(chalk.yellow('  ⚠ ') + warning.message);
                if (warning.details && options.verbose) {
                    console.log(chalk.gray(`    └── ${warning.details}`));
                }
            }
            console.log('');
        }

        // Display info (only in verbose mode)
        if (options.verbose && results.info.length > 0) {
            console.log(chalk.blue.bold(`Info (${results.info.length}):`));
            console.log(chalk.gray('───────────────────────────────────────'));
            for (const info of results.info) {
                console.log(chalk.blue('  ℹ ') + info.message);
                if (info.details) {
                    console.log(chalk.gray(`    └── ${info.details}`));
                }
            }
            console.log('');
        }

        // Summary
        console.log(chalk.gray('───────────────────────────────────────'));
        console.log(`${chalk.white('Summary:')} ` +
            chalk.red(`${results.summary.errors} errors`) + ', ' +
            chalk.yellow(`${results.summary.warnings} warnings`) + ', ' +
            chalk.blue(`${results.summary.info} info`)
        );
        console.log('');

        // Exit with error code if invalid
        if (!results.valid && !options.noExit) {
            process.exit(1);
        }

        return results;

    } catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        if (!options.noExit) {
            process.exit(1);
        }
        throw error;
    }
}

module.exports = validateCommand;
module.exports.MDXValidator = MDXValidator;
