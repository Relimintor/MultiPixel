(function () {
  const OceanTerrain = {
    isBiome({ continentalNoise, climateNoise }) {
      return continentalNoise < 0.36 || climateNoise < -0.58;
    },
    getHeight({ SEA_LEVEL, deepNoise, terrainNoise }) {
      const depth = 7 + deepNoise * 11 + terrainNoise * 4;
      return SEA_LEVEL - depth;
    },
  };
  window.OceanTerrain = OceanTerrain;
})();
