import test from 'node:test';
import assert from 'node:assert/strict';
import { qrPath } from './qr-code.js';

test('qrPath: квадрат с полем в 4 модуля и тремя поисковыми узорами', () => {
  const { size, path } = qrPath('http://192.168.1.20:8000/?token=abc123');
  assert.ok(size >= 21 + 8, `size ${size}`);
  // The top-left finder pattern starts at the quiet zone corner.
  assert.match(path, /^M4 4h1v1h-1z/);
  assert.ok(path.includes(`M${size - 5} 4h1v1h-1z`), 'top-right finder');
  assert.ok(path.includes(`M4 ${size - 5}h1v1h-1z`), 'bottom-left finder');
});

test('qrPath: длинный адрес даёт код крупнее, пустой — всё равно код', () => {
  assert.ok(qrPath('x'.repeat(200)).size > qrPath('x').size);
  assert.ok(qrPath('').path.length > 0);
});
