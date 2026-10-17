import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { agentReview, agentTouched, keepAgentChanges, refreshAgentReview, revertAgentChanges, syncBlockedByReview } from './agent-review.js';

const answer = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

test('список изменений агента и пометки заметок', async () => {
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/agent/review');
    return answer({ changes: [{ path: 'notes/План.md', status: 'modified' }, { path: 'notes/Новая.md', status: 'added' }] });
  };
  await refreshAgentReview();
  assert.equal(get(agentReview).changes.length, 2);
  assert.ok(get(agentTouched).has('notes/План.md'));
});

test('оставить и откатить отправляют пути и обновляют список; ошибка сервера даёт пустой список', async () => {
  const sent = [];
  globalThis.fetch = async (url, options) => {
    sent.push([url, JSON.parse(options.body).paths]);
    return answer({ changes: [] });
  };
  await keepAgentChanges(['notes/План.md']);
  await revertAgentChanges(['notes/Новая.md']);
  assert.deepEqual(sent, [['/api/agent/review/keep', ['notes/План.md']], ['/api/agent/review/revert', ['notes/Новая.md']]]);
  assert.equal(get(agentTouched).size, 0);

  globalThis.fetch = async () => answer({ detail: 'boom' }, false);
  await refreshAgentReview();
  assert.deepEqual(get(agentReview), { changes: [] });
});

test('проверенный файл больше не держит синхронизацию', async () => {
  syncBlockedByReview.set(['План.md', 'Список.md']);
  globalThis.fetch = async () => answer({ changes: [{ path: 'notes/Список.md', status: 'modified' }] });
  await keepAgentChanges(['notes/План.md']);
  assert.deepEqual(get(syncBlockedByReview), ['Список.md']);
});
