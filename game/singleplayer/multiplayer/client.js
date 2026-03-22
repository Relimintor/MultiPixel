(function () {
  const SERVER_URL = 'https://multipixel-yzoq.onrender.com';
  const EMIT_INTERVAL_MS = 50;

  let socket = null;
  let moveInterval = null;
  let isConnected = false;
  let flushTimer = null;
  const pendingBlockUpdates = [];

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
    socket.emit('blockUpdate', { x, y, z, type });
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
    pendingBlockUpdates.push(payload);
    return false;
  }

  function flushPendingBlockUpdates(limit = 120) {
    const bridge = getBridge();
    if (!bridge?.applyNetworkBlockChange || !pendingBlockUpdates.length) return;

    let applied = 0;
    while (pendingBlockUpdates.length && applied < limit) {
      const payload = pendingBlockUpdates.shift();
      const ok = bridge.applyNetworkBlockChange(payload);
      if (!ok) {
        pendingBlockUpdates.push(payload);
        break;
      }
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
    });

    socket.on('disconnect', () => {
      isConnected = false;
      if (moveInterval) {
        clearInterval(moveInterval);
        moveInterval = null;
      }
    });

    socket.on('bootstrap', (payload) => {
      const players = Array.isArray(payload?.players) ? payload.players : [];
      players.forEach(updateOtherPlayer);

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

    socket = window.io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    attachSocketEvents();
    if (!flushTimer) flushTimer = setInterval(() => flushPendingBlockUpdates(), 250);
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
