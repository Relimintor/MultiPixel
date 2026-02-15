(function () {
  const PlainsTerrain = {
    isBiome({ humidityNoise, mountainNoise }) {
      return humidityNoise > -0.2 && mountainNoise < 0.55;
    },
    getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }) {
      return BASE_LAND_Y + continentalMask * 7 + terrainNoise * 2.3 - erosionNoise * 1.8;
    },
  };
  window.PlainsTerrain = PlainsTerrain;
})();
