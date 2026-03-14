(function () {
  const VALID_VILLAGE_BIOMES = new Set([
    'plains',
    'desert',
    'jungle_forest',
    'oak_forest',
    'ocean',
    'snowy_plains'
  ]);

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

  window.VillageGeneration = {
    VALID_VILLAGE_BIOMES: Array.from(VALID_VILLAGE_BIOMES),
    normalizeBiomeName,
    isVillageBiome,
    canGenerateVillageAt
  };
})();
