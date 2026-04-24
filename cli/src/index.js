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

// Validate command - validate MDZ file structure
program
  .command('validate <file>')
  .alias('val')
  .description('Validate MDZ file structure and manifest')
  .option('-v, --verbose', 'Show detailed information including info-level messages')
  .option('--no-exit', 'Do not exit with error code on validation failure')
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
