/**
 * Create command - Create new MDX files
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

// Templates
const templates = {
    blank: {
        content: `# {{title}}

Write your content here.
`,
        description: 'Empty document with just a title'
    },
    article: {
        content: `# {{title}}

{{description}}

## Introduction

Start your article here...

## Main Content

Add your main content sections...

## Conclusion

Summarize your article...

---

*Written by {{author}}*
`,
        description: 'Blog post or article structure'
    },
    report: {
        content: `# {{title}}

**{{description}}**

| Document Info | |
|---------------|---|
| Author | {{author}} |
| Date | {{date}} |
| Version | {{version}} |

---

## Executive Summary

Provide a brief overview of this report...

## Background

Explain the context and background...

## Findings

### Finding 1

Details...

### Finding 2

Details...

## Recommendations

1. First recommendation
2. Second recommendation
3. Third recommendation

## Appendix

Additional supporting information...
`,
        description: 'Business or technical report'
    },
    presentation: {
        content: `# {{title}}

---

## Slide 1: Introduction

{{description}}

---

## Slide 2: Overview

- Point 1
- Point 2
- Point 3

---

## Slide 3: Details

Expand on your main points...

---

## Slide 4: Conclusion

Key takeaways:

1. First takeaway
2. Second takeaway
3. Third takeaway

---

## Questions?

Contact: {{author}}
`,
        description: 'Slide-style presentation'
    }
};

async function createCommand(name, options) {
    console.log(chalk.cyan('\n╔═══════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + '  ' + chalk.bold.white('Create New MDX Document') + '                                 ' + chalk.cyan('║'));
    console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════╝\n'));

    // Gather document info
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'title',
            message: 'Document title:',
            default: name || 'My Document',
            validate: v => v.length > 0 || 'Title is required'
        },
        {
            type: 'input',
            name: 'description',
            message: 'Description (optional):',
            default: ''
        },
        {
            type: 'input',
            name: 'author',
            message: 'Author name:',
            default: process.env.USER || process.env.USERNAME || 'Author'
        },
        {
            type: 'input',
            name: 'email',
            message: 'Author email (optional):',
            default: ''
        },
        {
            type: 'list',
            name: 'template',
            message: 'Template:',
            choices: Object.entries(templates).map(([key, val]) => ({
                name: `${key} - ${val.description}`,
                value: key
            })),
            default: options.template || 'blank'
        },
        {
            type: 'checkbox',
            name: 'extensions',
            message: 'Markdown extensions:',
            choices: [
                { name: 'Tables', value: 'tables', checked: true },
                { name: 'Footnotes', value: 'footnotes', checked: true },
                { name: 'Task Lists', value: 'task-lists', checked: true },
                { name: 'Math (LaTeX)', value: 'math', checked: false },
                { name: 'Strikethrough', value: 'strikethrough', checked: true }
            ]
        },
        {
            type: 'confirm',
            name: 'enableHistory',
            message: 'Enable version history?',
            default: true
        },
        {
            type: 'confirm',
            name: 'enableAnnotations',
            message: 'Enable annotations?',
            default: true
        },
        {
            type: 'input',
            name: 'output',
            message: 'Output file:',
            default: options.output || `${slugify(name || 'my-document')}.mdx`
        }
    ]);

    const spinner = ora('Creating MDX document...').start();

    try {
        const zip = new AdmZip();
        const timestamp = new Date().toISOString();
        const docId = crypto.randomUUID();

        // Build manifest
        const manifest = {
            mdx_version: '1.0.0',
            document: {
                id: docId,
                title: answers.title,
                created: timestamp,
                modified: timestamp,
                version: '1.0.0',
                language: 'en-US'
            },
            content: {
                entry_point: 'document.md',
                encoding: 'UTF-8',
                markdown_variant: 'CommonMark',
                extensions: answers.extensions
            },
            assets: {
                images: [],
                video: [],
                audio: [],
                data: [],
                models: []
            }
        };

        // Add optional fields
        if (answers.description) {
            manifest.document.description = answers.description;
        }

        // Add author
        manifest.document.authors = [{
            name: answers.author,
            role: 'author'
        }];
        if (answers.email) {
            manifest.document.authors[0].email = answers.email;
        }

        // Add collaboration settings
        if (answers.enableAnnotations) {
            manifest.collaboration = {
                allow_annotations: true,
                track_changes: true
            };
        }

        // Add history settings
        if (answers.enableHistory) {
            manifest.history = {
                enabled: true,
                versions_file: 'history/versions.json',
                snapshots_directory: 'history/snapshots'
            };
        }

        // Generate content from template
        let content = templates[answers.template].content;
        content = content.replace(/\{\{title\}\}/g, answers.title);
        content = content.replace(/\{\{description\}\}/g, answers.description || 'Add description here');
        content = content.replace(/\{\{author\}\}/g, answers.author);
        content = content.replace(/\{\{date\}\}/g, new Date().toLocaleDateString());
        content = content.replace(/\{\{version\}\}/g, '1.0.0');

        // Add files to zip
        zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
        zip.addFile('document.md', Buffer.from(content, 'utf8'));

        // Add history if enabled
        if (answers.enableHistory) {
            const versions = {
                schema_version: '1.0.0',
                current_version: '1.0.0',
                versions: [{
                    version: '1.0.0',
                    timestamp: timestamp,
                    author: { name: answers.author },
                    message: 'Initial document creation',
                    snapshot: { type: 'full', path: 'history/snapshots/v1.0.0.md' },
                    changes: { summary: 'Created document', added: ['document.md'] }
                }]
            };
            zip.addFile('history/versions.json', Buffer.from(JSON.stringify(versions, null, 2)));
            zip.addFile('history/snapshots/v1.0.0.md', Buffer.from(content, 'utf8'));
        }

        // Add annotations if enabled
        if (answers.enableAnnotations) {
            const annotations = {
                schema_version: '1.0.0',
                '@context': 'http://www.w3.org/ns/anno.jsonld',
                annotations: []
            };
            zip.addFile('annotations/annotations.json', Buffer.from(JSON.stringify(annotations, null, 2)));
        }

        // Add basic CSS
        const css = `:root {
  --primary: #2563eb;
  --text: #1e293b;
  --bg: #ffffff;
}
body {
  font-family: system-ui, sans-serif;
  line-height: 1.6;
  color: var(--text);
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
h1, h2, h3 { font-weight: 600; }
a { color: var(--primary); }
code { background: #f1f5f9; padding: 0.2em 0.4em; border-radius: 4px; }
pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 8px; overflow-x: auto; }
`;
        zip.addFile('styles/theme.css', Buffer.from(css, 'utf8'));
        manifest.styles = { theme: 'styles/theme.css' };

        // Update manifest with styles
        zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));

        // Write the file
        const outputPath = path.resolve(answers.output);
        zip.writeZip(outputPath);

        spinner.succeed(chalk.green(`Created: ${outputPath}`));

        // Summary
        console.log(chalk.cyan('\n📄 Document Summary'));
        console.log(chalk.gray('───────────────────────────────────────'));
        console.log(`  Title:       ${answers.title}`);
        console.log(`  Author:      ${answers.author}`);
        console.log(`  Template:    ${answers.template}`);
        console.log(`  Extensions:  ${answers.extensions.join(', ') || 'none'}`);
        console.log(`  History:     ${answers.enableHistory ? 'enabled' : 'disabled'}`);
        console.log(`  Annotations: ${answers.enableAnnotations ? 'enabled' : 'disabled'}`);

        console.log(chalk.cyan('\n🚀 Next Steps'));
        console.log(chalk.gray('───────────────────────────────────────'));
        console.log(`  View:    ${chalk.white('mdx view ' + answers.output)}`);
        console.log(`  Edit:    ${chalk.white('mdx edit ' + answers.output)}`);
        console.log(`  Info:    ${chalk.white('mdx info ' + answers.output)}`);
        console.log(`  Extract: ${chalk.white('mdx extract ' + answers.output)}`);
        console.log('');

    } catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
    }
}

function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

module.exports = createCommand;
