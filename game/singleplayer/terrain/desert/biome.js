(function () {
  const DesertTerrain = {
    isBiome({ climateNoise, moistureNoise, continentalNoise }) {
      return climateNoise > 0.04 && moistureNoise < 0.2 && continentalNoise > 0.37;
    },
    getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, duneNoise }) {
      return BASE_LAND_Y + 1 + continentalMask * 5 + terrainNoise * 2.2 + duneNoise * 5;
    },
  };
  window.DesertTerrain = DesertTerrain;
})();
