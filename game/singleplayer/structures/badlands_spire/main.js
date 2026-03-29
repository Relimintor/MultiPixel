(function () {
  const BADLANDS_SPIRE_REGION_SIZE = 448;
  const BADLANDS_SPIRE_CHANCE_PER_REGION = 0.07;
  const BADLANDS_SPIRE_MIN_GROUND_Y = 74;

  function normalizeBiomeKey(rawBiome) {
    const value = String(rawBiome || '').trim().toLowerCase();
    if (!value) return '';
    if (value === 'badlands' || value === 'mesa' || value === 'bablands') return 'badlands';
    return '';
  }

  function getSpireRegionCandidate({ regionX, regionZ, hashRand2D, getBiomeAt, chance = BADLANDS_SPIRE_CHANCE_PER_REGION, regionSize = BADLANDS_SPIRE_REGION_SIZE }) {
    if (typeof hashRand2D !== 'function' || typeof getBiomeAt !== 'function') return { allowed: false, candidate: null };

    const regionRoll = hashRand2D(regionX * 19 + 3, regionZ * 19 - 7, 43801);
    if (regionRoll > chance) return { allowed: false, candidate: null };

    const margin = 54;
    const span = Math.max(48, regionSize - margin * 2);
    const worldX = regionX * regionSize + margin + Math.floor(hashRand2D(regionX, regionZ, 43802) * span);
    const worldZ = regionZ * regionSize + margin + Math.floor(hashRand2D(regionX, regionZ, 43803) * span);

    const biomeName = getBiomeAt(worldX, worldZ);
    const biomeKey = normalizeBiomeKey(biomeName);
    if (biomeKey !== 'badlands') return { allowed: false, candidate: null };

    return {
      allowed: true,
      candidate: {
        biomeKey,
        biomeName: 'Badlands',
        worldX,
        worldZ,
      },
    };
  }

  window.BadlandsSpireGeneration = {
    BADLANDS_SPIRE_REGION_SIZE,
    BADLANDS_SPIRE_CHANCE_PER_REGION,
    BADLANDS_SPIRE_MIN_GROUND_Y,
    normalizeBiomeKey,
    getSpireRegionCandidate,
  };
})();
