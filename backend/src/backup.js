'use strict';
const cron = require('node-cron');
const { pool } = require('./db');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('./logger');

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

function formatDate(d) {
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function convertToCSV(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const v = row[h] ?? '';
        const s = String(v).replace(/"/g, '""');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
      }).join(',')
    ),
  ];
  return lines.join('\n');
}

async function runBackup() {
  logger.info('backup.starting');

  const { rows } = await pool.query(
    `SELECT nickname, score, mode, lines, level, result, opponent, created_at
     FROM leaderboard_entries
     ORDER BY created_at DESC`
  );

  const csv      = convertToCSV(rows);
  const filename = `backups/leaderboard-${formatDate(new Date())}.csv`;

  const client = getR2Client();
  await client.send(new PutObjectCommand({
    Bucket:      process.env.R2_BUCKET_NAME,
    Key:         filename,
    Body:        csv,
    ContentType: 'text/csv',
  }));

  logger.info('backup.success', { filename, entries: rows.length });
}

// Schedule: every Sunday at 03:00 UTC
function scheduleBackup() {
  if (!process.env.R2_ENDPOINT) {
    logger.warn('backup.skipped', { reason: 'R2_ENDPOINT not configured' });
    return;
  }

  cron.schedule('0 3 * * 0', async () => {
    try {
      await runBackup();
    } catch (err) {
      logger.error('backup.failed', { error: err.message });
    }
  });

  logger.info('backup.scheduled', { schedule: 'Sunday 03:00 UTC' });
}

module.exports = { scheduleBackup, runBackup };
