(function () {
  function normalizeAmount(rawAmount) {
    const parsed = Number.parseInt(rawAmount, 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.min(64, parsed));
  }

  function resolveMobId(rawToken, ctx) {
    if (!rawToken) return null;
    if (/^\d+$/.test(String(rawToken).trim())) {
      const numeric = Number.parseInt(rawToken, 10);
      if (Number.isFinite(numeric)) return numeric;
    }

    const token = String(rawToken).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ctx.getMobById) {
      for (let i = 1; i <= 256; i++) {
        const def = ctx.getMobById(i);
        if (!def) continue;
        const normalizedName = String(def.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedKey = String(def.key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedName === token || normalizedKey === token) return i;
      }
    }

    return null;
  }

  function execute(parts, ctx) {
    const mobId = resolveMobId(parts[1], ctx);
    const amount = normalizeAmount(parts[2]);

    if (!Number.isFinite(mobId)) {
      return { handled: true, ok: false, message: 'Usage: /spawn <mobId|mobName> <amount>' };
    }

    const mobDef = ctx.getMobById ? ctx.getMobById(mobId) : null;
    if (!mobDef) {
      return { handled: true, ok: false, message: `Mob id ${mobId} was not found.` };
    }

    const spawned = ctx.spawnMobById ? ctx.spawnMobById(mobId, amount) : 0;
    if (!spawned) {
      return { handled: true, ok: false, message: `Could not spawn ${mobDef.name}.` };
    }

    return { handled: true, ok: true, message: `Spawned ${spawned}x ${mobDef.name}.` };
  }

  window.SingleplayerChatCommandSpawn = { execute };
})();
