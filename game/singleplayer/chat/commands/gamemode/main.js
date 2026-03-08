(function () {
  function execute(parts, ctx) {
    const mode = String(parts[1] || '').toLowerCase();

    if (!mode) {
      return { handled: true, ok: false, message: 'Usage: /gamemode <creative|survival>' };
    }

    if (mode === 'creative' || mode === '1' || mode === 'c') {
      if (!ctx.setGameMode || !ctx.setGameMode('creative')) {
        return { handled: true, ok: false, message: 'Could not switch to creative mode.' };
      }
      if (ctx.openCreativeMenu) ctx.openCreativeMenu();
      return { handled: true, ok: true, message: 'Gamemode set to Creative.' };
    }

    if (mode === 'survival' || mode === '0' || mode === 's') {
      if (!ctx.setGameMode || !ctx.setGameMode('survival')) {
        return { handled: true, ok: false, message: 'Could not switch to survival mode.' };
      }
      if (ctx.closeCreativeMenu) ctx.closeCreativeMenu();
      return { handled: true, ok: true, message: 'Gamemode set to Survival.' };
    }

    return { handled: true, ok: false, message: 'Usage: /gamemode <creative|survival>' };
  }

  window.SingleplayerChatCommandGamemode = { execute };
})();
