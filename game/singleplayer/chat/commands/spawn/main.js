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

  function parseMobSpawnArgs(parts) {
    let amountToken = null;
    let heightValue = null;
    let sawHeight = false;

    for (let i = 2; i < (parts || []).length; i++) {
      const token = String(parts[i] || '').trim();
      if (!token) continue;

      if (/^height\s*:/i.test(token)) {
        sawHeight = true;
        const inlineValue = token.replace(/^height\s*:/i, '').trim();
        if (inlineValue) {
          heightValue = Number.parseFloat(inlineValue);
          continue;
        }

        const nextToken = String(parts[i + 1] || '').trim();
        heightValue = Number.parseFloat(nextToken);
        i++;
        continue;
      }

      if (amountToken === null && /^\d+$/.test(token)) {
        amountToken = token;
      }
    }

    if (sawHeight && (!Number.isFinite(heightValue) || heightValue <= 0)) {
      return { ok: false, message: 'Usage: /spawn <mobId|mobName> [amount] [height:<blocks>]' };
    }

    return {
      ok: true,
      amount: normalizeAmount(amountToken),
      height: sawHeight ? heightValue : null,
    };
  }

  function parseStructureArgs(parts) {
    const raw = String((parts || []).slice(1).join(' ') || '');
    const structureMatch = raw.match(/structure\s*:\s*([^\s][^]*?)(?=\s+biome\s*:|\s+building\s*:|$)/i);
    const biomeMatch = raw.match(/biome\s*:\s*([^\s][^]*?)(?=\s+building\s*:|$)/i);
    const buildingMatch = raw.match(/building\s*:\s*([^\s][^]*?)$/i);
    return {
      structureName: String(structureMatch?.[1] || '').trim().toLowerCase().replace(/^"|"$/g, '').replace(/^'|'$/g, ''),
      biomeName: String(biomeMatch?.[1] || '').trim().toLowerCase().replace(/^"|"$/g, '').replace(/^'|'$/g, ''),
      buildingName: String(buildingMatch?.[1] || '').trim().toLowerCase().replace(/^"|"$/g, '').replace(/^'|'$/g, ''),
    };
  }

  function execute(parts, ctx) {
    const named = parseStructureArgs(parts);

    if (named.structureName || named.biomeName || named.buildingName) {
      if (named.structureName === 'spire') {
        if (named.biomeName !== 'badlands') {
          return { handled: true, ok: false, message: 'Usage: /spawn structure:spire biome:badlands' };
        }
        if (!ctx.spawnBadlandsSpire) {
          return { handled: true, ok: false, message: 'Structure spawn system unavailable.' };
        }
        const result = ctx.spawnBadlandsSpire();
        if (!result?.ok) {
          return { handled: true, ok: false, message: result?.message || 'Could not spawn structure.' };
        }
        return { handled: true, ok: true, message: result.message || 'Spawned spire in badlands.' };
      }

      if (named.structureName !== 'village') {
        return { handled: true, ok: false, message: 'Usage: /spawn structure:village biome:<name> building:<json_name> OR /spawn structure:spire biome:badlands' };
      }
      if (!named.biomeName || !named.buildingName) {
        return { handled: true, ok: false, message: 'Usage: /spawn structure:village biome:<name> building:<json_name>' };
      }
      if (!ctx.spawnVillageStructure) {
        return { handled: true, ok: false, message: 'Structure spawn system unavailable.' };
      }

      const result = ctx.spawnVillageStructure(named.biomeName, named.buildingName);
      if (!result?.ok) {
        return { handled: true, ok: false, message: result?.message || 'Could not spawn structure.' };
      }
      return { handled: true, ok: true, message: result.message || `Spawned ${named.structureName}/${named.buildingName}.` };
    }

    const mobId = resolveMobId(parts[1], ctx);
    const parsedMobArgs = parseMobSpawnArgs(parts);

    if (!Number.isFinite(mobId)) {
      return { handled: true, ok: false, message: 'Usage: /spawn <mobId|mobName> [amount] [height:<blocks>] OR /spawn structure:village biome:<name> building:<json_name> OR /spawn structure:spire biome:badlands' };
    }

    if (!parsedMobArgs.ok) {
      return { handled: true, ok: false, message: parsedMobArgs.message };
    }

    const mobDef = ctx.getMobById ? ctx.getMobById(mobId) : null;
    if (!mobDef) {
      return { handled: true, ok: false, message: `Mob id ${mobId} was not found.` };
    }

    const spawned = ctx.spawnMobById ? ctx.spawnMobById(mobId, parsedMobArgs.amount, parsedMobArgs.height) : 0;
    if (!spawned) {
      return { handled: true, ok: false, message: `Could not spawn ${mobDef.name}.` };
    }

    const heightSuffix = Number.isFinite(parsedMobArgs.height) ? ` with height ${parsedMobArgs.height}` : '';
    return { handled: true, ok: true, message: `Spawned ${spawned}x ${mobDef.name}${heightSuffix}.` };
  }

  window.SingleplayerChatCommandSpawn = { execute };
})();
