const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const STATE_PATH = path.join(__dirname, 'world-state.json');
const ACCOUNTS_PATH = path.join(__dirname, 'accounts.json');
const CHAT_HISTORY_LIMIT = 80;
const INACTIVE_DELETE_MS = 14 * 24 * 60 * 60 * 1000;

const players = new Map();
const worldBlocks = new Map();
const chatHistory = [];
const accounts = new Map();
const sessions = new Map();

let persistWorldTimer = null;
let persistAccountsTimer = null;

app.use(express.json({ limit: '128kb' }));

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

function blockKey(x, y, z) {
  return `${x},${y},${z}`;
}

function safeUsername(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isValidUsername(username) {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 120;
}

function createSession(username) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { username, createdAt: Date.now() });
  return token;
}

function cleanupInactiveAccounts() {
  const now = Date.now();
  let removed = 0;
  for (const [username, account] of accounts) {
    const lastActive = Number(account?.lastActive || account?.createdAt || 0);
    if (!lastActive) continue;
    if ((now - lastActive) > INACTIVE_DELETE_MS) {
      accounts.delete(username);
      removed++;
    }
  }
  if (removed > 0) schedulePersistAccounts();
}

function loadWorldState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return;
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
    for (const entry of blocks) {
      const x = Number(entry?.x);
      const y = Number(entry?.y);
      const z = Number(entry?.z);
      const type = Number(entry?.type);
      if (![x, y, z, type].every(Number.isFinite)) continue;
      worldBlocks.set(blockKey(x, y, z), { x, y, z, type });
    }
    console.log(`Loaded ${worldBlocks.size} persisted block updates.`);
  } catch (err) {
    console.error('Failed loading world state:', err);
  }
}

function loadAccounts() {
  try {
    if (!fs.existsSync(ACCOUNTS_PATH)) return;
    const raw = fs.readFileSync(ACCOUNTS_PATH, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.accounts) ? parsed.accounts : [];
    for (const entry of list) {
      const username = safeUsername(entry?.username);
      if (!isValidUsername(username)) continue;
      if (!entry?.passwordHash) continue;
      accounts.set(username, {
        username,
        passwordHash: String(entry.passwordHash),
        createdAt: Number(entry.createdAt) || Date.now(),
        lastActive: Number(entry.lastActive) || Date.now(),
        playerState: {
          x: Number(entry?.playerState?.x) || 0,
          y: Number(entry?.playerState?.y) || 27,
          z: Number(entry?.playerState?.z) || 0,
          rot: Number(entry?.playerState?.rot) || 0,
        },
      });
    }
    cleanupInactiveAccounts();
    console.log(`Loaded ${accounts.size} accounts.`);
  } catch (err) {
    console.error('Failed loading accounts:', err);
  }
}

function schedulePersistWorldState() {
  if (persistWorldTimer) clearTimeout(persistWorldTimer);
  persistWorldTimer = setTimeout(() => {
    persistWorldTimer = null;
    const payload = { updatedAt: Date.now(), blocks: Array.from(worldBlocks.values()) };
    fs.writeFile(STATE_PATH, JSON.stringify(payload), (err) => {
      if (err) console.error('Failed persisting world state:', err);
    });
  }, 300);
}

function schedulePersistAccounts() {
  if (persistAccountsTimer) clearTimeout(persistAccountsTimer);
  persistAccountsTimer = setTimeout(() => {
    persistAccountsTimer = null;
    const payload = {
      updatedAt: Date.now(),
      accounts: Array.from(accounts.values()).map((account) => ({
        username: account.username,
        passwordHash: account.passwordHash,
        createdAt: account.createdAt,
        lastActive: account.lastActive,
        playerState: account.playerState,
      })),
    };
    fs.writeFile(ACCOUNTS_PATH, JSON.stringify(payload), (err) => {
      if (err) console.error('Failed persisting accounts:', err);
    });
  }, 300);
}

function touchAccount(username, statePatch = null) {
  const account = accounts.get(username);
  if (!account) return;
  account.lastActive = Date.now();
  if (statePatch && typeof statePatch === 'object') {
    account.playerState = {
      ...account.playerState,
      ...statePatch,
    };
  }
  schedulePersistAccounts();
}

loadWorldState();
loadAccounts();
setInterval(cleanupInactiveAccounts, 6 * 60 * 60 * 1000);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    players: players.size,
    persistedBlocks: worldBlocks.size,
    accounts: accounts.size,
    uptimeSec: Math.floor(process.uptime())
  });
});

