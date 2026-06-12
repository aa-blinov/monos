import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const target = path.resolve(process.argv[2] || path.join(repoRoot, '..', 'monos-public-snapshot'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }

  return result.stdout;
}

function copyFile(relativePath) {
  const source = path.join(repoRoot, relativePath);
  const destination = path.join(target, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

if (fs.existsSync(target)) {
  throw new Error(`Target already exists: ${target}`);
}

const trackedFiles = run('git', ['ls-files', '-z'])
  .split('\0')
  .filter(Boolean)
  .filter((file) => !file.startsWith('notes/'))
  .filter((file) => !file.startsWith('assets/'))
  .filter((file) => !file.startsWith('release/'));

fs.mkdirSync(target, { recursive: true });
for (const file of trackedFiles) copyFile(file);

spawnSync('git', ['init'], { cwd: target, stdio: 'inherit', shell: false });
spawnSync('git', ['add', '.'], { cwd: target, stdio: 'inherit', shell: false });

console.log(`\nCreated public snapshot at:\n${target}`);
console.log('\nNext steps:');
console.log('1. Review the snapshot.');
console.log('2. Commit it in that directory.');
console.log('3. Push it to a new public GitHub repository.');
