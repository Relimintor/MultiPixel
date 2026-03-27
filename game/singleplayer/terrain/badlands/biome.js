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
    getHeight({ BASE_LAND_Y, continentalMask, bigDuneNoise, duneDetailNoise, rockMaskNoise, erosionNoise, weirdness = 0 }) {
      // Eroded Badlands profile: high mesa shelves + carved gullies + tall hoodoo spikes.
      const mesaShelf = continentalMask * 22;
      const broadMesaShape = Math.pow(Math.max(0, bigDuneNoise - 0.32), 1.2) * 11;

      // Terraced plateaus to mimic stepped clay shelves.
      const terraceSample = (bigDuneNoise * 0.72) + (duneDetailNoise * 0.28);
      const terraceBands = Math.floor(terraceSample * 8) / 8;
      const terraceLift = terraceBands * 6.5;

      // Erosion carves canyons between spires.
      const canyonCut = Math.pow(Math.max(0, erosionNoise - 0.42), 1.45) * 11.5;

      // Hoodoos (Bryce spires): sharp, tall peaks where rock mask is strongest.
      const hoodooMask = Math.pow(Math.max(0, rockMaskNoise - 0.5), 2.35);
      const weirdnessAmp = 0.6 + Math.min(1.4, Math.abs(weirdness) * 1.15);
      const hoodooHeight = hoodooMask * (12 + duneDetailNoise * 22) * (1 - canyonCut / 15) * weirdnessAmp;

      const height = BASE_LAND_Y + 2 + mesaShelf + broadMesaShape + terraceLift + hoodooHeight - canyonCut;
      return Math.max(BASE_LAND_Y - 3, height);
    },
  };

  window.BadlandsTerrain = BadlandsTerrain;
})();