app.post('/auth/register', (req, res) => {
  const username = safeUsername(req.body?.username);
  const password = String(req.body?.password || '');
  const passwordAgain = String(req.body?.passwordAgain || '');
  const notRobot = req.body?.notRobot === true;

  cleanupInactiveAccounts();

  if (!isValidUsername(username)) return res.status(400).json({ ok: false, error: 'Username must be 3-24 chars: a-z, 0-9, _' });
  if (!isValidPassword(password)) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
  if (password !== passwordAgain) return res.status(400).json({ ok: false, error: 'Passwords do not match.' });
  if (!notRobot) return res.status(400).json({ ok: false, error: 'Please confirm "I am not a robot".' });
  if (accounts.has(username)) return res.status(409).json({ ok: false, error: 'Username already taken.' });

  const now = Date.now();
  accounts.set(username, {
    username,
    passwordHash: hashPassword(password),
    createdAt: now,
    lastActive: now,
    playerState: { x: 0, y: 27, z: 0, rot: 0 },
  });
  schedulePersistAccounts();

  const token = createSession(username);
  return res.json({ ok: true, token, username });
});

app.post('/auth/login', (req, res) => {
  const username = safeUsername(req.body?.username);
  const password = String(req.body?.password || '');
  const account = accounts.get(username);
  if (!account) return res.status(404).json({ ok: false, error: 'Account not found.' });
  if (account.passwordHash !== hashPassword(password)) return res.status(401).json({ ok: false, error: 'Wrong password.' });

  touchAccount(username);
  const token = createSession(username);
  return res.json({ ok: true, token, username });
});

io.use((socket, next) => {
  const token = String(socket.handshake?.auth?.token || '');
  const username = safeUsername(socket.handshake?.auth?.username);
  const session = sessions.get(token);
  if (!session || session.username !== username || !accounts.has(username)) {
    return next(new Error('auth_failed'));
  }
  socket.data.username = username;
  return next();
});

io.on('connection', (socket) => {
  const username = socket.data.username;
  const account = accounts.get(username);
  const savedState = account?.playerState || { x: 0, y: 27, z: 0, rot: 0 };
  console.log('Player connected:', username, socket.id);

  players.set(socket.id, {
    id: socket.id,
    name: username,
    x: Number(savedState.x) || 0,
    y: Number(savedState.y) || 27,
    z: Number(savedState.z) || 0,
    rot: Number(savedState.rot) || 0,
    updatedAt: Date.now()
  });

  touchAccount(username);

  socket.emit('bootstrap', {
    selfId: socket.id,
    selfState: {
      x: Number(savedState.x) || 0,
      y: Number(savedState.y) || 27,
      z: Number(savedState.z) || 0,
      rot: Number(savedState.rot) || 0,
      name: username,
    },
    players: Array.from(players.values()).filter((player) => player.id !== socket.id),
    chat: chatHistory,
    blocks: Array.from(worldBlocks.values())
  });

  socket.broadcast.emit('playerJoined', {
    id: socket.id,
    name: username,
    x: Number(savedState.x) || 0,
    y: Number(savedState.y) || 27,
    z: Number(savedState.z) || 0,
    rot: Number(savedState.rot) || 0
  });

  socket.on('move', (payload) => {
    const existing = players.get(socket.id);
    if (!existing || !payload || typeof payload !== 'object') return;

    const nextX = Number(payload.x);
    const nextY = Number(payload.y);
    const nextZ = Number(payload.z);
    const nextRot = Number(payload.rot);

    if (![nextX, nextY, nextZ, nextRot].every(Number.isFinite)) return;

    const updated = {
      id: socket.id,
      name: username,
      x: nextX,
      y: nextY,
      z: nextZ,
      rot: nextRot,
      updatedAt: Date.now()
    };

    players.set(socket.id, updated);
    touchAccount(username, { x: nextX, y: nextY, z: nextZ, rot: nextRot });
    socket.broadcast.emit('playerMove', updated);
  });

  socket.on('blockUpdate', (payload) => {
    const x = Math.floor(Number(payload?.x));
    const y = Math.floor(Number(payload?.y));
    const z = Math.floor(Number(payload?.z));
    const type = Number(payload?.type);
    if (![x, y, z, type].every(Number.isFinite)) return;

    const next = { x, y, z, type };
    worldBlocks.set(blockKey(x, y, z), next);
    schedulePersistWorldState();
    socket.broadcast.emit('blockUpdate', next);
  });

  socket.on('chat', (payload) => {
    const text = String(payload?.text || '').trim();
    if (!text) return;

    const message = {
      id: socket.id,
      name: username,
      text: text.slice(0, 180),
      at: Date.now()
    };

    chatHistory.push(message);
    if (chatHistory.length > CHAT_HISTORY_LIMIT) {
      chatHistory.splice(0, chatHistory.length - CHAT_HISTORY_LIMIT);
    }

    touchAccount(username);
    io.emit('chat', message);
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    touchAccount(username);
    io.emit('playerDisconnected', { id: socket.id });
    console.log('Player disconnected:', username, socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`MultiPixel socket server running on port ${PORT}`);
});
