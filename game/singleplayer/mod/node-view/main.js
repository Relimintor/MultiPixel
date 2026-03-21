(function () {
  function ensureStyles() {
    if (document.getElementById('singleplayer-node-view-style')) return;
    const style = document.createElement('style');
    style.id = 'singleplayer-node-view-style';
    style.textContent = `
      #node-view-panel {
        position: absolute;
        left: 50%;
        bottom: 86px;
        transform: translateX(-50%);
        min-width: 260px;
        max-width: min(420px, calc(100vw - 24px));
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(132, 160, 214, 0.35);
        background: linear-gradient(180deg, rgba(17, 21, 31, 0.94), rgba(12, 16, 24, 0.90));
        color: #f8fbff;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(4px);
        pointer-events: none;
        display: none;
        z-index: 35;
      }

      #node-view-panel.is-visible {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .node-view-icon {
        width: 44px;
        height: 44px;
        flex: 0 0 44px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: linear-gradient(180deg, rgba(87, 107, 144, 0.55), rgba(39, 48, 67, 0.95));
        background-position: center;
        background-repeat: no-repeat;
        background-size: cover;
        image-rendering: pixelated;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
      }

      .node-view-icon.is-entity {
        background-size: contain;
      }

      .node-view-content {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .node-view-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .node-view-title {
        font-size: 15px;
        font-weight: 700;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .node-view-kind {
        padding: 1px 7px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: rgba(71, 119, 223, 0.22);
        color: #9cc1ff;
      }

      .node-view-line,
      .node-view-mod {
        font-size: 12px;
        color: rgba(229, 239, 255, 0.84);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .node-view-line strong,
      .node-view-mod strong {
        color: #ffffff;
        font-weight: 600;
      }

      .node-view-health {
        color: #ff8d8d;
      }

      @media (max-width: 720px) {
        #node-view-panel {
          bottom: 104px;
          min-width: 220px;
          padding: 8px 10px;
        }

        .node-view-icon {
          width: 38px;
          height: 38px;
          flex-basis: 38px;
        }

        .node-view-title {
          font-size: 14px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function create(deps = {}) {
    const state = {
      root: null,
      icon: null,
      title: null,
      kind: null,
      primary: null,
      secondary: null,
      mod: null,
      lastKey: '',
      sampleMs: 0,
      domReady: false,
    };

    function ensureDom() {
      if (state.domReady && state.root?.isConnected) return state.root;
      ensureStyles();

      const host = document.getElementById('hud') || document.body;
      if (!host) return null;

      let root = document.getElementById('node-view-panel');
      if (!root) {
        root = document.createElement('div');
        root.id = 'node-view-panel';
        root.innerHTML = `
          <div class="node-view-icon" id="node-view-icon" aria-hidden="true"></div>
          <div class="node-view-content">
            <div class="node-view-title-row">
              <div class="node-view-title" id="node-view-title"></div>
              <div class="node-view-kind" id="node-view-kind"></div>
            </div>
            <div class="node-view-line" id="node-view-primary"></div>
            <div class="node-view-line" id="node-view-secondary"></div>
            <div class="node-view-mod" id="node-view-mod"></div>
          </div>
        `;
        host.appendChild(root);
      }

      state.root = root;
      state.icon = root.querySelector('#node-view-icon');
      state.title = root.querySelector('#node-view-title');
      state.kind = root.querySelector('#node-view-kind');
      state.primary = root.querySelector('#node-view-primary');
      state.secondary = root.querySelector('#node-view-secondary');
      state.mod = root.querySelector('#node-view-mod');
      state.domReady = true;
      return root;
    }

    function hide() {
      const root = ensureDom();
      if (!root) return;
      root.classList.remove('is-visible');
    }

    function renderTarget(target) {
      const root = ensureDom();
      if (!root || !target) {
        hide();
        return;
      }

      const viewKey = JSON.stringify({
        key: target.key || '',
        title: target.title || '',
        kind: target.kind || '',
        primary: target.primary || '',
        secondary: target.secondary || '',
        mod: target.mod || '',
        icon: target.icon || '',
      });
      if (state.lastKey === viewKey && root.classList.contains('is-visible')) return;
      state.lastKey = viewKey;

      state.title.textContent = target.title || 'Unknown';
      state.kind.textContent = target.kind || 'Target';
      state.primary.innerHTML = target.primary || '';
      state.secondary.innerHTML = target.secondary || '';
      state.secondary.style.display = target.secondary ? '' : 'none';
      state.mod.innerHTML = target.mod ? `<strong>Mod:</strong> ${target.mod}` : '';
      state.mod.style.display = target.mod ? '' : 'none';

      state.icon.style.backgroundImage = target.icon ? `url('${target.icon}')` : '';
      state.icon.classList.toggle('is-entity', target.kind === 'Entity');
      root.classList.add('is-visible');
    }

    function update(_time, deltaMs) {
      state.sampleMs += Number(deltaMs) || 0;
      if (state.sampleMs < 60) return;
      state.sampleMs = 0;

      if (deps.getIsSuppressed?.()) {
        hide();
        return;
      }

      const target = deps.getTargetInfo?.() || null;
      if (!target) {
        hide();
        return;
      }
      renderTarget(target);
    }

    return {
      initUi: ensureDom,
      hide,
      update,
    };
  }

  window.SingleplayerNodeView = {
    create,
  };
})();
