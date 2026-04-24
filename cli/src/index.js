#!/usr/bin/env node

/**
 * MDZ CLI - Command-line tool for MDZ (Markdown Zipped Container) files.
 *
 * Accepts both `.mdz` (current) and `.mdx` (legacy, through 2027-01-01)
 * archives throughout.
 */

const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');

// Import commands
const viewCommand = require('./commands/view');
const extractCommand = require('./commands/extract');
const infoCommand = require('./commands/info');
const editCommand = require('./commands/edit');
const createCommand = require('./commands/create');
const validateCommand = require('./commands/validate');
const importIpynbCommand = require('./commands/import-ipynb');
const exportJatsCommand = require('./commands/export-jats');
const exportEpubCommand = require('./commands/export-epub');
const verifyCommand = require('./commands/verify');

// CLI Banner
const banner = `
${chalk.cyan('╔═══════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('MDZ CLI')} - Markdown Zipped Container Tool              ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Create, view, edit, and manage MDZ documents')}             ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════════╝')}
`;

program
  .name('mdz')
  .description('CLI tool for working with MDZ (Markdown Zipped Container) files; reads legacy .mdx too')
  .version('2.0.0')
  .addHelpText('before', banner);

// View command - opens MDZ in browser viewer
program
  .command('view <file>')
  .alias('v')
  .description('Open an MDZ file in the browser viewer')
  .option('-p, --port <port>', 'Port for local server', '3000')
  .action(viewCommand);

// Extract command - extracts MDZ contents
program
  .command('extract <file> [output]')
  .alias('x')
  .description('Extract MDZ contents to a folder')
  .option('-f, --force', 'Overwrite existing files')
  .action(extractCommand);

// Info command - displays MDZ info in terminal
program
  .command('info <file>')
  .alias('i')
  .description('Display MDZ file information in terminal')
  .option('-c, --content', 'Show full markdown content')
  .option('-m, --manifest', 'Show full manifest JSON')
  .option('-a, --assets', 'List all assets with details')
  .action(infoCommand);

// Edit command - interactive editor
program
  .command('edit <file>')
  .alias('e')
  .description('Interactive MDZ editor')
  .action(editCommand);

// Create command - create new MDZ file
program
  .command('create [name]')
  .alias('c')
  .description('Create a new MDZ file')
  .option('-t, --template <template>', 'Template to use (blank, article, report, presentation)', 'blank')
  .option('-o, --output <path>', 'Output path for the MDZ file')
  .action(createCommand);

// Import command (Phase 2.4) - convert Jupyter notebook to MDZ
program
  .command('import-ipynb <file>')
  .description('Convert a Jupyter .ipynb file into an MDZ archive')
  .option('-o, --output <path>', 'Output .mdz path (default: same name with .mdz extension)')
  .action(importIpynbCommand);

// Export to JATS (Phase 2.4) - for journal ingest pipelines
program
  .command('export-jats <file>')
  .description('Export an MDZ archive to JATS 1.3 XML for journal production')
  .option('-o, --output <path>', 'Output .jats.xml path')
  .action(exportJatsCommand);

// Export to EPUB (Phase 2.4) - for ereader ecosystem
program
  .command('export-epub <file>')
  .description('Export an MDZ archive to EPUB 3.3 for Calibre / readium / iBooks')
  .option('-o, --output <path>', 'Output .epub path')
  .action(exportEpubCommand);

// Verify command (Phase 3.1) - cryptographic verification of signatures
program
  .command('verify <file>')
  .description('Verify signature chain + integrity of an MDZ archive')
  .option('--trust <path>', 'Trust policy JSON — only listed DIDs accepted as signers')
  .option('--offline', 'Skip DID resolution (use cached keys only)')
  .action(verifyCommand);

// Validate command - validate MDZ file structure
program
  .command('validate <file>')
  .alias('val')
  .description('Validate MDZ file structure and manifest')
  .option('-v, --verbose', 'Show detailed information including info-level messages')
  .option('--no-exit', 'Do not exit with error code on validation failure')
  .option('--profile <id-or-path>', 'Enforce conformance against a profile (e.g., mdz-core, mdz-advanced, scientific-paper-v1, or a path to a profile JSON)')
  .action(validateCommand);

// Default action when file is passed directly
program
  .argument('[file]', 'MDZ (or legacy MDX) file to open')
  .action((file) => {
    // Accept both .mdz (current) and .mdx (legacy through 2027-01-01).
    if (file && (file.endsWith('.mdz') || file.endsWith('.mdx'))) {
      // Default behavior: show info
      infoCommand(file, {});
    } else if (!file) {
      program.help();
    }
  });

program.parse();
