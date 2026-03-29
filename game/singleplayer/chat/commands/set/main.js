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

    if (sub === 'enable_rtx_mode') {
      const raw = String(parts[2] || '').toLowerCase().trim();
      const enable = raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
      const disable = raw === 'false' || raw === '0' || raw === 'off' || raw === 'no';
      if (!enable && !disable) {
        return { handled: true, ok: false, message: 'Usage: /set enable_rtx_mode <true|false>' };
      }
      if (!ctx.setRtxMode) {
        return { handled: true, ok: false, message: 'RTX mode system unavailable.' };
      }
      if (enable) {
        const proceed = window.confirm('Warning: low tier devices cant handle this.\n\nOK = kk continue\nCancel = Oh shit Bye');
        if (!proceed) {
          return { handled: true, ok: false, message: 'Oh shit Bye' };
        }
      }
      if (!ctx.setRtxMode(enable)) {
        return { handled: true, ok: false, message: 'Could not change RTX mode.' };
      }
      return { handled: true, ok: true, message: enable ? 'RTX mode enabled (kk continue).' : 'RTX mode disabled.' };
    }

    return { handled: true, ok: false, message: 'Usage: /set <render_distance|fov|sensitivity|reach|enable_rtx_mode> <amount|true|false>' };
  }

  window.SingleplayerChatCommandSet = { execute };
})();
