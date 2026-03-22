const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
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
const players = new Map();
const worldBlocks = new Map();
const chatHistory = [];
const CHAT_HISTORY_LIMIT = 80;
let persistTimer = null;

function blockKey(x, y, z) {
  return `${x},${y},${z}`;
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

function schedulePersistWorldState() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const payload = {
      updatedAt: Date.now(),
      blocks: Array.from(worldBlocks.values())
    };
    fs.writeFile(STATE_PATH, JSON.stringify(payload), (err) => {
      if (err) console.error('Failed persisting world state:', err);
    });
  }, 300);
}

loadWorldState();

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    players: players.size,
    persistedBlocks: worldBlocks.size,
    uptimeSec: Math.floor(process.uptime())
  });
});

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  players.set(socket.id, {
    id: socket.id,
    x: 0,
    y: 27,
    z: 0,
    rot: 0,
    updatedAt: Date.now()
  });

  socket.emit('bootstrap', {
    selfId: socket.id,
    players: Array.from(players.values()).filter((player) => player.id !== socket.id),
    chat: chatHistory,
    blocks: Array.from(worldBlocks.values())
  });

  socket.broadcast.emit('playerJoined', {
    id: socket.id,
    x: 0,
    y: 27,
    z: 0,
    rot: 0
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
      x: nextX,
      y: nextY,
      z: nextZ,
      rot: nextRot,
      updatedAt: Date.now()
    };

    players.set(socket.id, updated);
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
      text: text.slice(0, 180),
      at: Date.now()
    };

    chatHistory.push(message);
    if (chatHistory.length > CHAT_HISTORY_LIMIT) {
      chatHistory.splice(0, chatHistory.length - CHAT_HISTORY_LIMIT);
    }

    io.emit('chat', message);
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('playerDisconnected', { id: socket.id });
    console.log('Player disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`MultiPixel socket server running on port ${PORT}`);
});
