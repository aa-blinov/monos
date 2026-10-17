// node-pty's npm package ships `spawn-helper` without its executable bit, so every shell fails to start
// ("posix_spawnp failed") until it is set. Runs after every install, here and in CI, before the app is
// packaged, so the packaged app carries an executable helper too. Nothing to do on Windows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'node-pty');
const candidates = [path.join(root, 'build', 'Release', 'spawn-helper')];
const prebuilds = path.join(root, 'prebuilds');
if (fs.existsSync(prebuilds)) {
  for (const dir of fs.readdirSync(prebuilds)) candidates.push(path.join(prebuilds, dir, 'spawn-helper'));
}
for (const file of candidates) {
  if (!fs.existsSync(file)) continue;
  fs.chmodSync(file, 0o755);
  console.log(`node-pty: ${path.relative(root, file)} is executable`);
}
