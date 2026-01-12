/**
 * MDX Viewer Extension Setup Script
 * Downloads required libraries and generates icons
 *
 * Run with: node setup.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const LIBS = [
    {
        name: 'jszip.min.js',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
    },
    {
        name: 'marked.min.js',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/marked/11.1.1/marked.min.js'
    },
    {
        name: 'highlight.min.js',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js'
    },
    {
        name: 'github.min.css',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css'
    }
];

const ICONS = {
    'icon-16.png': 16,
    'icon-48.png': 48,
    'icon-128.png': 128
};

// Create lib directory
const libDir = path.join(__dirname, 'lib');
if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir);
}

// Create icons directory
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
}

// Download function
function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirect
                download(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

// Generate simple icon (creates a basic PNG with canvas if available, otherwise placeholder)
function generateIconPlaceholder(size, filename) {
    // Create a simple 1x1 transparent PNG as placeholder
    // In production, use proper icon files
    const pngHeader = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  // 1x1
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,  // 8-bit RGBA
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,  // IDAT chunk
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,  // IEND chunk
        0x42, 0x60, 0x82
    ]);

    fs.writeFileSync(path.join(iconsDir, filename), pngHeader);
    console.log(`Created placeholder: ${filename} (replace with proper ${size}x${size} icon)`);
}

async function main() {
    console.log('MDX Viewer Extension Setup\n');

    // Download libraries
    console.log('Downloading libraries...');
    for (const lib of LIBS) {
        const dest = path.join(libDir, lib.name);
        try {
            console.log(`  Downloading ${lib.name}...`);
            await download(lib.url, dest);
            console.log(`  ✓ ${lib.name}`);
        } catch (err) {
            console.error(`  ✗ Failed to download ${lib.name}: ${err.message}`);
        }
    }

    // Create icon placeholders
    console.log('\nCreating icon placeholders...');
    for (const [filename, size] of Object.entries(ICONS)) {
        generateIconPlaceholder(size, filename);
    }

    console.log('\n✓ Setup complete!');
    console.log('\nNotes:');
    console.log('  - Replace placeholder icons in /icons with proper PNG files');
    console.log('  - Icon sizes needed: 16x16, 48x48, 128x128');
    console.log('  - Load the extension in Chrome via chrome://extensions');
}

main().catch(console.error);
