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
      // Two-band badlands profile:
      // - lowlands: broad basins/valleys
      // - highlands: cliffy mesa shelves (not mountain-like spikes)
      const highlandMask = Math.pow(Math.max(0, bigDuneNoise - 0.47), 1.25);
      const lowlandMask = Math.pow(Math.max(0, 0.54 - bigDuneNoise), 1.1);

      const basePlateau = BASE_LAND_Y + 1 + continentalMask * 9.5;
      const lowlandShelf = lowlandMask * 4.5;
      const highlandShelf = highlandMask * 16.5;

      // Terraces: stronger and chunkier to mimic layered mesas.
      const terraceSample = (bigDuneNoise * 0.66) + (duneDetailNoise * 0.34);
      const terraceBands = Math.floor(terraceSample * 9) / 9;
      const terraceLift = terraceBands * (4.8 + highlandMask * 5.6);

      // Carve deeper channels in lowlands so the biome has visible valleys.
      const valleyCut = Math.pow(Math.max(0, erosionNoise - 0.34), 1.42) * (6.5 + lowlandMask * 10.5);

      // Cliff accent for highlands: sharp sidewalls with flatter tops.
      const cliffMask = Math.pow(Math.max(0, rockMaskNoise - 0.42), 1.9) * (0.45 + highlandMask * 1.2);
      const weirdnessAmp = 0.7 + Math.min(1.35, Math.abs(weirdness) * 0.9);
      const cliffLift = cliffMask * (5.5 + duneDetailNoise * 11.5) * weirdnessAmp;

      // Limit vertical range so badlands become cliffs/mesas instead of mountains.
      let height = basePlateau + lowlandShelf + highlandShelf + terraceLift + cliffLift - valleyCut;
      const upperCap = BASE_LAND_Y + 31.5;
      const lowerCap = BASE_LAND_Y - 6.5;
      if (height > upperCap) {
        // Soft cap keeps tops flatter like mesa plateaus.
        height = upperCap - (height - upperCap) * 0.35;
      }
      return Math.max(lowerCap, height);
    },
  };

  window.BadlandsTerrain = BadlandsTerrain;
})();
