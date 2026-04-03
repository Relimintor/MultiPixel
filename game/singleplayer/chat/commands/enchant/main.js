(function () {
  const MAX_KNOCKBACK_LEVEL = 400;

  function resolveTargetItemId(rawToken, ctx) {
    const token = String(rawToken || '').trim().toLowerCase();
    if (!token) return null;

    if (token === 'holding') {
      return ctx.getSelectedItemId ? ctx.getSelectedItemId() : null;
    }

    if (/^\d+$/.test(token)) {
      const id = Number.parseInt(token, 10);
      return Number.isFinite(id) ? id : null;
    }

    return null;
  }

  function execute(parts, ctx) {
    const targetId = resolveTargetItemId(parts[1], ctx || {});
    const enchantment = String(parts[2] || '').trim().toLowerCase();
    const amountRaw = Number.parseInt(parts[3], 10);

    if (!Number.isFinite(targetId) || targetId <= 0 || !enchantment || !Number.isFinite(amountRaw)) {
      return { handled: true, ok: false, message: 'Usage: /enchant <holding|itemId> <knockback> <amount:1-400>' };
    }

    if (enchantment !== 'knockback') {
      return { handled: true, ok: false, message: 'Only knockback is supported right now.' };
    }

    const itemDef = ctx.getBlockById ? ctx.getBlockById(targetId) : null;
    if (!itemDef || itemDef.id === 0) {
      return { handled: true, ok: false, message: `Item id ${targetId} was not found.` };
    }

    const amount = Math.max(1, Math.min(MAX_KNOCKBACK_LEVEL, amountRaw));
    if (!ctx.setItemKnockbackEnchant) {
      return { handled: true, ok: false, message: 'Enchant system is unavailable.' };
    }

    const ok = ctx.setItemKnockbackEnchant(targetId, amount);
    if (!ok) {
      return { handled: true, ok: false, message: 'Failed to apply enchantment.' };
    }

    return { handled: true, ok: true, message: `Enchanted ${itemDef.name} (id ${targetId}) with knockback ${amount}.` };
  }

  window.SingleplayerChatCommandEnchant = { execute };
})();
