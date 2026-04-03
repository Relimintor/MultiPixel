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
    const amountRaw = Number.parseFloat(parts[3]);

    if (!Number.isFinite(targetId) || targetId <= 0 || !enchantment || !Number.isFinite(amountRaw)) {
      return { handled: true, ok: false, message: 'Usage: /enchant <holding|itemId> <knockback|effect:<name>> <amount>' };
    }

    const itemDef = ctx.getBlockById ? ctx.getBlockById(targetId) : null;
    if (!itemDef || itemDef.id === 0) {
      return { handled: true, ok: false, message: `Item id ${targetId} was not found.` };
    }

    if (enchantment === 'knockback') {
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

    if (enchantment.startsWith('effect:')) {
      const effectName = enchantment.slice('effect:'.length).trim().toLowerCase();
      const supported = Array.isArray(ctx.getSupportedEnchantEffects?.()) ? ctx.getSupportedEnchantEffects() : [];
      if (!effectName) {
        return { handled: true, ok: false, message: 'Usage: /enchant <holding|itemId> effect:<name> <durationSeconds>' };
      }
      if (supported.length && !supported.includes(effectName)) {
        return { handled: true, ok: false, message: `Unsupported effect. Allowed: ${supported.join(', ')}` };
      }
      if (!ctx.setItemEffectEnchant) {
        return { handled: true, ok: false, message: 'Item-effect enchant system is unavailable.' };
      }
      const ok = ctx.setItemEffectEnchant(targetId, effectName, amountRaw);
      if (!ok) {
        return { handled: true, ok: false, message: 'Failed to apply item effect enchant.' };
      }
      const seconds = Math.max(1, Math.min(120, Number(amountRaw) || 1));
      return { handled: true, ok: true, message: `Enchanted ${itemDef.name} (id ${targetId}) with effect ${effectName} for ${seconds}s on hit.` };
    }

    return { handled: true, ok: false, message: 'Supported enchants: knockback, effect:<name>' };
  }

  window.SingleplayerChatCommandEnchant = { execute };
})();
