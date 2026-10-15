import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The install metadata the browser reads: the manifest, its icons, the head links and the worker file.
const publicDir = new URL('../../public/', import.meta.url);
const indexHtml = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf-8');

test('манифест описывает Monos для установки: имя, режим окна, цвета и иконки, которые лежат в public', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.webmanifest', publicDir), 'utf-8'));
  assert.equal(manifest.name, 'Monos');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(new URL(icon.src.slice(1), publicDir)), `${icon.src} exists in public`);
  }
});

test('страница ссылается на манифест и иконку для iOS, а воркер лежит в корне и не кэширует заметки', () => {
  assert.match(indexHtml, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  assert.match(indexHtml, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" \/>/);
  assert.ok(fs.existsSync(new URL('apple-touch-icon.png', publicDir)));
  const worker = fs.readFileSync(new URL('sw.js', publicDir), 'utf-8');
  assert.match(worker, /addEventListener\('fetch'/);
  assert.doesNotMatch(worker, /caches\./);
});
