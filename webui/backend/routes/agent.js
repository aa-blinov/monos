import { agentRulesStatus, ensureAgentRules } from '../agent-rules.js';
import { indexAllFiles } from '../indexing.js';
import { requireThisComputer } from './helpers.js';

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
      res.status(500).json({ detail: error.message || String(error) });
    }
  });
}
