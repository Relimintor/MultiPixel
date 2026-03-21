(function () {
  const STORAGE_KEY = 'singleplayer.waypoints.v1';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function loadWaypoints() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((entry, index) => ({
          id: String(entry?.id || `wp-${Date.now()}-${index}`),
          name: String(entry?.name || `Waypoint ${index + 1}`),
          x: Number.isFinite(Number(entry?.x)) ? Math.round(Number(entry.x)) : 0,
          y: Number.isFinite(Number(entry?.y)) ? Math.round(Number(entry.y)) : 0,
          z: Number.isFinite(Number(entry?.z)) ? Math.round(Number(entry.z)) : 0,
          visible: entry?.visible !== false,
        }))
        .filter((entry) => entry.name);
    } catch (error) {
      console.warn('[Waypoints] Failed to load stored waypoints.', error);
      return [];
    }
  }

  function saveWaypoints(waypoints) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(waypoints));
    } catch (error) {
      console.warn('[Waypoints] Failed to save waypoints.', error);
    }
  }

  function createWaypointId() {
    return `wp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  function create(deps = {}) {
    const {
      THREE,
      getCamera,
      getRenderer,
      getPlayerPosition,
      showGameMessage,
    } = deps;

    const state = {
      inventoryVisible: false,
      panelOpen: false,
      waypoints: loadWaypoints(),
      refs: {},
      labelsById: new Map(),
      domReady: false,
    };

    function ensureStyles() {
      if (document.getElementById('waypoint-mod-style')) return;
      const style = document.createElement('style');
      style.id = 'waypoint-mod-style';
      style.textContent = `
        #inventory-waypoints-btn {
          position: absolute;
          left: 108px;
          top: 12px;
          width: 46px;
          height: 46px;
          border: 2px solid rgba(76, 96, 148, 0.75);
          border-radius: 12px;
          background: linear-gradient(180deg, rgba(241, 246, 255, 0.96), rgba(199, 213, 247, 0.96));
          box-shadow: 0 6px 14px rgba(26, 37, 71, 0.22);
          font-size: 24px;
          cursor: pointer;
          z-index: 6;
          display: none;
          align-items: center;
          justify-content: center;
        }

        #inventory-waypoints-btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.04);
        }

        #waypoint-screen {
          position: absolute;
          inset: 34px 78px 34px 78px;
          display: none;
          align-items: center;
          justify-content: center;
          z-index: 40;
          pointer-events: auto;
        }

        #waypoint-screen.is-open {
          display: flex;
        }

        .waypoint-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(10, 14, 26, 0.38);
          border-radius: 20px;
          backdrop-filter: blur(2px);
        }

        .waypoint-panel {
          position: relative;
          width: min(100%, 430px);
          max-height: 100%;
          padding: 18px 18px 16px;
          border-radius: 16px;
          border: 2px solid rgba(116, 136, 196, 0.78);
          background: linear-gradient(180deg, rgba(238, 241, 251, 0.98), rgba(218, 226, 245, 0.98));
          box-shadow: 0 16px 38px rgba(13, 21, 45, 0.32);
          color: #304269;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .waypoint-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .waypoint-header-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 19px;
          font-weight: 700;
          color: #45609b;
        }

        #waypoint-close-btn {
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 10px;
          background: rgba(238, 104, 104, 0.18);
          color: #b33d3d;
          font-size: 21px;
          cursor: pointer;
        }

        .waypoint-create-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        #waypoint-search-input,
        #waypoint-name-input {
          width: 100%;
          border: 1px solid rgba(121, 138, 196, 0.65);
          border-radius: 10px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.86);
          color: #40537f;
          outline: none;
        }

        #waypoint-search-input:focus,
        #waypoint-name-input:focus {
          border-color: rgba(77, 120, 214, 0.95);
          box-shadow: 0 0 0 2px rgba(77, 120, 214, 0.16);
        }

        #waypoint-add-btn {
          flex: 0 0 auto;
          width: 42px;
          height: 42px;
          border: none;
          border-radius: 50%;
          background: linear-gradient(180deg, #7aa5ff, #5276d6);
          color: white;
          font-size: 25px;
          cursor: pointer;
          box-shadow: 0 6px 14px rgba(39, 66, 126, 0.24);
        }

        .waypoint-divider {
          height: 5px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(144, 170, 226, 0.16), rgba(109, 137, 216, 0.75), rgba(144, 170, 226, 0.16));
        }

        #waypoint-list {
          min-height: 120px;
          max-height: 292px;
          overflow-y: auto;
          padding-right: 4px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        #waypoint-list::-webkit-scrollbar {
          width: 8px;
        }

        #waypoint-list::-webkit-scrollbar-thumb {
          background: rgba(116, 136, 196, 0.8);
          border-radius: 999px;
        }

        .waypoint-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
          padding: 12px 14px;
          border-radius: 14px;
          background: linear-gradient(180deg, rgba(193, 211, 247, 0.95), rgba(171, 193, 239, 0.95));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
        }

        .waypoint-row-main {
          display: flex;
          gap: 10px;
          min-width: 0;
        }

        .waypoint-pin {
          font-size: 19px;
          line-height: 1;
          margin-top: 2px;
        }

        .waypoint-meta {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .waypoint-name {
          font-weight: 700;
          color: #2f436d;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .waypoint-coords,
        .waypoint-distance {
          font-size: 12px;
          color: #4c608f;
        }

        .waypoint-actions {
          display: flex;
          gap: 7px;
          align-items: center;
        }

        .waypoint-action-btn {
          width: 30px;
          height: 30px;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          font-size: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 3px 8px rgba(22, 29, 57, 0.16);
        }

        .waypoint-action-btn.toggle { background: #d7f1dd; }
        .waypoint-action-btn.refresh { background: #ffe8a9; }
        .waypoint-action-btn.delete { background: #ffd6d6; }

        .waypoint-empty {
          padding: 20px 12px;
          text-align: center;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.58);
          color: #5e7199;
          font-size: 14px;
        }

        #waypoint-label-layer {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 160;
        }

        .waypoint-world-label {
          position: absolute;
          left: 0;
          top: 0;
          transform-origin: bottom center;
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(10, 17, 32, 0.72);
          border: 1px solid rgba(150, 186, 255, 0.45);
          color: #f4f7ff;
          font: 600 13px/1.2 system-ui, sans-serif;
          white-space: nowrap;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
        }

        .waypoint-world-label .distance {
          color: #b9ceff;
          margin-left: 6px;
          font-size: 12px;
        }
      `;
      document.head.appendChild(style);
    }

    function ensureDom() {
      if (state.domReady) return true;
      const inventoryPanel = document.getElementById('inventory-panel');
      const inventoryScreen = document.getElementById('inventory-screen');
      if (!inventoryPanel || !inventoryScreen) return false;

      ensureStyles();

      const flagBtn = document.createElement('button');
      flagBtn.id = 'inventory-waypoints-btn';
      flagBtn.type = 'button';
      flagBtn.setAttribute('aria-label', 'Open waypoints');
      flagBtn.textContent = '🚩';

      const screen = document.createElement('div');
      screen.id = 'waypoint-screen';
      screen.innerHTML = `
        <div class="waypoint-backdrop"></div>
        <div class="waypoint-panel">
          <div class="waypoint-header">
            <div class="waypoint-header-title"><span>🚩</span><span>Waypoints</span></div>
            <button id="waypoint-close-btn" type="button" aria-label="Close waypoints">✕</button>
          </div>
          <input id="waypoint-search-input" type="search" placeholder="Search waypoints" autocomplete="off" />
          <div class="waypoint-create-row">
            <input id="waypoint-name-input" type="text" placeholder="Waypoint name" maxlength="32" autocomplete="off" />
            <button id="waypoint-add-btn" type="button" aria-label="Add waypoint">＋</button>
          </div>
          <div class="waypoint-divider"></div>
          <div id="waypoint-list"></div>
        </div>
      `;

      const labelLayer = document.createElement('div');
      labelLayer.id = 'waypoint-label-layer';

      inventoryPanel.appendChild(flagBtn);
      inventoryScreen.appendChild(screen);
      document.body.appendChild(labelLayer);

      state.refs = {
        flagBtn,
        screen,
        closeBtn: screen.querySelector('#waypoint-close-btn'),
        searchInput: screen.querySelector('#waypoint-search-input'),
        nameInput: screen.querySelector('#waypoint-name-input'),
        addBtn: screen.querySelector('#waypoint-add-btn'),
        list: screen.querySelector('#waypoint-list'),
        labelLayer,
      };

      flagBtn.addEventListener('click', () => {
        if (!state.inventoryVisible) return;
        state.panelOpen = !state.panelOpen;
        syncPanelVisibility();
        renderList();
      });

      state.refs.closeBtn?.addEventListener('click', () => {
        state.panelOpen = false;
        syncPanelVisibility();
      });

      screen.querySelector('.waypoint-backdrop')?.addEventListener('click', () => {
        state.panelOpen = false;
        syncPanelVisibility();
      });

      state.refs.searchInput?.addEventListener('input', () => renderList());
      state.refs.nameInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          addWaypointFromCurrentPosition();
        }
      });
      state.refs.addBtn?.addEventListener('click', addWaypointFromCurrentPosition);

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.panelOpen) {
          state.panelOpen = false;
          syncPanelVisibility();
        }
      });

      state.domReady = true;
      syncPanelVisibility();
      renderList();
      return true;
    }

    function syncPanelVisibility() {
      if (!state.domReady) return;
      state.refs.flagBtn.style.display = state.inventoryVisible ? 'flex' : 'none';
      state.refs.screen.classList.toggle('is-open', state.inventoryVisible && state.panelOpen);
      if (!state.inventoryVisible) state.panelOpen = false;
    }

    function setInventoryOpen(isOpen) {
      ensureDom();
      state.inventoryVisible = !!isOpen;
      if (!state.inventoryVisible) state.panelOpen = false;
      syncPanelVisibility();
    }

    function getCurrentPosition() {
      const pos = getPlayerPosition?.();
      if (!pos) return null;
      return {
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
        z: Math.floor(pos.z),
      };
    }

    function formatCoords(waypoint) {
      return `${waypoint.x}, ${waypoint.y}, ${waypoint.z}`;
    }

    function getDistanceToWaypoint(waypoint) {
      const pos = getPlayerPosition?.();
      if (!pos) return null;
      const dx = waypoint.x + 0.5 - pos.x;
      const dy = waypoint.y + 0.5 - pos.y;
      const dz = waypoint.z + 0.5 - pos.z;
      return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
    }

    function getFilteredWaypoints() {
      const term = String(state.refs.searchInput?.value || '').trim().toLowerCase();
      if (!term) return state.waypoints.slice();
      return state.waypoints.filter((waypoint) => {
        const haystack = `${waypoint.name} ${waypoint.x} ${waypoint.y} ${waypoint.z}`.toLowerCase();
        return haystack.includes(term);
      });
    }

    function showMessage(message) {
      if (typeof showGameMessage === 'function') showGameMessage(message);
    }

    function addWaypointFromCurrentPosition() {
      const current = getCurrentPosition();
      if (!current) return;
      const typedName = String(state.refs.nameInput?.value || '').trim();
      const name = typedName || `Waypoint ${state.waypoints.length + 1}`;
      state.waypoints.unshift({
        id: createWaypointId(),
        name,
        x: current.x,
        y: current.y,
        z: current.z,
        visible: true,
      });
      if (state.refs.nameInput) state.refs.nameInput.value = '';
      saveWaypoints(state.waypoints);
      renderList();
      showMessage(`Waypoint \"${name}\" added.`);
    }

    function deleteWaypoint(waypointId) {
      const before = state.waypoints.length;
      state.waypoints = state.waypoints.filter((waypoint) => waypoint.id !== waypointId);
      if (state.waypoints.length === before) return;
      saveWaypoints(state.waypoints);
      const labelEl = state.labelsById.get(waypointId);
      if (labelEl) labelEl.remove();
      state.labelsById.delete(waypointId);
      renderList();
      showMessage('Waypoint deleted.');
    }

    function toggleWaypointVisibility(waypointId) {
      const waypoint = state.waypoints.find((entry) => entry.id === waypointId);
      if (!waypoint) return;
      waypoint.visible = !waypoint.visible;
      saveWaypoints(state.waypoints);
      renderList();
      showMessage(waypoint.visible ? 'Waypoint shown.' : 'Waypoint hidden.');
    }

    function moveWaypointToCurrentPosition(waypointId) {
      const waypoint = state.waypoints.find((entry) => entry.id === waypointId);
      const current = getCurrentPosition();
      if (!waypoint || !current) return;
      waypoint.x = current.x;
      waypoint.y = current.y;
      waypoint.z = current.z;
      saveWaypoints(state.waypoints);
      renderList();
      showMessage(`Moved ${waypoint.name} to your current position.`);
    }

    function createActionButton(className, emoji, label, onClick) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `waypoint-action-btn ${className}`;
      btn.setAttribute('aria-label', label);
      btn.title = label;
      btn.textContent = emoji;
      btn.addEventListener('click', onClick);
      return btn;
    }

    function renderList() {
      if (!ensureDom()) return;
      const { list } = state.refs;
      if (!list) return;
      list.innerHTML = '';
      const filtered = getFilteredWaypoints();

      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'waypoint-empty';
        empty.textContent = state.waypoints.length
          ? 'No waypoints match your search.'
          : 'No waypoints yet. Add one with the + button.';
        list.appendChild(empty);
        return;
      }

      for (const waypoint of filtered) {
        const row = document.createElement('div');
        row.className = 'waypoint-row';

        const main = document.createElement('div');
        main.className = 'waypoint-row-main';

        const pin = document.createElement('div');
        pin.className = 'waypoint-pin';
        pin.textContent = waypoint.visible ? '📍' : '🚫';

        const meta = document.createElement('div');
        meta.className = 'waypoint-meta';

        const name = document.createElement('div');
        name.className = 'waypoint-name';
        name.textContent = waypoint.name;

        const coords = document.createElement('div');
        coords.className = 'waypoint-coords';
        coords.textContent = `XYZ: ${formatCoords(waypoint)}`;

        const distance = document.createElement('div');
        distance.className = 'waypoint-distance';
        const blocksAway = getDistanceToWaypoint(waypoint);
        distance.textContent = blocksAway === null ? 'Distance unavailable' : `${blocksAway} blocks away`;

        meta.appendChild(name);
        meta.appendChild(coords);
        meta.appendChild(distance);
        main.appendChild(pin);
        main.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'waypoint-actions';
        actions.appendChild(createActionButton('toggle', waypoint.visible ? '👁️' : '🙈', waypoint.visible ? 'Hide waypoint' : 'Show waypoint', () => toggleWaypointVisibility(waypoint.id)));
        actions.appendChild(createActionButton('refresh', '🔄', 'Move waypoint to current position', () => moveWaypointToCurrentPosition(waypoint.id)));
        actions.appendChild(createActionButton('delete', '🗑️', 'Delete waypoint', () => deleteWaypoint(waypoint.id)));

        row.appendChild(main);
        row.appendChild(actions);
        list.appendChild(row);
      }
    }

    function ensureLabelElement(waypointId) {
      let label = state.labelsById.get(waypointId);
      if (label) return label;
      label = document.createElement('div');
      label.className = 'waypoint-world-label';
      label.style.display = 'none';
      state.refs.labelLayer?.appendChild(label);
      state.labelsById.set(waypointId, label);
      return label;
    }

    function update(time, delta) {
      if (!ensureDom()) return;
      const camera = getCamera?.();
      const renderer = getRenderer?.();
      const playerPos = getPlayerPosition?.();
      if (!camera || !renderer || !playerPos || !THREE) return;

      const activeIds = new Set();
      for (const waypoint of state.waypoints) {
        const label = ensureLabelElement(waypoint.id);
        activeIds.add(waypoint.id);
        if (!waypoint.visible) {
          label.style.display = 'none';
          continue;
        }

        const worldPos = new THREE.Vector3(waypoint.x + 0.5, waypoint.y + 1.35, waypoint.z + 0.5);
        const projected = worldPos.clone().project(camera);
        const isOutsideView = projected.z < -1 || projected.z > 1;
        if (isOutsideView) {
          label.style.display = 'none';
          continue;
        }

        const screenX = (projected.x * 0.5 + 0.5) * window.innerWidth;
        const screenY = (-projected.y * 0.5 + 0.5) * window.innerHeight;
        const distance = Math.max(0, Math.round(playerPos.distanceTo(worldPos)));
        const scale = clamp(1.18 - distance / 180, 0.62, 1.18);
        const opacity = clamp(1.02 - distance / 360, 0.72, 1);

        label.innerHTML = `<span>${waypoint.name}</span><span class="distance">${distance} blocks</span>`;
        label.style.display = 'block';
        label.style.left = `${screenX}px`;
        label.style.top = `${screenY}px`;
        label.style.opacity = String(opacity);
        label.style.transform = `translate(-50%, -110%) scale(${scale})`;
      }

      for (const [waypointId, label] of state.labelsById.entries()) {
        if (activeIds.has(waypointId)) continue;
        label.remove();
        state.labelsById.delete(waypointId);
      }
    }

    return {
      initUi: ensureDom,
      renderWaypointUi(options = {}) {
        ensureDom();
        if (Object.prototype.hasOwnProperty.call(options, 'enabled')) {
          setInventoryOpen(Boolean(options.enabled));
        }
        renderList();
      },
      setInventoryOpen,
      update,
    };
  }

  window.SingleplayerWaypoints = { create };
})();
