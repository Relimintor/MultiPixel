(function () {
  const REGISTRY = new Map();
  const VALID_RUIN_BIOMES = ['desert', 'plains', 'jungle'];
  const DEFAULT_RUIN_REGION_SIZE = 256;
  const DEFAULT_RUIN_CHANCE_PER_REGION = 0.28;

  function normalizeRuinBiomeKey(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) return '';
    if (value === 'desert') return 'desert';
    if (value === 'plains') return 'plains';
    if (value === 'jungle' || value === 'jungle_forest' || value === 'jungle forest') return 'jungle';
    return '';
  }

  function biomeDisplayNameFromKey(key) {
    if (key === 'desert') return 'Desert';
    if (key === 'plains') return 'Plains';
    if (key === 'jungle') return 'Jungle Forest';
    return '';
  }

  function register(definition) {
    const biomeKey = normalizeRuinBiomeKey(definition?.biomeKey || definition?.biome || '');
    const blocks = Array.isArray(definition?.blocks) ? definition.blocks.filter((id) => Number.isFinite(id)) : [];
    if (!biomeKey || !blocks.length) return false;
    REGISTRY.set(biomeKey, {
      biomeKey,
      name: String(definition?.name || biomeKey),
      blocks,
      chestBaseBlockId: Number(definition?.chestBaseBlockId) || blocks[0],
    });
    return true;
  }

  function getBiomeDefinition(raw) {
    return REGISTRY.get(normalizeRuinBiomeKey(raw)) || null;
  }

  function getRuinRegionCandidate({ regionX, regionZ, hashRand2D, getBiomeAt, chance = DEFAULT_RUIN_CHANCE_PER_REGION, regionSize = DEFAULT_RUIN_REGION_SIZE }) {
    if (typeof hashRand2D !== 'function' || typeof getBiomeAt !== 'function') return { allowed: false, candidate: null };
    const allowRoll = hashRand2D(regionX, regionZ, 42001);
    if (allowRoll > chance) return { allowed: false, candidate: null };

    const margin = 28;
    const span = Math.max(32, regionSize - margin * 2);
    const worldX = regionX * regionSize + margin + Math.floor(hashRand2D(regionX, regionZ, 42002) * span);
    const worldZ = regionZ * regionSize + margin + Math.floor(hashRand2D(regionX, regionZ, 42003) * span);
    const biomeName = getBiomeAt(worldX, worldZ);
    const biomeKey = normalizeRuinBiomeKey(biomeName);
    if (!REGISTRY.has(biomeKey)) return { allowed: false, candidate: null };

    return {
      allowed: true,
      candidate: {
        worldX,
        worldZ,
        biomeKey,
        biomeName: biomeDisplayNameFromKey(biomeKey),
      },
    };
  }

  window.RuinsGeneration = {
    VALID_RUIN_BIOMES,
    DEFAULT_RUIN_REGION_SIZE,
    DEFAULT_RUIN_CHANCE_PER_REGION,
    normalizeRuinBiomeKey,
    biomeDisplayNameFromKey,
    register,
    getBiomeDefinition,
    getRuinRegionCandidate,
  };
})();
