(function () {
  const OakForestTerrain = {
    isBiome({ detailNoise, humidityNoise, distFromCenter, ISLAND_RADIUS }) {
      if (distFromCenter < ISLAND_RADIUS) return true;
      return detailNoise > -0.08 && humidityNoise > 0.05;
    },
    getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }) {
      return BASE_LAND_Y + continentalMask * 10 + terrainNoise * 5.8 - erosionNoise * 1.2;
    },
  };
  window.OakForestTerrain = OakForestTerrain;
})();
