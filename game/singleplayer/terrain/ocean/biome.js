(function () {
  const OceanTerrain = {
    isBiome({ continentalNoise, climateNoise }) {
      return continentalNoise < 0.33 || climateNoise < -0.62;
    },
    getHeight({ SEA_LEVEL, deepNoise, terrainNoise }) {
      const depth = 7 + deepNoise * 11 + terrainNoise * 4;
      return SEA_LEVEL - depth;
    },
  };
  window.OceanTerrain = OceanTerrain;
})();
