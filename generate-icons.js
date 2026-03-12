// generate-icons.js
// Run with: node generate-icons.js
// Requires: npm install canvas
// OR — just use https://maskable.app/editor or https://realfavicongenerator.net
// to generate icons from your logo.
//
// This script generates simple placeholder icons with the BuildTrack "BT" logo.
// Replace with proper branded icons for production.

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

const outDir = path.join(__dirname, 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0A0A0C';
  ctx.fillRect(0, 0, size, size);

  // Gold rounded square inset
  const pad = size * 0.1;
  const r   = size * 0.2;
  ctx.fillStyle = '#F5A623';
  ctx.beginPath();
  ctx.moveTo(pad + r, pad);
  ctx.lineTo(size - pad - r, pad);
  ctx.quadraticCurveTo(size - pad, pad, size - pad, pad + r);
  ctx.lineTo(size - pad, size - pad - r);
  ctx.quadraticCurveTo(size - pad, size - pad, size - pad - r, size - pad);
  ctx.lineTo(pad + r, size - pad);
  ctx.quadraticCurveTo(pad, size - pad, pad, size - pad - r);
  ctx.lineTo(pad, pad + r);
  ctx.quadraticCurveTo(pad, pad, pad + r, pad);
  ctx.closePath();
  ctx.fill();

  // "BT" text
  ctx.fillStyle = '#0A0A0C';
  ctx.font = `bold ${size * 0.38}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BT', size / 2, size / 2);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), buffer);
  console.log(`✅ icon-${size}.png`);
});

console.log('\nDone! Icons saved to /icons/ folder.');
console.log('Or use: https://maskable.app/editor for production icons.');
