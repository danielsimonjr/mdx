/**
 * Extract command - Extracts MDX contents to a folder
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const AdmZip = require('adm-zip');

async function extractCommand(file, output, options) {
    const spinner = ora('Extracting MDX file...').start();

    try {
        const filePath = path.resolve(file);

        if (!fs.existsSync(filePath)) {
            spinner.fail(chalk.red(`File not found: ${filePath}`));
            process.exit(1);
        }

        // Determine output directory
        const baseName = path.basename(file, '.mdx');
        const outputDir = output ? path.resolve(output) : path.resolve(baseName + '-extracted');

        // Check if output exists
        if (fs.existsSync(outputDir) && !options.force) {
            spinner.fail(chalk.red(`Output directory already exists: ${outputDir}`));
            console.log(chalk.yellow('Use --force to overwrite'));
            process.exit(1);
        }

        // Extract
        const zip = new AdmZip(filePath);
        zip.extractAllTo(outputDir, options.force || false);

        spinner.succeed(chalk.green(`Extracted to: ${outputDir}`));

        // List extracted files
        console.log(chalk.cyan('\nExtracted files:'));
        const entries = zip.getEntries();

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
