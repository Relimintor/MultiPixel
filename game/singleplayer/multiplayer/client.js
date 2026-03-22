(function () {
  const SERVER_URL = 'https://multipixel-yzoq.onrender.com';
  const EMIT_INTERVAL_MS = 100;

  let socket = null;
  let moveInterval = null;
  let isConnected = false;

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
    });
  }

  function sendChatMessage(text) {
    if (!socket || !isConnected) return false;
    const clean = String(text || '').trim();
    if (!clean) return false;

    socket.emit('chat', { text: clean });
    return true;
  }

  function attachSocketEvents() {
    socket.on('connect', () => {
      isConnected = true;
      console.log('Connected to server:', socket.id);
      if (moveInterval) clearInterval(moveInterval);
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

    socket.on('chat', (message) => {
      getBridge()?.pushNetworkChatMessage?.({
        text: message?.text,
        fromSelf: message?.id === socket.id,
        name: message?.id === socket.id ? 'You' : `Player ${String(message?.id || '').slice(0, 6)}`,
      });
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
  }

  window.MultiPixelMultiplayerClient = {
    init,
    sendChatMessage,
  };

  window.addEventListener('load', () => {
    window.MultiPixelMultiplayerClient?.init?.();
  });
})();
