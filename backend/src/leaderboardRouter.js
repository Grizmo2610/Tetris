'use strict';
const express = require('express');
const { pool } = require('./db');
const logger = require('./logger');

const router = express.Router();

// ─── Validation ───────────────────────────────────────────────────────────────

function sanitizeNickname(n) {
  return String(n).trim().slice(0, 32).replace(/[<>&"']/g, '');
}

function validateScorePayload(body) {
  const { nickname, score, mode, lines, level, result, opponent } = body;
  if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) return 'nickname required';
  if (nickname.trim().length > 32) return 'nickname too long';
  if (!Number.isInteger(score) || score < 0) return 'score must be non-negative integer';
  if (!['solo', 'pvp', 'pvai'].includes(mode)) return 'mode must be solo|pvp|pvai';
  if (!Number.isInteger(lines) || lines < 0) return 'lines must be non-negative integer';
  if (!Number.isInteger(level) || level < 1) return 'level must be >= 1';
  if (result !== null && result !== undefined && !['win', 'loss'].includes(result)) return 'result must be win|loss|null';
  return null;
}

// ─── POST /api/scores ─────────────────────────────────────────────────────────

router.post('/scores', async (req, res) => {
  const err = validateScorePayload(req.body);
  if (err) {
    return res.status(400).json({ error: 'Validation failed', details: err });
  }

  const { score, mode, lines, level } = req.body;
  const nickname  = sanitizeNickname(req.body.nickname);
  const result    = req.body.result   ?? null;
  const opponent  = req.body.opponent ? sanitizeNickname(req.body.opponent) : null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO leaderboard_entries
           (nickname, score, mode, lines, level, result, opponent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [nickname, score, mode, lines, level, result, opponent]
      );
      logger.info('score.saved', { mode, score, nickname });
      return res.status(201).json({ id: rows[0].id, created_at: rows[0].created_at });
    } catch (dbErr) {
      logger.error('score.save_failed', { error: dbErr.message, attempt });
      if (attempt === 2) {
        return res.status(503).json({ error: 'Internal server error' });
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
});

// ─── GET /api/leaderboard ─────────────────────────────────────────────────────

router.get('/leaderboard', async (req, res) => {
  const mode  = req.query.mode  ?? 'solo';
  const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 100);

  if (!['solo', 'pvp', 'pvai'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode parameter' });
  }
  if (isNaN(limit) || limit < 1) {
    return res.status(400).json({ error: 'Invalid limit parameter' });
  }

  const onlyWins = mode !== 'solo';
  const whereClause = onlyWins
    ? `WHERE mode = $1 AND result = 'win'`
    : `WHERE mode = $1`;

  try {
    const { rows } = await pool.query(
      `SELECT
         ROW_NUMBER() OVER (ORDER BY score DESC) AS rank,
         id, nickname, score, lines, level, result, opponent, created_at
       FROM leaderboard_entries
       ${whereClause}
       ORDER BY score DESC
       LIMIT $2`,
      [mode, limit]
    );

    // Total count
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM leaderboard_entries ${whereClause}`,
      [mode]
    );

    return res.json({
      entries: rows.map(r => ({
        ...r,
        rank: Number(r.rank),
        score: Number(r.score),
        lines: Number(r.lines),
        level: Number(r.level),
        created_at: r.created_at,
      })),
      total: Number(countRows[0].total),
      mode,
    });
  } catch (err) {
    logger.error('leaderboard.fetch_failed', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
