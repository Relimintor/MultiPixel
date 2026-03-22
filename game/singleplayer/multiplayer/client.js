(function () {
  const SERVER_URL = 'https://multipixel-yzoq.onrender.com';
  const USERNAME_STORAGE_KEY = 'multipixel.1d4p.username';
  const EMIT_INTERVAL_MS = 50;

  let socket = null;
  let moveInterval = null;
  let isConnected = false;
  let flushTimer = null;
  const pendingBlockUpdates = [];
  let username = null;

  function getBridge() {
    return window.MultiPixelMultiplayerBridge || null;
  }

  function getSavedUsername() {
    return String(localStorage.getItem(USERNAME_STORAGE_KEY) || '').trim().toLowerCase();
  }

  function normalizeUsername(raw) {
    return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
  }

  function ensureUsername() {
    const existing = normalizeUsername(getSavedUsername());
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:#7a7a7a;z-index:999999;display:flex;align-items:center;justify-content:center;font-family:monospace;';
      overlay.innerHTML = `
        <form id="mp-username-form" style="width:min(92vw,430px);background:#d9d9d9;border:3px solid #333;padding:16px;color:#111;display:flex;flex-direction:column;gap:8px;">
          <h2 style="margin:0;">Choose username</h2>
          <input id="mp-username-input" placeholder="username" minlength="3" maxlength="24" required />
          <button type="submit">Join</button>
          <div id="mp-username-error" style="min-height:18px;color:#8b0000;font-size:12px;"></div>
        </form>
      `;
      document.body.appendChild(overlay);

      const form = overlay.querySelector('#mp-username-form');
      const input = overlay.querySelector('#mp-username-input');
      const errorEl = overlay.querySelector('#mp-username-error');

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = normalizeUsername(input.value);
        if (value.length < 3) {
          errorEl.textContent = 'Username must be at least 3 chars (a-z, 0-9, _).';
          return;
        }
        localStorage.setItem(USERNAME_STORAGE_KEY, value);
        overlay.remove();
        resolve(value);
      });
    });
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
      const selfState = payload?.selfState;
      if (selfState) getBridge()?.setLocalPlayerState?.(selfState);

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
          name: message?.id === socket.id ? 'You' : (message?.name || `Player ${String(message?.id || '').slice(0, 6)}`),
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
        name: message?.id === socket.id ? 'You' : (message?.name || `Player ${String(message?.id || '').slice(0, 6)}`),
      });
    });
  }

  async function init() {
    if (typeof window.io !== 'function') {
      console.warn('[Multiplayer] socket.io client missing.');
      return;
    }

    username = await ensureUsername();

    socket = window.io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      auth: {
        username,
      },
    });

    attachSocketEvents();
    if (!flushTimer) flushTimer = setInterval(() => flushPendingBlockUpdates(), 250);
  }

  window.MultiPixelMultiplayerClient = {
    init,
    sendChatMessage,
    sendBlockChange,
  };

  window.addEventListener('load', () => {
    window.MultiPixelMultiplayerClient?.init?.();
  });
})();
