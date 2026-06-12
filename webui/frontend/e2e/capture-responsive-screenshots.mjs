import { spawn } from 'node:child_process';
import path from 'node:path';

const rawName = process.argv[2] || 'responsive-visual';
const safeName = rawName
  .trim()
  .replace(/[^a-z0-9._-]+/gi, '-')
  .replace(/^-+|-+$/g, '') || 'responsive-visual';

const auditDir = path.join('e2e', 'artifacts', safeName);
const command = process.execPath;
const args = [
  path.join('node_modules', '@playwright', 'test', 'cli.js'),
  'test',
  'e2e/03-responsive-visual.spec.js',
  '--reporter=list',
];

console.log(`Saving responsive screenshots to ${auditDir}`);

const child = spawn(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    E2E_VISUAL_AUDIT_DIR: auditDir,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
