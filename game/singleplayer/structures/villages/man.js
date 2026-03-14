(function () {
  const VALID_VILLAGE_BIOMES = new Set([
    'plains',
    'desert',
    'jungle_forest',
    'oak_forest',
    'ocean',
    'snowy_plains'
  ]);

  const DEFAULT_STRUCTURE_REGION_SIZE = 384;
  const DEFAULT_REGION_PADDING = 48;
  const DEFAULT_VILLAGE_CHANCE_PER_REGION = 0.36;

  function normalizeBiomeName(biomeName) {
    if (typeof biomeName !== 'string') return '';
    return biomeName.trim().toLowerCase();
  }

  function isVillageBiome(biomeName) {
    const normalized = normalizeBiomeName(biomeName);
    return VALID_VILLAGE_BIOMES.has(normalized);
  }

  function canGenerateVillageAt(candidate) {
    const biomeName = typeof candidate === 'string' ? candidate : candidate?.biome;
    return isVillageBiome(biomeName);
  }

  function getStructureRegionForPosition(worldX, worldZ, regionSize = DEFAULT_STRUCTURE_REGION_SIZE) {
    const size = Math.max(1, Math.floor(regionSize));
    return {
      regionX: Math.floor(worldX / size),
      regionZ: Math.floor(worldZ / size),
      regionSize: size
    };
  }

  function shouldAllowVillageInRegion({ regionX, regionZ, hashRand2D, chance = DEFAULT_VILLAGE_CHANCE_PER_REGION }) {
    if (typeof hashRand2D !== 'function') return false;
    const roll = hashRand2D(regionX * 31 + 17, regionZ * 31 - 23, 11021);
    return roll < chance;
  }

  function getVillageCandidateInRegion({
    regionX,
    regionZ,
    hashRand2D,
    regionSize = DEFAULT_STRUCTURE_REGION_SIZE,
    regionPadding = DEFAULT_REGION_PADDING
  }) {
    if (typeof hashRand2D !== 'function') return null;

    const size = Math.max(1, Math.floor(regionSize));
    const maxPadding = Math.max(0, Math.floor((size - 1) / 2));
    const padding = Math.min(maxPadding, Math.max(0, Math.floor(regionPadding)));
    const minOffset = padding;
    const maxOffset = size - padding - 1;
    const offsetSpan = Math.max(1, maxOffset - minOffset + 1);

    const offsetX = minOffset + Math.floor(hashRand2D(regionX * 47 + 5, regionZ * 47 + 13, 11022) * offsetSpan);
    const offsetZ = minOffset + Math.floor(hashRand2D(regionX * 47 + 29, regionZ * 47 + 37, 11023) * offsetSpan);

    return {
      worldX: regionX * size + offsetX,
      worldZ: regionZ * size + offsetZ,
      regionX,
      regionZ,
      regionSize: size
    };
  }

  function getVillageRegionCandidate({
    regionX,
    regionZ,
    hashRand2D,
    getBiomeAt,
    chance = DEFAULT_VILLAGE_CHANCE_PER_REGION,
    regionSize = DEFAULT_STRUCTURE_REGION_SIZE,
    regionPadding = DEFAULT_REGION_PADDING
  }) {
    if (!shouldAllowVillageInRegion({ regionX, regionZ, hashRand2D, chance })) {
      return { allowed: false, reason: 'region_roll_failed' };
    }

    const candidate = getVillageCandidateInRegion({ regionX, regionZ, hashRand2D, regionSize, regionPadding });
    if (!candidate) return { allowed: false, reason: 'missing_hash' };

    const biomeName = typeof getBiomeAt === 'function'
      ? getBiomeAt(candidate.worldX, candidate.worldZ)
      : '';

    // Hard requirement: biome check runs before any other village logic.
    if (!canGenerateVillageAt({ biome: biomeName })) {
      return {
        allowed: false,
        reason: 'invalid_biome',
        biome: biomeName,
        candidate
      };
    }

    return {
      allowed: true,
      biome: normalizeBiomeName(biomeName),
      candidate
    };
  }

  window.VillageGeneration = {
    VALID_VILLAGE_BIOMES: Array.from(VALID_VILLAGE_BIOMES),
    DEFAULT_STRUCTURE_REGION_SIZE,
    DEFAULT_REGION_PADDING,
    DEFAULT_VILLAGE_CHANCE_PER_REGION,
    normalizeBiomeName,
    isVillageBiome,
    canGenerateVillageAt,
    getStructureRegionForPosition,
    shouldAllowVillageInRegion,
    getVillageCandidateInRegion,
    getVillageRegionCandidate
  };
})();
