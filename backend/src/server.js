'use strict';
require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');

const logger            = require('./logger');
const { pool }          = require('./db');
const { registerHandlers } = require('./socketHandlers');
const leaderboardRouter = require('./leaderboardRouter');
const { scheduleBackup } = require('./backup');
const { getRoomStats }  = require('./roomManager');

const PORT = process.env.PORT ?? 4000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// ─── Express ──────────────────────────────────────────────────────────────────

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                   // curl / no-origin
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`Origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST'],
  credentials: false,
}));

app.use(express.json());

// ─── In-memory metrics ────────────────────────────────────────────────────────

const metrics = {
  roomsCreated: 0,
  gamesCompleted: 0,
  scoresSubmitted: 0,
  scoreSubmitFailures: 0,
  backupsSucceeded: 0,
  backupsFailed: 0,
};

app.locals.metrics = metrics;

// ─── Health endpoint ──────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    await pool.query('SELECT 1');
    dbStatus = 'connected';
  } catch { dbStatus = 'error'; }

  const roomStats = getRoomStats();

  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    rooms: roomStats,
    connections: io.engine.clientsCount,
    metrics,
    db: dbStatus,
  });
});

// ─── API routes ───────────────────────────────────────────────────────────────

app.use('/api', leaderboardRouter);

// ─── HTTP + Socket.io server ──────────────────────────────────────────────────

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
  pingTimeout:  45_000,
  pingInterval: 10_000,
});

// ─── Socket.io connection handler ─────────────────────────────────────────────

io.on('connection', (socket) => {
  logger.info('player.connected', { socketId: socket.id });
  registerHandlers(io, socket);
});

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  logger.info('server.started', { port: PORT, allowedOrigins: ALLOWED_ORIGINS });
  scheduleBackup();
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  logger.info('server.shutting_down');
  server.close(() => {
    pool.end();
    process.exit(0);
  });
});

process.on('unhandledRejection', (err) => {
  logger.error('server.unhandled_rejection', { error: String(err) });
});
