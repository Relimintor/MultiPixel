(function () {
  function execute(parts, ctx) {
    const amount = Number.parseFloat(parts[2]);
    if (!Number.isFinite(amount)) {
      return { handled: true, ok: false, message: 'Usage: /set reach <amount>' };
    }

    if (!ctx.setReach || !ctx.setReach(amount)) {
      return { handled: true, ok: false, message: 'Could not set reach.' };
    }

    const applied = ctx.getReach ? ctx.getReach() : amount;
    return { handled: true, ok: true, message: `Reach set to ${applied} blocks.` };
  }

  window.SingleplayerChatCommandSetReach = { execute };
})();
