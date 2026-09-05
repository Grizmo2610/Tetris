import { HeuristicAI } from './heuristic.js';
import { MetaHeuristicAI } from './metaHeuristic.js';

// ─── Factory ──────────────────────────────────────────────────────────────────
//
// difficulty map:
//   easy        → HeuristicAI      (1-piece lookahead, 30% error)
//   medium      → HeuristicAI      (2-piece lookahead, 10% error)
//   hard        → MetaHeuristicAI  (beam width 8, 4-piece lookahead, 0% error)
//   expert      → MetaHeuristicAI  (beam width 12, 5-piece lookahead, 0% error)
//
// No ONNX, no network calls, no model files. Fully client-side.

export async function createAIController(difficulty) {
  switch (difficulty) {
    case 'easy':   return new HeuristicAI('easy');
    case 'medium': return new HeuristicAI('medium');
    case 'hard':   return new MetaHeuristicAI('meta-hard');
    case 'expert': return new MetaHeuristicAI('meta-expert');
    default:
      console.warn(`[AI] Unknown difficulty "${difficulty}", defaulting to medium`);
      return new HeuristicAI('medium');
  }
}
