const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const players = new Map();
const chatHistory = [];
const CHAT_HISTORY_LIMIT = 80;

app.get('/health', (_req, res) => {
  res.json({ ok: true, players: players.size, uptimeSec: Math.floor(process.uptime()) });
});

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  players.set(socket.id, {
    id: socket.id,
    x: 0,
    y: 0,
    z: 0,
    rot: 0,
    updatedAt: Date.now()
  });

  socket.emit('bootstrap', {
    selfId: socket.id,
    players: Array.from(players.values()).filter((player) => player.id !== socket.id),
    chat: chatHistory
  });

  socket.broadcast.emit('playerJoined', {
    id: socket.id,
    x: 0,
    y: 0,
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
