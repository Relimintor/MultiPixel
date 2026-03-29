(function () {
  function executeSet(parts, ctx) {
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

  function execute(rawInput, ctx) {
    if (!rawInput || rawInput[0] !== '/') return { handled: false };

    const parts = rawInput.trim().split(/\s+/);
    const command = (parts[0] || '').toLowerCase();
    const restrictedMode = Boolean(ctx?.isRestrictedCommandsMode);
    const bypassCommands = new Set(['/set', '/grantme', '/ungrantme', '/help']);
    if (restrictedMode && !bypassCommands.has(command)) {
      const hasPrivs = Boolean(ctx?.hasCommandPrivileges?.());
      if (!hasPrivs) {
        return { handled: true, ok: false, message: 'Command locked in 1d4p. Use /grantme all first.' };
      }
    }

    if (command === '/give' && window.SingleplayerChatCommandGive?.execute) {
      return window.SingleplayerChatCommandGive.execute(parts, ctx);
    }

    if (command === '/spawn' && window.SingleplayerChatCommandSpawn?.execute) {
      return window.SingleplayerChatCommandSpawn.execute(parts, ctx);
    }

    if (command === '/tp' && window.SingleplayerChatCommandTp?.execute) {
      return window.SingleplayerChatCommandTp.execute(parts, ctx);
    }

    if (command === '/time' && window.SingleplayerChatCommandTime?.execute) {
      return window.SingleplayerChatCommandTime.execute(parts, ctx);
    }

    if (command === '/help' && window.SingleplayerChatCommandHelp?.execute) {
      return window.SingleplayerChatCommandHelp.execute(parts, ctx);
    }

    if (command === '/height' && window.SingleplayerChatCommandHeight?.execute) {
      return window.SingleplayerChatCommandHeight.execute(parts, ctx);
    }

    if (command === '/gamemode' && window.SingleplayerChatCommandGamemode?.execute) {
      return window.SingleplayerChatCommandGamemode.execute(parts, ctx);
    }

    if (command === '/grantme' && window.SingleplayerChatCommandGrantMe?.execute) {
      return window.SingleplayerChatCommandGrantMe.execute(parts, ctx);
    }

    if (command === '/ungrantme' && window.SingleplayerChatCommandUnGrantMe?.execute) {
      return window.SingleplayerChatCommandUnGrantMe.execute(parts, ctx);
    }


    if (command === '/enchant' && window.SingleplayerChatCommandEnchant?.execute) {
      return window.SingleplayerChatCommandEnchant.execute(parts, ctx);
    }

    if (command === '/effect' && window.SingleplayerChatCommandEffect?.execute) {
      return window.SingleplayerChatCommandEffect.execute(parts, ctx);
    }

    if (command === '/set') {
      if (window.SingleplayerChatCommandSet?.execute) {
        return window.SingleplayerChatCommandSet.execute(parts, ctx);
      }
      return executeSet(parts, ctx || {});
    }

    if (command === '/save') {
      if (!ctx?.saveWorldFile) {
        return { handled: true, ok: false, message: 'Save system unavailable.' };
      }
      const result = ctx.saveWorldFile();
      if (!result?.ok) return { handled: true, ok: false, message: result?.message || 'Could not save world.' };
      return { handled: true, ok: true, message: result.message || 'World saved.' };
    }

    return { handled: true, ok: false, message: `Unknown command: ${command}` };
  }

  window.SingleplayerChatCommands = { execute };
})();
