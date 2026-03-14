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
  const DEFAULT_TERRAIN_RULES = {
    minGroundY: 44,
    maxGroundY: 130,
    maxSlopeDelta: 3,
    minFlatRatio: 0.72,
    sampleRadius: 6,
    validSurfaceBlocks: new Set(['grass', 'sand', 'snow', 'dirt', 'stone'])
  };

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

  function normalizeSurfaceBlockName(blockName) {
    if (typeof blockName !== 'string') return '';
    return blockName.trim().toLowerCase();
  }

  function isValidVillageSurfaceBlock(blockName, validSurfaceBlocks = DEFAULT_TERRAIN_RULES.validSurfaceBlocks) {
    return validSurfaceBlocks.has(normalizeSurfaceBlockName(blockName));
  }

  function evaluateTerrainSuitability({
    candidate,
    getGroundHeightAt,
    getSurfaceBlockAt,
    rules = {}
  }) {
    if (!candidate || typeof getGroundHeightAt !== 'function' || typeof getSurfaceBlockAt !== 'function') {
      return { ok: false, reason: 'missing_terrain_providers' };
    }

    const mergedRules = {
      ...DEFAULT_TERRAIN_RULES,
      ...rules,
      validSurfaceBlocks: rules.validSurfaceBlocks || DEFAULT_TERRAIN_RULES.validSurfaceBlocks
    };

    const centerHeight = getGroundHeightAt(candidate.worldX, candidate.worldZ);
    if (!Number.isFinite(centerHeight)) return { ok: false, reason: 'invalid_height_sample' };
    if (centerHeight < mergedRules.minGroundY || centerHeight > mergedRules.maxGroundY) {
      return { ok: false, reason: 'ground_height_out_of_range', centerHeight };
    }

    const centerSurface = getSurfaceBlockAt(candidate.worldX, candidate.worldZ);
    if (!isValidVillageSurfaceBlock(centerSurface, mergedRules.validSurfaceBlocks)) {
      return { ok: false, reason: 'invalid_surface_block', centerSurface };
    }

    let totalSamples = 0;
    let flatSamples = 0;
    let minHeight = centerHeight;
    let maxHeight = centerHeight;

    const radius = Math.max(1, Math.floor(mergedRules.sampleRadius));
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const sampleX = candidate.worldX + dx;
        const sampleZ = candidate.worldZ + dz;
        const sampleHeight = getGroundHeightAt(sampleX, sampleZ);
        if (!Number.isFinite(sampleHeight)) {
          return { ok: false, reason: 'invalid_height_sample' };
        }

        const sampleSurface = getSurfaceBlockAt(sampleX, sampleZ);
        if (!isValidVillageSurfaceBlock(sampleSurface, mergedRules.validSurfaceBlocks)) {
          return { ok: false, reason: 'invalid_surface_block', sampleSurface };
        }

        totalSamples++;
        minHeight = Math.min(minHeight, sampleHeight);
        maxHeight = Math.max(maxHeight, sampleHeight);
        if (Math.abs(sampleHeight - centerHeight) <= mergedRules.maxSlopeDelta) flatSamples++;
      }
    }

    const slopeDelta = maxHeight - minHeight;
    if (slopeDelta > mergedRules.maxSlopeDelta) {
      return { ok: false, reason: 'terrain_too_steep', slopeDelta };
    }

    const flatRatio = totalSamples > 0 ? flatSamples / totalSamples : 0;
    if (flatRatio < mergedRules.minFlatRatio) {
      return { ok: false, reason: 'insufficient_flat_space', flatRatio };
    }

    return {
      ok: true,
      centerHeight,
      slopeDelta,
      flatRatio
    };
  }

  window.VillageGeneration = {
    VALID_VILLAGE_BIOMES: Array.from(VALID_VILLAGE_BIOMES),
    DEFAULT_STRUCTURE_REGION_SIZE,
    DEFAULT_REGION_PADDING,
    DEFAULT_VILLAGE_CHANCE_PER_REGION,
    DEFAULT_TERRAIN_RULES,
    normalizeBiomeName,
    isVillageBiome,
    canGenerateVillageAt,
    getStructureRegionForPosition,
    shouldAllowVillageInRegion,
    getVillageCandidateInRegion,
    getVillageRegionCandidate,
    normalizeSurfaceBlockName,
    isValidVillageSurfaceBlock,
    evaluateTerrainSuitability
  };
})();
