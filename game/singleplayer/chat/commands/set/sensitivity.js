(function () {
  function execute(parts, ctx) {
    const amount = Number.parseFloat(parts[2]);
    if (!Number.isFinite(amount)) {
      return { handled: true, ok: false, message: 'Usage: /set sensitivity <amount>' };
    }

    if (!ctx.setSensitivity || !ctx.setSensitivity(amount)) {
      return { handled: true, ok: false, message: 'Could not set sensitivity.' };
    }

    const applied = ctx.getSensitivity ? ctx.getSensitivity() : amount;
    return { handled: true, ok: true, message: `Sensitivity set to ${applied}.` };
  }

  window.SingleplayerChatCommandSetSensitivity = { execute };
})();
