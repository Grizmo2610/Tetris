import { useState, useCallback } from 'react';

const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';

// ─── useLeaderboard ───────────────────────────────────────────────────────────
// Returns { entries, total, loading, error, refetch }

export function useLeaderboard(mode = 'solo', limit = 20) {
  const [entries,  setEntries]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/leaderboard?mode=${mode}&limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mode, limit]);

  return { entries, total, loading, error, refetch };
}

// ─── submitScore ──────────────────────────────────────────────────────────────
// Fire-and-forget with 3 retries. Resolves to { ok, id } or { ok: false }.

export async function submitScore({ nickname, score, mode, lines, level, result = null, opponent = null }) {
  const payload = { nickname, score, mode, lines, level, result, opponent };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, id: data.id };
      }
      // 4xx — don't retry
      if (res.status < 500) return { ok: false, status: res.status };
    } catch {
      // Network error — retry after back-off
    }
    if (attempt < 2) await sleep((attempt + 1) * 1000);
  }
  return { ok: false };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
