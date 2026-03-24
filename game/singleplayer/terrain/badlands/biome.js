(function () {
  const BadlandsTerrain = {
    meta: {
      terrainKey: 'badlands',
      name: 'Badlands',
      aliases: ['badlands', 'bablands', 'mesa'],
      villageKey: '',
      treeEligible: false,
      treeSpawnChance: 0,
      treeDensityKey: 'Desert',
      temperature: 2.0,
      humidity: 0.0,
      climateTarget: { temp: 0.82, humidity: 0.0, continentalness: 0.62, erosion: 0.0, weirdness: 0.72 },
    },
    isBiome({ tempNoise, humidityNoise, continentalNoise, weirdnessNoise }) {
      return tempNoise > 0.30 &&
             humidityNoise < 0.10 &&
             continentalNoise > 0.45 &&
             weirdnessNoise > 0.32;
    },
    getHeight({ BASE_LAND_Y, continentalMask, bigDuneNoise, duneDetailNoise, rockMaskNoise, erosionNoise }) {
      const mesaPlateau = continentalMask * 17;
      const mesaRidges = bigDuneNoise * 5.6 + duneDetailNoise * 1.8;
      const hardScarps = Math.max(0, rockMaskNoise - 0.66) * 18;
      const erosionSoftening = erosionNoise * 2.2;
      return BASE_LAND_Y + 3 + mesaPlateau + mesaRidges + hardScarps - erosionSoftening;
    },
  };

  window.BadlandsTerrain = BadlandsTerrain;
})();
