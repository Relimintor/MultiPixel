(function () {
  function execute(parts, ctx) {
    const sub = String(parts[1] || '').toLowerCase();

    if (sub === 'sensitivity') {
      if (window.SingleplayerChatCommandSetSensitivity?.execute) {
        return window.SingleplayerChatCommandSetSensitivity.execute(parts, ctx);
      }
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

    if (sub === 'reach') {
      if (window.SingleplayerChatCommandSetReach?.execute) {
        return window.SingleplayerChatCommandSetReach.execute(parts, ctx);
      }
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

    if (sub === 'render_distance') {
      const amount = Number.parseInt(parts[2], 10);
      if (!Number.isFinite(amount)) {
        return { handled: true, ok: false, message: 'Usage: /set render_distance <amount>' };
      }
      if (!ctx.setRenderDistance || !ctx.setRenderDistance(amount)) {
        return { handled: true, ok: false, message: 'Could not set render distance.' };
      }
      const applied = ctx.getRenderDistance ? ctx.getRenderDistance() : amount;
      return { handled: true, ok: true, message: `Render distance set to ${applied}.` };
    }

    if (sub === 'fov') {
      const amount = Number.parseFloat(parts[2]);
      if (!Number.isFinite(amount)) {
        return { handled: true, ok: false, message: 'Usage: /set fov <amount>' };
      }
      if (!ctx.setFov || !ctx.setFov(amount)) {
        return { handled: true, ok: false, message: 'Could not set FOV.' };
      }
      const applied = ctx.getFov ? Math.round(ctx.getFov()) : Math.round(amount);
      return { handled: true, ok: true, message: `FOV set to ${applied}.` };
    }

    return { handled: true, ok: false, message: 'Usage: /set <render_distance|fov|sensitivity|reach> <amount>' };
  }

  window.SingleplayerChatCommandSet = { execute };
})();
