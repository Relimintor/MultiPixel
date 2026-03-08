(function () {
  const STORAGE_KEY = 'singleplayer.enabledModId';
  const MOD_IDS = [];
  const mods = [];

  const registry = {
    register(mod) {
      if (!mod || !mod.id) return;
      const idx = mods.findIndex((m) => m.id === mod.id);
      if (idx >= 0) mods[idx] = mod;
      else mods.push(mod);
    }
  };
  window.SingleplayerModRegistry = registry;

  MOD_IDS.forEach((id) => {
    const script = document.createElement('script');
    script.src = `./mod/${id}/main.js`;
    script.async = false;
    document.head.appendChild(script);
  });

  window.SingleplayerEditMods = {
    list() {
      return mods.slice();
    },
    selected() {
      return localStorage.getItem(STORAGE_KEY) || '';
    },
    select(id) {
      if (!id) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, id);
    }
  };
})();
