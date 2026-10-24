// Native packages (better-sqlite3, node-pty) ship a prebuilt binary for every system and every processor. The app
// loads only the one built for its own Electron, but the others were copied into the macOS bundle too, and an Intel
// executable inside an Apple-silicon app makes macOS warn that the app has a component that will stop working
// ("support for Intel apps is ending"). After packaging, a macOS build keeps the prebuilds of its own processor only.
const fs = require('node:fs');
const path = require('node:path');

const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };
const PREBUILD = /^(darwin|linux|linuxmusl|win32)-(x64|arm64|ia32|armv7l|arm)(\.node)?$/;

/** Whether a file or folder of a `prebuilds` directory belongs in a macOS build for `arch`. Unknown names stay. */
function keepPrebuild(name, arch) {
  const match = PREBUILD.exec(name);
  if (!match) return true;
  if (arch === 'universal') return match[1] === 'darwin';
  return match[1] === 'darwin' && match[2] === arch;
}

function prune(dir, arch, removed = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name === 'prebuilds' && entry.isDirectory()) {
      for (const item of fs.readdirSync(full)) {
        if (keepPrebuild(item, arch)) continue;
        fs.rmSync(path.join(full, item), { recursive: true, force: true });
        removed.push(path.relative(dir, path.join(full, item)));
      }
    } else if (entry.isDirectory() && !entry.isSymbolicLink()) {
      prune(full, arch, removed);
    }
  }
  return removed;
}

exports.keepPrebuild = keepPrebuild;
exports.prune = prune;

exports.default = async function prunePrebuilds(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const arch = ARCH_NAMES[context.arch];
  const unpacked = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents', 'Resources', 'app.asar.unpacked', 'node_modules',
  );
  if (!arch || !fs.existsSync(unpacked)) return;
  const removed = prune(unpacked, arch);
  console.log(`  • pruned prebuilds for other systems and processors  kept=darwin-${arch} removed=${removed.length}`);
};
