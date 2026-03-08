(function () {
  function normalizeAmount(rawAmount) {
    const parsed = Number.parseInt(rawAmount, 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.min(64, parsed));
  }

  function resolveItemId(rawToken, ctx) {
    if (!rawToken) return null;
    if (/^\d+$/.test(String(rawToken).trim())) {
      const numeric = Number.parseInt(rawToken, 10);
      if (Number.isFinite(numeric)) return numeric;
    }

    const token = String(rawToken).toLowerCase().replace(/[^a-z0-9]/g, '');
    const aliases = { chest: 82 };
    if (Object.prototype.hasOwnProperty.call(aliases, token)) return aliases[token];

    if (ctx.getBlockById) {
      for (let i = 1; i <= 256; i++) {
        const def = ctx.getBlockById(i);
        if (!def || !def.name) continue;
        const normalizedName = String(def.name).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedName === token) return i;
      }
    }

    return null;
  }

  function execute(parts, ctx) {
    const id = resolveItemId(parts[1], ctx);
    const amount = normalizeAmount(parts[2]);

    if (!Number.isFinite(id)) {
      return { handled: true, ok: false, message: 'Usage: /give <itemId|itemName> <amount>' };
    }

    const itemDef = ctx.getBlockById ? ctx.getBlockById(id) : null;
    if (!itemDef || itemDef.id === 0) {
      return { handled: true, ok: false, message: `Item id ${id} was not found.` };
    }

    const added = ctx.addToInventory ? ctx.addToInventory(id, amount) : false;
    if (!added) {
      return { handled: true, ok: false, message: 'Could not add item (inventory full).' };
    }

    return { handled: true, ok: true, message: `Given ${amount}x ${itemDef.name} (id ${id}).` };
  }

  window.SingleplayerChatCommandGive = { execute };
})();
