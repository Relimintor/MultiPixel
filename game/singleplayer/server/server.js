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
let worldDirty = false;
let worldRevision = 0;
let persistedRevision = 0;

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
      if (type === 0) continue;
      worldBlocks.set(blockKey(x, y, z), { x, y, z, type });
    }
    console.log(`Loaded ${worldBlocks.size} persisted block updates.`);
  } catch (err) {
    console.error('Failed loading world state:', err);
  }
}

function schedulePersistWorldState() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    const snapshotRevision = worldRevision;
    const payload = {
      updatedAt: Date.now(),
      blocks: Array.from(worldBlocks.values())
    };
    fs.writeFile(STATE_PATH, JSON.stringify(payload), (err) => {
      if (err) console.error('Failed persisting world state:', err);
      else {
        persistedRevision = Math.max(persistedRevision, snapshotRevision);
        worldDirty = persistedRevision < worldRevision;
      }
      persistTimer = null;
      if (worldDirty) schedulePersistWorldState();
    });
  }, 50);
}

function markWorldDirty() {
  worldRevision++;
  worldDirty = true;
}

loadWorldState();

setInterval(() => {
  if (!worldDirty) return;
  schedulePersistWorldState();
}, 15000);

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
    moving: false,
    mining: false,
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
    rot: 0,
    moving: false,
    mining: false,
  });

  socket.on('move', (payload) => {
    const existing = players.get(socket.id);
    if (!existing || !payload || typeof payload !== 'object') return;

    const nextX = Number(payload.x);
    const nextY = Number(payload.y);
    const nextZ = Number(payload.z);
    const nextRot = Number(payload.rot);
    const moving = Boolean(payload?.moving);
    const mining = Boolean(payload?.mining);

    if (![nextX, nextY, nextZ, nextRot].every(Number.isFinite)) return;

    const updated = {
      id: socket.id,
      x: nextX,
      y: nextY,
      z: nextZ,
      rot: nextRot,
      moving,
      mining,
      updatedAt: Date.now()
    };

    players.set(socket.id, updated);
    socket.broadcast.emit('playerMove', updated);
  });

  socket.on('blockUpdate', (payload) => {
    const actor = players.get(socket.id);
    if (!actor) return;
    const x = Math.floor(Number(payload?.x));
    const y = Math.floor(Number(payload?.y));
    const z = Math.floor(Number(payload?.z));
    const type = Number(payload?.type);
    if (![x, y, z, type].every(Number.isFinite)) return;
    const px = Number(actor.x);
    const py = Number(actor.y);
    const pz = Number(actor.z);
    if (![px, py, pz].every(Number.isFinite)) return;

    const dx = px - (x + 0.5);
    const dy = py - (y + 0.5);
    const dz = pz - (z + 0.5);
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance > 7.5) return;

    const next = { x, y, z, type };
    if (type === 0) {
      worldBlocks.delete(blockKey(x, y, z));
    } else {
      worldBlocks.set(blockKey(x, y, z), next);
    }
    markWorldDirty();
    socket.broadcast.emit('blockUpdate', next);
  });

  socket.on('requestWorldResync', () => {
    socket.emit('worldSnapshot', {
      players: Array.from(players.values()).filter((player) => player.id !== socket.id),
      blocks: Array.from(worldBlocks.values())
    });
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

  socket.on('pvpHit', (payload) => {
    const attacker = players.get(socket.id);
    if (!attacker) return;
    const targetId = String(payload?.targetId || '').trim();
    if (!targetId || targetId === socket.id) return;
    const target = players.get(targetId);
    if (!target) return;

    const damage = Math.max(0, Math.min(40, Number(payload?.damage) || 0));
    const knockbackStrength = Math.max(0.05, Math.min(1.2, Number(payload?.knockbackStrength) || 0.2));
    const range = Math.max(1.2, Math.min(6, Number(payload?.range) || 1.5));
    if (damage <= 0) return;

    const dx = Number(target.x) - Number(attacker.x);
    const dy = Number(target.y) - Number(attacker.y);
    const dz = Number(target.z) - Number(attacker.z);
    const dist = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(dist) || dist > range + 0.8) return;

    io.to(targetId).emit('pvpHit', {
      fromId: socket.id,
      damage,
      knockbackStrength,
      sourcePos: { x: attacker.x, y: attacker.y, z: attacker.z },
      crit: Boolean(payload?.crit),
      at: Date.now(),
    });
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
