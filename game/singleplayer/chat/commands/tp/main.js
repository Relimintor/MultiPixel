(function () {
  function parseBiomeName(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    return value
      .toLowerCase()
      .replace(/^biome\s*:\s*/i, '')
      .replace(/^[\s("'`]+|[\s)"'`]+$/g, '')
      .replace(/^"|"$/g, '')
      .replace(/^'|'$/g, '');
  }


  function parseStructureName(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    return value
      .toLowerCase()
      .replace(/^structure\s*:\s*/i, '')
      .replace(/^"|"$/g, '')
      .replace(/^'|'$/g, '');
  }

  function parseTpNamedArgs(parts) {
    const raw = String((parts || []).slice(1).join(' ') || '');
    const structureMatch = raw.match(/structure\s*:\s*([^\s][^]*?)(?=\s+biome\s*:|$)/i);
    const biomeMatch = raw.match(/biome\s*:\s*([^\s][^]*?)$/i);
    return {
      structureName: parseStructureName(structureMatch ? structureMatch[1] : ''),
      biomeName: parseBiomeName(biomeMatch ? biomeMatch[1] : '')
    };
  }

  function execute(parts, ctx) {
    if (!ctx) return { handled: true, ok: false, message: 'Teleport system unavailable.' };

    const named = parseTpNamedArgs(parts);
    if (named.structureName || named.biomeName) {
      if (named.structureName) {
        if (named.structureName !== 'village' && named.structureName !== 'ruins' && named.structureName !== 'ruin' && named.structureName !== 'spire') {
          return { handled: true, ok: false, message: 'Usage: /tp structure:<village|ruins|spire> biome:<name>' };
        }
        if (!named.biomeName) {
          return { handled: true, ok: false, message: 'Usage: /tp structure:<village|ruins|spire> biome:<name>' };
        }
        if (named.structureName === 'village') {
          if (!ctx.teleportToVillageStructure) {
            return { handled: true, ok: false, message: 'Teleport system unavailable.' };
          }
          const result = ctx.teleportToVillageStructure(named.biomeName);
          if (!result?.ok) {
            return { handled: true, ok: false, message: result?.message || `Could not find village biome: ${named.biomeName}` };
          }
          return { handled: true, ok: true, message: result.message || `Teleported to ${result.structure || 'village'} in ${result.biome}.` };
        }
        if (named.structureName === 'spire') {
          if (!ctx.teleportToBadlandsSpire) {
            return { handled: true, ok: false, message: 'Teleport system unavailable.' };
          }
          const result = ctx.teleportToBadlandsSpire(named.biomeName);
          if (!result?.ok) {
            return { handled: true, ok: false, message: result?.message || `Could not find spire biome: ${named.biomeName}` };
          }
          return { handled: true, ok: true, message: result.message || `Teleported to ${result.structure || 'spire'} in ${result.biome}.` };
        }
        if (!ctx.teleportToRuinStructure) {
          return { handled: true, ok: false, message: 'Teleport system unavailable.' };
        }
        const result = ctx.teleportToRuinStructure(named.biomeName);
        if (!result?.ok) {
          return { handled: true, ok: false, message: result?.message || `Could not find ruins biome: ${named.biomeName}` };
        }
        return { handled: true, ok: true, message: result.message || `Teleported to ${result.structure || 'ruins'} in ${result.biome}.` };
      }

      if (!named.biomeName) {
        return { handled: true, ok: false, message: 'Usage: /tp biome:<name>' };
      }
      if (!ctx.teleportToBiome) {
        return { handled: true, ok: false, message: 'Teleport system unavailable.' };
      }
      const result = ctx.teleportToBiome(named.biomeName);
      if (!result?.ok) {
        return { handled: true, ok: false, message: result?.message || `Could not find biome: ${named.biomeName}` };
      }
      return { handled: true, ok: true, message: result.message || `Teleported to biome: ${result.biome}.` };
    }

    if (!named.structureName && !named.biomeName && parts.length === 2) {
      const directBiome = parseBiomeName(parts[1]);
      if (directBiome && !Number.isFinite(Number.parseFloat(directBiome))) {
        if (!ctx.teleportToBiome) {
          return { handled: true, ok: false, message: 'Teleport system unavailable.' };
        }
        const result = ctx.teleportToBiome(directBiome);
        if (!result?.ok) {
          return { handled: true, ok: false, message: result?.message || `Could not find biome: ${directBiome}` };
        }
        return { handled: true, ok: true, message: result.message || `Teleported to biome: ${result.biome}.` };
      }
    }

    const x = Number.parseFloat(parts[1]);
    const y = Number.parseFloat(parts[2]);
    const z = Number.parseFloat(parts[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return { handled: true, ok: false, message: 'Usage: /tp <x> <y> <z> OR /tp <biome_name> OR /tp biome:<name> OR /tp structure:<village|ruins|spire> biome:<name>' };
    }

    if (!ctx.teleportToCoordinates) {
      return { handled: true, ok: false, message: 'Teleport system unavailable.' };
    }

    const result = ctx.teleportToCoordinates(x, y, z);
    if (!result?.ok) {
      return { handled: true, ok: false, message: result?.message || 'Teleport failed.' };
    }

    return { handled: true, ok: true, message: result.message || `Teleported to ${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)}.` };
  }

  window.SingleplayerChatCommandTp = { execute };
})();
