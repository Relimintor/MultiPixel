(function () {
  const MountainsTerrain = {
    isBiome({ mountainNoise, continentalNoise }) {
      return mountainNoise > 0.58 && continentalNoise > 0.45;
    },
    getHeight({ BASE_LAND_Y, continentalMask, ridgeNoise, terrainNoise }) {
      return BASE_LAND_Y + 15 + continentalMask * 16 + ridgeNoise * 18 + terrainNoise * 5;
    },
  };
  window.MountainsTerrain = MountainsTerrain;
})();
