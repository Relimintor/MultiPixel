(function () {
  const DEFAULT_MINESHAFT_REGION_SIZE = 320;
  const DEFAULT_MINESHAFT_CHANCE_PER_REGION = 0.16;
  const DEFAULT_MINESHAFT_Y_MIN = 18;
  const DEFAULT_MINESHAFT_Y_MAX = 42;

  function normalizeBiomeKey(raw) {
    const value = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!value) return '';
    if (value === 'forest') return 'oak_forest';
    if (value === 'jungle') return 'jungle_forest';
    return value;
  }

  function isAllowedBiome(raw) {
    const key = normalizeBiomeKey(raw);
    return key === 'badlands' || key === 'desert' || key === 'plains' || key === 'oak_forest' || key === 'jungle_forest';
  }

  function getMineshaftRegionCandidate({ regionX, regionZ, hashRand2D, getBiomeAt, chance = DEFAULT_MINESHAFT_CHANCE_PER_REGION, regionSize = DEFAULT_MINESHAFT_REGION_SIZE }) {
    if (typeof hashRand2D !== 'function' || typeof getBiomeAt !== 'function') return { allowed: false, candidate: null };
    const roll = hashRand2D(regionX * 13 + 5, regionZ * 13 - 7, 45201);
    if (roll > chance) return { allowed: false, candidate: null };

    const margin = 30;
    const span = Math.max(42, regionSize - margin * 2);
    const worldX = regionX * regionSize + margin + Math.floor(hashRand2D(regionX, regionZ, 45202) * span);
    const worldZ = regionZ * regionSize + margin + Math.floor(hashRand2D(regionX, regionZ, 45203) * span);
    const biomeName = getBiomeAt(worldX, worldZ);
    if (!isAllowedBiome(biomeName)) return { allowed: false, candidate: null };

    return {
      allowed: true,
      candidate: {
        worldX,
        worldZ,
        biomeName,
        y: DEFAULT_MINESHAFT_Y_MIN + Math.floor(hashRand2D(regionX, regionZ, 45204) * (DEFAULT_MINESHAFT_Y_MAX - DEFAULT_MINESHAFT_Y_MIN + 1)),
      },
    };
  }

  window.MineshaftGeneration = {
    DEFAULT_MINESHAFT_REGION_SIZE,
    DEFAULT_MINESHAFT_CHANCE_PER_REGION,
    DEFAULT_MINESHAFT_Y_MIN,
    DEFAULT_MINESHAFT_Y_MAX,
    normalizeBiomeKey,
    isAllowedBiome,
    getMineshaftRegionCandidate,
  };
})();
