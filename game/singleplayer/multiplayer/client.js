(function () {
  const SERVER_URL = 'https://multipixel-yzoq.onrender.com';
  const EMIT_INTERVAL_MS = 50;
  const WORLD_RESYNC_INTERVAL_MS = 12000;
  const MAX_PENDING_BLOCK_UPDATES = 4096;
  const MAX_PENDING_BLOCK_AGE_MS = 30000;

  let socket = null;
  let moveInterval = null;
  let isConnected = false;
  let flushTimer = null;
  let worldResyncTimer = null;
  const pendingBlockUpdates = new Map();

  function getBlockKey(payload) {
    const x = Math.floor(Number(payload?.x));
    const y = Math.floor(Number(payload?.y));
    const z = Math.floor(Number(payload?.z));
    if (![x, y, z].every(Number.isFinite)) return null;
    return `${x},${y},${z}`;
  }

  function enqueuePendingBlockUpdate(payload) {
    const key = getBlockKey(payload);
    if (!key) return;
    if (pendingBlockUpdates.has(key)) pendingBlockUpdates.delete(key);
    pendingBlockUpdates.set(key, { payload, queuedAt: Date.now() });
    while (pendingBlockUpdates.size > MAX_PENDING_BLOCK_UPDATES) {
      const oldestKey = pendingBlockUpdates.keys().next().value;
      if (!oldestKey) break;
      pendingBlockUpdates.delete(oldestKey);
    }
  }

  function dropExpiredPendingBlockUpdates(now = Date.now()) {
    if (!pendingBlockUpdates.size) return;
    for (const [key, entry] of pendingBlockUpdates) {
      if ((now - Number(entry?.queuedAt || 0)) <= MAX_PENDING_BLOCK_AGE_MS) continue;
      pendingBlockUpdates.delete(key);
    }
  }

  function reconcileRemotePlayers(players) {
    const bridge = getBridge();
    const listedIds = new Set();
    players.forEach((entry) => {
      const id = String(entry?.id || '').trim();
      if (!id || id === socket?.id) return;
      listedIds.add(id);
      updateOtherPlayer(entry);
    });

    const knownIds = bridge?.getRemotePlayerIds?.();
    if (!Array.isArray(knownIds)) return;
    knownIds.forEach((id) => {
      const key = String(id || '').trim();
      if (!key || listedIds.has(key)) return;
      bridge?.removeOtherPlayer?.(key);
    });
  }

  function enqueuePendingBlockUpdate(payload) {
    pendingBlockUpdates.push(payload);
    if (pendingBlockUpdates.length <= MAX_PENDING_BLOCK_UPDATES) return;
    const overflow = pendingBlockUpdates.length - MAX_PENDING_BLOCK_UPDATES;
    pendingBlockUpdates.splice(0, overflow);
  }

  function reconcileRemotePlayers(players) {
    const bridge = getBridge();
    const listedIds = new Set();
    players.forEach((entry) => {
      const id = String(entry?.id || '').trim();
      if (!id || id === socket?.id) return;
      listedIds.add(id);
      updateOtherPlayer(entry);
    });

    const knownIds = bridge?.getRemotePlayerIds?.() || [];
    knownIds.forEach((id) => {
      const key = String(id || '').trim();
      if (!key || listedIds.has(key)) return;
      bridge?.removeOtherPlayer?.(key);
    });
  }

  function getBridge() {
    return window.MultiPixelMultiplayerBridge || null;
  }

  function updateOtherPlayer(playerData) {
    const bridge = getBridge();
    bridge?.updateOtherPlayer?.(playerData);
  }

  function sendMove() {
    if (!socket || !isConnected) return;
    const bridge = getBridge();
    const localState = bridge?.getLocalPlayerState?.();
    if (!localState) return;

    socket.emit('move', {
      x: localState.x,
      y: localState.y,
      z: localState.z,
      rot: localState.rot,
      moving: !!localState.moving,
      mining: !!localState.mining,
    });
  }

  function sendChatMessage(text) {
    if (!socket || !isConnected) return false;
    const clean = String(text || '').trim();
    if (!clean) return false;

    socket.emit('chat', { text: clean });
    return true;
  }

  function sendBlockChange(payload) {
    if (!socket || !isConnected) return false;
    const x = Number(payload?.x);
    const y = Number(payload?.y);
    const z = Number(payload?.z);
    const type = Number(payload?.type);
    if (![x, y, z, type].every(Number.isFinite)) return false;
    const localState = getBridge()?.getLocalPlayerState?.() || null;
    socket.emit('blockUpdate', {
      x, y, z, type,
      sourcePos: localState ? {
        x: Number(localState.x) || 0,
        y: Number(localState.y) || 0,
        z: Number(localState.z) || 0,
      } : null,
      clientSentAt: Date.now(),
    });
    return true;
  }

  function sendPlayerHit(payload) {
    if (!socket || !isConnected) return false;
    const targetId = String(payload?.targetId || '').trim();
    const damage = Number(payload?.damage);
    const knockbackStrength = Number(payload?.knockbackStrength);
    const range = Number(payload?.range);
    const crit = Boolean(payload?.crit);
    if (!targetId || ![damage, knockbackStrength, range].every(Number.isFinite)) return false;
    socket.emit('pvpHit', { targetId, damage, knockbackStrength, range, crit });
    return true;
  }


  function applyIncomingBlockUpdate(payload) {
    const bridge = getBridge();
    if (bridge?.applyNetworkBlockChange) {
      const ok = bridge.applyNetworkBlockChange(payload);
      if (ok) return true;
    }
    enqueuePendingBlockUpdate(payload);
    return false;
  }

  function flushPendingBlockUpdates(limit = 120) {
    const bridge = getBridge();
    if (!bridge?.applyNetworkBlockChange || !pendingBlockUpdates.size) return;
    dropExpiredPendingBlockUpdates();
    if (!pendingBlockUpdates.size) return;

    let applied = 0;
    for (const [key, entry] of pendingBlockUpdates) {
      if (applied >= limit) break;
      const ok = bridge.applyNetworkBlockChange(entry.payload);
      if (!ok) {
        continue;
      }
      pendingBlockUpdates.delete(key);
      applied++;
    }
  }

  function attachSocketEvents() {
    socket.on('connect', () => {
      isConnected = true;
      console.log('Connected to server:', socket.id);
      if (moveInterval) clearInterval(moveInterval);
      sendMove();
      moveInterval = setInterval(sendMove, EMIT_INTERVAL_MS);
      socket.emit('requestWorldResync');
    });

    socket.on('disconnect', () => {
      isConnected = false;
      if (moveInterval) {
        clearInterval(moveInterval);
        moveInterval = null;
      }
      getBridge()?.clearOtherPlayers?.();
    });

    socket.on('bootstrap', (payload) => {
      const players = Array.isArray(payload?.players) ? payload.players : [];
      if (!getBridge()?.getRemotePlayerIds?.()) getBridge()?.clearOtherPlayers?.();
      reconcileRemotePlayers(players);

      const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
      blocks.forEach((entry) => {
        applyIncomingBlockUpdate(entry);
      });
      flushPendingBlockUpdates();

      const chat = Array.isArray(payload?.chat) ? payload.chat : [];
      chat.forEach((message) => {
        getBridge()?.pushNetworkChatMessage?.({
          text: message?.text,
          fromSelf: message?.id === socket.id,
          name: message?.id === socket.id ? 'You' : `Player ${String(message?.id || '').slice(0, 6)}`,
        });
      });
    });

    socket.on('worldSnapshot', (payload) => {
      const players = Array.isArray(payload?.players) ? payload.players : [];
      if (!getBridge()?.getRemotePlayerIds?.()) getBridge()?.clearOtherPlayers?.();
      reconcileRemotePlayers(players);
      const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
      blocks.forEach((entry) => {
        applyIncomingBlockUpdate(entry);
      });
      flushPendingBlockUpdates(500);
    });

    socket.on('playerJoined', (playerData) => {
      updateOtherPlayer(playerData);
      console.log('Player connected:', playerData?.id || '(unknown)');
    });

    socket.on('playerMove', (playerData) => {
      updateOtherPlayer(playerData);
    });

    socket.on('playerDisconnected', ({ id }) => {
      getBridge()?.removeOtherPlayer?.(id);
    });

    socket.on('blockUpdate', (payload) => {
      applyIncomingBlockUpdate(payload);
      flushPendingBlockUpdates();
    });

    socket.on('chat', (message) => {
      getBridge()?.pushNetworkChatMessage?.({
        text: message?.text,
        fromSelf: message?.id === socket.id,
        name: message?.id === socket.id ? 'You' : `Player ${String(message?.id || '').slice(0, 6)}`,
      });
    });

    socket.on('pvpHit', (payload) => {
      getBridge()?.applyNetworkPvpHit?.(payload);
    });
  }

  function init() {
    if (typeof window.io !== 'function') {
      console.warn('[Multiplayer] socket.io client missing.');
      return;
    }
    if (socket) return;

    socket = window.io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    attachSocketEvents();
    if (!flushTimer) flushTimer = setInterval(() => flushPendingBlockUpdates(), 250);
    if (!worldResyncTimer) {
      worldResyncTimer = setInterval(() => {
        if (!socket || !isConnected) return;
        socket.emit('requestWorldResync');
      }, WORLD_RESYNC_INTERVAL_MS);
    }
  }

  window.MultiPixelMultiplayerClient = {
    init,
    sendChatMessage,
    sendBlockChange,
    sendPlayerHit,
  };

  window.addEventListener('load', () => {
    window.MultiPixelMultiplayerClient?.init?.();
  });
})();
