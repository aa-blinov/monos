import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');

const colors = {
  bgTop: [47, 43, 36, 255],
  bgBottom: [29, 29, 27, 255],
  border: [216, 166, 87, 210],
  cream: [235, 219, 178, 255],
  muted: [168, 153, 132, 220],
  green: [142, 192, 124, 245],
};

const svg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="184" y1="96" x2="840" y2="928" gradientUnits="userSpaceOnUse">
      <stop stop-color="#302b24"/>
      <stop offset="1" stop-color="#1d1d1b"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(314 238) rotate(45) scale(640)">
      <stop stop-color="#d8a657" stop-opacity=".24"/>
      <stop offset="1" stop-color="#d8a657" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="64" y="72" width="896" height="896" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="38" stdDeviation="42" flood-color="#000" flood-opacity=".28"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <rect x="96" y="96" width="832" height="832" rx="218" fill="url(#bg)"/>
    <rect x="96" y="96" width="832" height="832" rx="218" fill="url(#glow)"/>
    <rect x="118" y="118" width="788" height="788" rx="196" stroke="#d8a657" stroke-opacity=".62" stroke-width="28"/>
    <path d="M344 302H262V722H344" stroke="#ebdbb2" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M680 302H762V722H680" stroke="#ebdbb2" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M390 400H626" stroke="#d8a657" stroke-width="46" stroke-linecap="round"/>
    <path d="M390 512H634" stroke="#ebdbb2" stroke-opacity=".92" stroke-width="46" stroke-linecap="round"/>
    <path d="M390 624H558" stroke="#a89984" stroke-opacity=".88" stroke-width="46" stroke-linecap="round"/>
    <circle cx="646" cy="624" r="28" fill="#8ec07c"/>
  </g>
