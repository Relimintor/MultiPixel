(function () {
  function execute(parts, ctx) {
    const amount = Number.parseFloat(parts[1]);

    if (!Number.isFinite(amount)) {
      return { handled: true, ok: false, message: 'Usage: /height <amount>' };
    }

    if (amount <= 0) {
      return { handled: true, ok: false, message: 'Height must be greater than 0.' };
    }

    if (!ctx.setPlayerHeight || !ctx.setPlayerHeight(amount)) {
      return { handled: true, ok: false, message: 'Could not change player height.' };
    }

    const applied = ctx.getPlayerHeight ? ctx.getPlayerHeight() : amount;
    return { handled: true, ok: true, message: `Player height set to ${applied} blocks.` };
  }

  window.SingleplayerChatCommandHeight = { execute };
})();
