(function () {
  const JungleForestTerrain = {
    isBiome({ tempNoise, humidityNoise, mountainNoise }) {
      return tempNoise > 0.45 && humidityNoise > 0.35 && mountainNoise < 0.78;
    },
    getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }) {
      return BASE_LAND_Y + 2 + continentalMask * 9.5 + terrainNoise * 6.6 - erosionNoise * 0.9;
    },
  };

  window.JungleForestTerrain = JungleForestTerrain;
})();
