(function () {
  const REPO_PREFIX = window.SingleplayerConfig?.REPO_BASE_PREFIX || '/MultiPixel';

  function goBackToGame() {
    window.location.href = `${REPO_PREFIX}/game/singleplayer/singleplayer.html`;
  }

  function setupTabs() {
    const tabs = Array.from(document.querySelectorAll('.edit-tab'));
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach((t) => t.classList.toggle('active', t === tab));
        document.getElementById('edit-panel-texturepacks')?.classList.toggle('hidden', target !== 'texturepacks');
        document.getElementById('edit-panel-mods')?.classList.toggle('hidden', target !== 'mods');
      });
    });
  }

  function renderSection(containerId, items, emptyText, applyFn, currentId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items.length) {
      container.innerHTML = `<p class="edit-note">${emptyText}</p>`;
      return;
    }

    container.innerHTML = '<div class="edit-grid"></div>';
    const grid = container.querySelector('.edit-grid');

    items.forEach((item) => {
      const selected = item.id === currentId;
      const card = document.createElement('article');
      card.className = 'edit-card';
      card.innerHTML = `
        <h3>${item.name || item.id}</h3>
        <p>${item.description || ''}</p>
        <button class="edit-action" type="button">${selected ? 'Selected' : 'Use'}</button>
      `;
      const btn = card.querySelector('button');
      btn.disabled = selected;
      btn.addEventListener('click', () => {
        applyFn(item.id);
        goBackToGame();
      });
      grid.appendChild(card);
    });
  }

  function init() {
    document.getElementById('edit-back-btn')?.addEventListener('click', goBackToGame);
    setupTabs();

    const texturePackApi = window.SingleplayerEditTexturePacks;
    const modApi = window.SingleplayerEditMods;

    renderSection(
      'edit-panel-texturepacks',
      texturePackApi?.list?.() || [],
      'No texture packs registered.',
      (id) => texturePackApi?.select?.(id),
      texturePackApi?.selected?.()
    );

    renderSection(
      'edit-panel-mods',
      modApi?.list?.() || [],
      'No mods registered yet.',
      (id) => modApi?.select?.(id),
      modApi?.selected?.()
    );
  }

  init();
})();
