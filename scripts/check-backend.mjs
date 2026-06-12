import { spawnSync } from 'node:child_process';

const files = [
  'webui/backend/index.js',
  'webui/backend/search.js',
  'webui/backend/database.js',
  'webui/backend/indexing.js',
  'webui/backend/routes/git.js',
  'webui/backend/routes/files.js',
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
