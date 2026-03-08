(function () {
  const STORAGE_KEY = 'singleplayer.texturePackId';
  const PACK_IDS = ['forager'];
  const packs = [];

  const registry = {
    register(pack) {
      if (!pack || !pack.id) return;
      const idx = packs.findIndex((p) => p.id === pack.id);
      if (idx >= 0) packs[idx] = pack;
      else packs.push(pack);
    }
  };
  window.SingleplayerTexturePackRegistry = registry;

  PACK_IDS.forEach((id) => {
    const script = document.createElement('script');
    script.src = `./texturepack/${id}/main.js`;
    script.async = false;
    document.head.appendChild(script);
  });

  window.SingleplayerEditTexturePacks = {
    list() {
      return [
        {
          id: 'default',
          name: 'Default',
          description: 'Use built-in MultiPixel textures.'
        },
        ...packs
      ];
    },
    selected() {
      return localStorage.getItem(STORAGE_KEY) || 'default';
    },
    select(id) {
      if (!id || id === 'default') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, id);
    }
  };
})();
