// In-memory replay cache + file export/import.
// Holds at most one replay at a time (the most recently completed match).
// Never writes to localStorage or the network.

const REPLAY_VERSION = 1;

let _cached = null;

export const replayStorage = {
  set(replayData) {
    _cached = replayData;
  },

  get() {
    return _cached;
  },

  has() {
    return _cached !== null;
  },

  clear() {
    _cached = null;
  },

  // Trigger a browser file download of the cached replay.
  download(replayData) {
    const data = replayData ?? _cached;
    if (!data) return;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const label = data.meta?.mode ?? 'replay';
    a.href     = url;
    a.download = `tetris-replay-${date}-${label}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Parse and validate a JSON file chosen by the user.
  // Returns the ReplayData object on success, throws on failure.
  async loadFile(file) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Invalid replay file (not valid JSON)');
    }
    if (!data || data.version !== REPLAY_VERSION) {
      throw new Error('Incompatible replay version');
    }
    if (!data.meta || !data.p1) {
      throw new Error('Replay file is missing required fields');
    }
    return data;
  },
};

// Build a complete ReplayData envelope from individual player blocks.
//
// mode     — 'solo' | 'localPvp' | 'onlinePvp' | 'pvai'
// winner   — nickname or null
// p1Block  — return value of recorder.finish(meta)
// p2Block  — same, or null for solo
export function buildReplayData({ mode, winner, p1Block, p2Block = null, durationMs }) {
  return {
    version: REPLAY_VERSION,
    meta: {
      mode,
      recordedAt: new Date().toISOString(),
      durationMs,
      winner,
    },
    p1: p1Block,
    p2: p2Block,
  };
}