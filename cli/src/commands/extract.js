/**
 * Extract command - Extracts MDX contents to a folder
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const AdmZip = require('adm-zip');

/**
 * Validate one ZIP `entryName` for the path-traversal vectors a
 * Zip-Slip attack relies on. Mirrors the Rust binding's
 * `sanitize_archive_path` (`bindings/rust/src/lib.rs:745`); the JS
 * extractor previously had no equivalent and relied entirely on
 * AdmZip's internal handling, which only rejects a subset of the
 * vectors below.
 *
 * Returns `null` on safe input; a string error message on rejection.
 * Rejection vectors:
 *   - empty string (would extract over the output dir itself)
 *   - NUL bytes (some filesystems truncate at NUL — bypasses checks)
 *   - leading `/` or backslash (absolute path)
 *   - drive-letter prefix `C:` (Windows absolute path)
 *   - any path segment equal to `..` (parent-directory traversal)
 */
function validateEntryName(entryName) {
    if (typeof entryName !== 'string' || entryName.length === 0) {
        return 'empty entry name';
    }
    if (entryName.includes('\0')) {
        return 'entry name contains NUL byte';
    }
    // Normalize backslashes so the rest of the checks need only consider
    // forward-slash separators. ZIP entries SHOULD use `/` per APPNOTE
    // 4.4.17.1 but in practice some Windows-built archives carry `\`.
    const normalized = entryName.replace(/\\/g, '/');
    if (normalized.startsWith('/')) {
        return 'absolute path (leading /)';
    }
    if (normalized.length >= 2 && normalized[1] === ':' && /[A-Za-z]/.test(normalized[0])) {
        return 'Windows drive-letter prefix';
    }
    if (normalized.split('/').some((seg) => seg === '..')) {
        return 'parent-directory traversal (..)';
    }
    return null;
}

/**
 * Defense-in-depth: confirm the resolved extract destination really
 * lives inside the output directory. Belt-and-suspenders check for
 * vectors `validateEntryName` might miss (e.g., symlinks during
 * resolution, unicode normalization differences, or an entry-name
 * vector specific to a future filesystem).
 */
function isInsideOutputDir(entryName, outputDir) {
    const resolvedOutput = path.resolve(outputDir);
    const resolvedTarget = path.resolve(path.join(resolvedOutput, entryName));
    return (
        resolvedTarget === resolvedOutput ||
        resolvedTarget.startsWith(resolvedOutput + path.sep)
    );
}

async function extractCommand(file, output, options) {
    const spinner = ora('Extracting MDX file...').start();

    try {
        const filePath = path.resolve(file);

        if (!fs.existsSync(filePath)) {
            spinner.fail(chalk.red(`File not found: ${filePath}`));
            process.exit(1);
        }

        // Determine output directory. Strip whichever of the two
        // accepted extensions the input carries; `path.basename(p, ext)`
        // is a no-op when the ext doesn't match, so this handles both
        // `.mdz` and the legacy `.mdx` (and any unrecognised extension
        // falls back to using the full basename).
        const ext = path.extname(file).toLowerCase();
        const baseName = (ext === '.mdz' || ext === '.mdx')
            ? path.basename(file, ext)
            : path.basename(file);
        const outputDir = output ? path.resolve(output) : path.resolve(baseName + '-extracted');

        // Check if output exists
        if (fs.existsSync(outputDir) && !options.force) {
            spinner.fail(chalk.red(`Output directory already exists: ${outputDir}`));
            console.log(chalk.yellow('Use --force to overwrite'));
            process.exit(1);
        }

        // Defense-in-depth: pre-extract scan rejects Zip-Slip vectors
        // before AdmZip touches the filesystem. The Rust binding has
        // an equivalent gate at `sanitize_archive_path`; the JS side
        // previously relied entirely on AdmZip's own handling, which
        // does not reject every variant (notably NUL bytes and
        // drive-letter prefixes).
        const zip = new AdmZip(filePath);
        const allEntries = zip.getEntries();
        for (const e of allEntries) {
            const validationError = validateEntryName(e.entryName);
            if (validationError) {
                spinner.fail(
                    chalk.red(
                        `Refusing to extract: ${validationError} in entry '${e.entryName}'`,
                    ),
                );
                process.exit(1);
            }
            if (!isInsideOutputDir(e.entryName, outputDir)) {
                spinner.fail(
                    chalk.red(
                        `Refusing to extract: '${e.entryName}' resolves outside ${outputDir}`,
                    ),
                );
                process.exit(1);
            }
        }

        // Extract — only after every entry passed the pre-scan above.
        zip.extractAllTo(outputDir, options.force || false);

        spinner.succeed(chalk.green(`Extracted to: ${outputDir}`));

        // List extracted files (reuse the pre-scan list — already
        // validated, no need to re-fetch).
        console.log(chalk.cyan('\nExtracted files:'));
        const entries = allEntries;

        const tree = {};
        for (const entry of entries) {
            if (!entry.isDirectory) {
                const parts = entry.entryName.split('/');
                let current = tree;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!current[parts[i]]) current[parts[i]] = {};
                    current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = entry.header.size;
            }
        }

        function printTree(obj, prefix = '') {
            const keys = Object.keys(obj).sort();
            keys.forEach((key, index) => {
                const isLast = index === keys.length - 1;
                const connector = isLast ? '└── ' : '├── ';
                const value = obj[key];

                if (typeof value === 'number') {
                    const size = value < 1024 ? `${value} B` :
                                 value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` :
                                 `${(value / (1024 * 1024)).toFixed(1)} MB`;
                    console.log(chalk.gray(`${prefix}${connector}`) + key + chalk.gray(` (${size})`));
                } else {
                    console.log(chalk.gray(`${prefix}${connector}`) + chalk.blue(key + '/'));
                    printTree(value, prefix + (isLast ? '    ' : '│   '));
                }
            });
        }

        printTree(tree);

        console.log(chalk.gray(`\nTotal files: ${entries.filter(e => !e.isDirectory).length}`));

    } catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
    }
}

module.exports = extractCommand;
module.exports.validateEntryName = validateEntryName; // exposed for unit tests
module.exports.isInsideOutputDir = isInsideOutputDir; // exposed for unit tests
