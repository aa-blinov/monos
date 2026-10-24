import { agentRulesStatus, ensureAgentRules } from '../agent-rules.js';
import { indexAllFiles } from '../indexing.js';
import { requireThisComputer } from './helpers.js';
import { ensureCheckpoint, keepChange, reviewDiff, reviewList, revertChange } from '../agent-review.js';
import { broadcast } from '../watcher.js';
import { sendError } from './helpers.js';

const pathsOf = (req) => (Array.isArray(req.body?.paths) ? req.body.paths.filter((item) => typeof item === 'string' && /^notes\//.test(item) && !item.includes('..')) : []);

// The rule files an agent reads in the notes folder (see agent-rules.js). Set up from Settings, on this
// computer: the agent and its terminal exist only here.
export function registerAgentRoutes(app) {
  app.get('/api/agent/rules', requireThisComputer, (_req, res) => {
    res.json(agentRulesStatus());
  });

  app.post('/api/agent/rules', requireThisComputer, (_req, res) => {
    try {
      const created = ensureAgentRules();
      indexAllFiles();
      res.json({ created, files: agentRulesStatus() });
    } catch (error) {
      sendError(res, error);
    }
  });

  // The agent is about to start (or the terminal opened): what the notes look like now is the baseline.
  app.post('/api/agent/checkpoint', requireThisComputer, (_req, res) => {
    const state = ensureCheckpoint();
    res.json({ checkpoint: state.checkpoint });
  });

  app.get('/api/agent/review', requireThisComputer, (_req, res) => {
    try {
      res.json(reviewList());
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/agent/review/diff', requireThisComputer, (req, res) => {
    try {
      res.json({ diff: reviewDiff(String(req.query.path || '')) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/review/keep', requireThisComputer, (req, res) => {
    keepChange(pathsOf(req));
    broadcast({ type: 'agent-review' });
    res.json(reviewList());
  });

  app.post('/api/agent/review/revert', requireThisComputer, (req, res) => {
    try {
      const paths = pathsOf(req);
      revertChange(paths);
      indexAllFiles();
      // The open pages read the files again: the note on screen shows the old text at once.
      broadcast({ type: 'files', paths });
      broadcast({ type: 'agent-review' });
      res.json(reviewList());
    } catch (error) {
      sendError(res, error);
    }
  });
}
