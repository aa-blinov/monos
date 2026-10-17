import test from 'node:test';
import assert from 'node:assert/strict';
import { connectLocal, makeBareRemote, runTwoDeviceScenario, startDevice } from './support/two-devices.js';

// Two real backends syncing through a repository on this machine: everything the sync does that does not
// depend on GitHub itself. github-live.test.js repeats the scenario against GitHub when a token is given.
test('два устройства: заметка, правка, кириллица, конфликт и итог', { timeout: 180000 }, async () => {
  const { remote, cleanup } = makeBareRemote();
  const a = await startDevice('Ноутбук');
  const b = await startDevice('Телефон');
  try {
    await connectLocal(a, remote, { first: true });
    await connectLocal(b, remote);
    await runTwoDeviceScenario(a, b, assert);
  } finally {
    await a.stop();
    await b.stop();
    cleanup();
  }
});