</svg>
`;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function mix(a, b, amount) {
  return a.map((channel, index) => Math.round(channel + (b[index] - channel) * amount));
}

function blendPixel(data, width, x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= width || y >= width || alpha <= 0) return;
  const index = (y * width + x) * 4;
  const sourceAlpha = (color[3] / 255) * alpha;
  const targetAlpha = data[index + 3] / 255;
  const outAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);

  if (outAlpha <= 0) return;

  for (let channel = 0; channel < 3; channel += 1) {
    const source = color[channel] / 255;
    const target = data[index + channel] / 255;
    data[index + channel] = Math.round(((source * sourceAlpha) + (target * targetAlpha * (1 - sourceAlpha))) / outAlpha * 255);
  }
  data[index + 3] = Math.round(outAlpha * 255);
}

function roundedRectDistance(x, y, left, top, right, bottom, radius) {
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const halfWidth = (right - left) / 2;
  const halfHeight = (bottom - top) / 2;
  const qx = Math.abs(x - centerX) - halfWidth + radius;
  const qy = Math.abs(y - centerY) - halfHeight + radius;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

function drawIcon(size) {
  const data = Buffer.alloc(size * size * 4);
  const scale = size / 1024;
  const s = (value) => value * scale;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const ux = x / scale;
      const uy = y / scale;
      const distance = roundedRectDistance(ux, uy, 96, 96, 928, 928, 218);
      const coverage = clamp(0.5 - distance * scale);
      if (coverage <= 0) continue;

      const gradient = mix(colors.bgTop, colors.bgBottom, clamp((uy - 96) / 832));
      const glowDistance = Math.hypot(ux - 314, uy - 238);
      const glow = clamp(1 - glowDistance / 640) * 0.22;
      const color = mix(gradient, colors.border, glow);
      blendPixel(data, size, x, y, color, coverage);

      const border = clamp((14 - Math.abs(distance)) * scale);
      blendPixel(data, size, x, y, colors.border, border * 0.65);
    }
  }

  drawPolyline(data, size, [[344, 302], [262, 302], [262, 722], [344, 722]], 58, colors.cream, scale);
  drawPolyline(data, size, [[680, 302], [762, 302], [762, 722], [680, 722]], 58, colors.cream, scale);
  drawLine(data, size, 390, 400, 626, 400, 46, colors.border, scale);
  drawLine(data, size, 390, 512, 634, 512, 46, colors.cream, scale);
  drawLine(data, size, 390, 624, 558, 624, 46, colors.muted, scale);
  drawCircle(data, size, 646, 624, 28, colors.green, scale);

  return encodePng(size, size, data);
}

function drawPolyline(data, size, points, width, color, scale) {
  for (let index = 0; index < points.length - 1; index += 1) {
    drawLine(data, size, points[index][0], points[index][1], points[index + 1][0], points[index + 1][1], width, color, scale);
  }
}

function drawLine(data, size, x1, y1, x2, y2, width, color, scale) {
  const radius = (width / 2) * scale;
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) * scale - radius - 2));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(x1, x2) * scale + radius + 2));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) * scale - radius - 2));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y1, y2) * scale + radius + 2));
  const ax = x1 * scale;
  const ay = y1 * scale;
  const bx = x2 * scale;
  const by = y2 * scale;
  const vx = bx - ax;
  const vy = by - ay;
  const lengthSquared = vx * vx + vy * vy;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = lengthSquared === 0 ? 0 : clamp(((px - ax) * vx + (py - ay) * vy) / lengthSquared);
      const dx = px - (ax + vx * t);
      const dy = py - (ay + vy * t);
      const distance = Math.hypot(dx, dy);
      const coverage = clamp(radius + 0.75 - distance);
      blendPixel(data, size, x, y, color, coverage);
    }
  }
}

function drawCircle(data, size, cx, cy, radius, color, scale) {
  const centerX = cx * scale;
  const centerY = cy * scale;
  const scaledRadius = radius * scale;
  const minX = Math.max(0, Math.floor(centerX - scaledRadius - 2));
  const maxX = Math.min(size - 1, Math.ceil(centerX + scaledRadius + 2));
  const minY = Math.max(0, Math.floor(centerY - scaledRadius - 2));
  const maxY = Math.min(size - 1, Math.ceil(centerY + scaledRadius + 2));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      const coverage = clamp(scaledRadius + 0.75 - distance);
      blendPixel(data, size, x, y, color, coverage);
    }
  }
}

function encodePng(width, height, rgba) {
  const scanlineLength = width * 4 + 1;
  const raw = Buffer.alloc(scanlineLength * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * scanlineLength] = 0;
    rgba.copy(raw, y * scanlineLength + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', createIhdr(width, height)),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createIhdr(width, height) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  buffer[10] = 0;
  buffer[11] = 0;
  buffer[12] = 0;
  return buffer;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry[0] = image.size >= 256 ? 0 : image.size;
    entry[1] = image.size >= 256 ? 0 : image.size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += image.data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

function createIcns(images) {
  const chunks = images.map((image) => {
    const header = Buffer.alloc(8);
    header.write(image.type, 0, 4, 'ascii');
    header.writeUInt32BE(image.data.length + 8, 4);
    return Buffer.concat([header, image.data]);
  });
  const totalLength = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(totalLength, 4);
  return Buffer.concat([header, ...chunks]);
}

fs.mkdirSync(buildDir, { recursive: true });

const pngSizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const pngs = new Map(pngSizes.map((size) => [size, drawIcon(size)]));

fs.writeFileSync(path.join(buildDir, 'icon.svg'), svg);
fs.writeFileSync(path.join(buildDir, 'icon.png'), pngs.get(1024));
fs.writeFileSync(path.join(buildDir, 'icon.ico'), createIco([16, 32, 48, 64, 128, 256].map((size) => ({ size, data: pngs.get(size) }))));
fs.writeFileSync(path.join(buildDir, 'icon.icns'), createIcns([
  { type: 'icp4', data: pngs.get(16) },
  { type: 'icp5', data: pngs.get(32) },
  { type: 'icp6', data: pngs.get(64) },
  { type: 'ic07', data: pngs.get(128) },
  { type: 'ic08', data: pngs.get(256) },
  { type: 'ic09', data: pngs.get(512) },
  { type: 'ic10', data: pngs.get(1024) },
]));

console.log(`Generated app icons in ${path.relative(repoRoot, buildDir)}`);
