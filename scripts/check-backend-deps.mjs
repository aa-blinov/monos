// The backend's tests and the desktop build must run the same dependencies. The build takes
// them from the root package.json (build.files leaves webui/backend/node_modules out), so every
// runtime dependency has to resolve from webui/backend to the copy the root installs. The one
// exception is better-sqlite3: it is compiled for a runtime, so the backend keeps its own build
// for plain Node (see webui/backend/database.js). That build must still be the root's version.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'webui', 'backend');
const ownBuilds = new Set(['better-sqlite3']);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const rootPackage = readJson(path.join(root, 'package.json'));
const backendPackage = readJson(path.join(backend, 'package.json'));
const shipped = rootPackage.dependencies ?? {};
const problems = [];

// The copy of `name` that code in `dir` loads: the nearest node_modules up the tree, as Node looks it up.
function loadedCopy(dir, name) {
  for (let current = dir; ; current = path.dirname(current)) {
    const candidate = path.join(current, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate);
    if (path.dirname(current) === current) return null;
  }
}

const versionOf = (copy) => readJson(path.join(copy, 'package.json')).version;
const show = (copy) => path.relative(root, copy);

for (const [name, range] of Object.entries(backendPackage.dependencies ?? {})) {
  if (!ownBuilds.has(name)) {
    problems.push(`webui/backend/package.json declares "${name}"; only ${[...ownBuilds].join(', ')} may be installed there`);
  } else if (range !== shipped[name]) {
    problems.push(`"${name}" is "${range}" in webui/backend and "${shipped[name]}" at the root`);
  }
}

const backendRealDir = fs.realpathSync(backend);
for (const name of Object.keys(shipped)) {
  const rootCopy = loadedCopy(root, name);
  if (!rootCopy) {
    problems.push(`"${name}" is not installed at the root; run npm ci there`);
    continue;
  }
  const backendCopy = loadedCopy(backend, name);
  if (ownBuilds.has(name)) {
    const ownCopy = path.join(backendRealDir, 'node_modules', name);
    if (backendCopy !== ownCopy) {
      problems.push(`webui/backend has no own "${name}", so the tests would load the root's build; run npm ci in webui/backend`);
    } else if (versionOf(ownCopy) !== versionOf(rootCopy)) {
      problems.push(`"${name}" is ${versionOf(ownCopy)} in webui/backend and ${versionOf(rootCopy)} at the root`);
    }
  } else if (backendCopy !== rootCopy && versionOf(backendCopy) !== versionOf(rootCopy)) {
    problems.push(`"${name}" is ${versionOf(backendCopy)} in webui/backend and ${versionOf(rootCopy)} at the root`);
  } else if (backendCopy !== rootCopy) {
    problems.push(`webui/backend has its own copy of "${name}" (${show(backendCopy)}); it must use the root's`);
  }
}

if (!(rootPackage.build?.files ?? []).includes('!webui/backend/node_modules/**')) {
  problems.push('build.files must leave out webui/backend/node_modules, or the app would ship the build for plain Node');
}

if (problems.length > 0) {
  console.error('The backend does not run the dependencies the app ships:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Backend dependencies match the app: ${Object.keys(shipped).length} shipped packages, ${[...ownBuilds].join(', ')} built for Node.`);
}
