/**
 * Generate MDX Viewer icons using PNG with pngjs-nozlib
 * Simple solid color icons with rounded corners
 *
 * Run with: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, getPixel) {
    // PNG file structure
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    // IHDR chunk
    const ihdr = createIHDR(width, height);

    // IDAT chunk (compressed image data)
    const idat = createIDAT(width, height, getPixel);

    // IEND chunk
    const iend = createIEND();

    return Buffer.concat([signature, ihdr, idat, iend]);
}

function createIHDR(width, height) {
    const data = Buffer.alloc(13);
    data.writeUInt32BE(width, 0);
    data.writeUInt32BE(height, 4);
    data[8] = 8;  // bit depth
    data[9] = 6;  // color type (RGBA)
    data[10] = 0; // compression method
    data[11] = 0; // filter method
    data[12] = 0; // interlace method

    return createChunk('IHDR', data);
}

function createIDAT(width, height, getPixel) {
    // Create raw scanlines with filter byte
    const rawData = [];

    for (let y = 0; y < height; y++) {
        rawData.push(0); // filter type: None
        for (let x = 0; x < width; x++) {
            const [r, g, b, a] = getPixel(x, y, width, height);
            rawData.push(r, g, b, a);
        }
    }

    const compressed = zlib.deflateSync(Buffer.from(rawData), { level: 9 });
    return createChunk('IDAT', compressed);
}

function createIEND() {
    return createChunk('IEND', Buffer.alloc(0));
}

function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const typeBuffer = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeBuffer, data]));

    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc >>> 0, 0);

    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(data) {
    let crc = 0xFFFFFFFF;

    // Build CRC table
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
    }

    for (let i = 0; i < data.length; i++) {
        crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Icon pixel generator
function getPixel(x, y, width, height) {
    const size = width;
    const cornerRadius = size * 0.2;
    const padding = size * 0.1;

    // Colors: gradient from blue to purple
    const primaryR = 37, primaryG = 99, primaryB = 235;   // #2563eb
    const accentR = 139, accentG = 92, accentB = 246;     // #8b5cf6

    // Check if inside rounded rectangle
    function isInsideRoundedRect(px, py, w, h, r) {
        // Check corners
        if (px < r && py < r) {
            return Math.sqrt((r - px) ** 2 + (r - py) ** 2) <= r;
        }
        if (px >= w - r && py < r) {
            return Math.sqrt((px - (w - r)) ** 2 + (r - py) ** 2) <= r;
        }
        if (px < r && py >= h - r) {
            return Math.sqrt((r - px) ** 2 + (py - (h - r)) ** 2) <= r;
        }
        if (px >= w - r && py >= h - r) {
            return Math.sqrt((px - (w - r)) ** 2 + (py - (h - r)) ** 2) <= r;
        }
        return true;
    }

    if (!isInsideRoundedRect(x, y, size, size, cornerRadius)) {
        return [0, 0, 0, 0]; // Transparent
    }

    // Gradient calculation
    const t = (x + y) / (size * 2);
    const r = Math.round(primaryR + (accentR - primaryR) * t);
    const g = Math.round(primaryG + (accentG - primaryG) * t);
    const b = Math.round(primaryB + (accentB - primaryB) * t);

    // Draw "MDX" text (simplified - just "M" for small icons)
    const letterArea = {
        x: padding + size * 0.1,
        y: padding + size * 0.15,
        w: size * 0.7,
        h: size * 0.6
    };

    const relX = (x - letterArea.x) / letterArea.w;
    const relY = (y - letterArea.y) / letterArea.h;

    if (relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1) {
        const strokeWidth = 0.15;

        // M shape
        const isM = (
            // Left vertical
            (relX < strokeWidth) ||
            // Right vertical
            (relX > 1 - strokeWidth) ||
            // Left diagonal (top)
            (relY < 0.5 && Math.abs(relX - relY * 0.5 - strokeWidth / 2) < strokeWidth / 2) ||
            // Right diagonal (top)
            (relY < 0.5 && Math.abs(relX - (1 - relY * 0.5) + strokeWidth / 2) < strokeWidth / 2)
        );

        if (isM) {
            return [255, 255, 255, 255]; // White
        }
    }

    return [r, g, b, 255];
}

// Generate icons
const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
}

console.log('Generating MDX Viewer icons...\n');

for (const size of sizes) {
    const png = createPNG(size, size, getPixel);
    const filename = `icon-${size}.png`;
    fs.writeFileSync(path.join(iconsDir, filename), png);
    console.log(`✓ ${filename} (${size}×${size})`);
}

console.log('\nIcons generated successfully!');
