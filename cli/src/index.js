#!/usr/bin/env node

/**
 * MDX CLI - Command-line tool for MDX (Markdown eXtended Container) files
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
${chalk.cyan('║')}  ${chalk.bold.white('MDX CLI')} - Markdown eXtended Container Tool            ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Create, view, edit, and manage MDX documents')}            ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════════╝')}
`;

program
  .name('mdx')
  .description('CLI tool for working with MDX (Markdown eXtended Container) files')
  .version('1.0.0')
  .addHelpText('before', banner);

// View command - opens MDX in browser viewer
program
  .command('view <file>')
  .alias('v')
  .description('Open an MDX file in the browser viewer')
  .option('-p, --port <port>', 'Port for local server', '3000')
  .action(viewCommand);

// Extract command - extracts MDX contents
program
  .command('extract <file> [output]')
  .alias('x')
  .description('Extract MDX contents to a folder')
  .option('-f, --force', 'Overwrite existing files')
  .action(extractCommand);

// Info command - displays MDX info in terminal
program
  .command('info <file>')
  .alias('i')
  .description('Display MDX file information in terminal')
  .option('-c, --content', 'Show full markdown content')
  .option('-m, --manifest', 'Show full manifest JSON')
  .option('-a, --assets', 'List all assets with details')
  .action(infoCommand);

// Edit command - interactive editor
program
  .command('edit <file>')
  .alias('e')
  .description('Interactive MDX editor')
  .action(editCommand);

// Create command - create new MDX file
program
  .command('create [name]')
  .alias('c')
  .description('Create a new MDX file')
  .option('-t, --template <template>', 'Template to use (blank, article, report, presentation)', 'blank')
  .option('-o, --output <path>', 'Output path for the MDX file')
  .action(createCommand);

// Validate command - validate MDX file structure
program
  .command('validate <file>')
  .alias('val')
  .description('Validate MDX file structure and manifest')
  .option('-v, --verbose', 'Show detailed information including info-level messages')
  .option('--no-exit', 'Do not exit with error code on validation failure')
  .action(validateCommand);

// Default action when file is passed directly
program
  .argument('[file]', 'MDX file to open')
  .action((file) => {
    if (file && file.endsWith('.mdx')) {
      // Default behavior: show info
      infoCommand(file, {});
    } else if (!file) {
      program.help();
    }
  });

program.parse();
