(function () {
  function parseBiomeName(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    return value
      .toLowerCase()
      .replace(/^biome\s*:\s*/i, '')
      .replace(/^"|"$/g, '')
      .replace(/^'|'$/g, '');
  }

  function execute(parts, ctx) {
    if (!ctx) return { handled: true, ok: false, message: 'Teleport system unavailable.' };

    if ((parts[1] || '').toLowerCase().startsWith('biome:')) {
      const biomeName = parseBiomeName(parts.slice(1).join(' '));
      if (!biomeName) {
        return { handled: true, ok: false, message: 'Usage: /tp biome:<name>' };
      }
      if (!ctx.teleportToBiome) {
        return { handled: true, ok: false, message: 'Teleport system unavailable.' };
      }
      const result = ctx.teleportToBiome(biomeName);
      if (!result?.ok) {
        return { handled: true, ok: false, message: result?.message || `Could not find biome: ${biomeName}` };
      }
      return { handled: true, ok: true, message: result.message || `Teleported to biome: ${result.biome}.` };
    }

    const x = Number.parseFloat(parts[1]);
    const y = Number.parseFloat(parts[2]);
    const z = Number.parseFloat(parts[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return { handled: true, ok: false, message: 'Usage: /tp <x> <y> <z> OR /tp biome:<name>' };
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
