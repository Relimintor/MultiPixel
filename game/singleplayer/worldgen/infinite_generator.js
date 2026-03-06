(function () {
  class InfiniteWorldGenerator {
    constructor({ seed, perlin, seaLevel, baseLandY, chunkHeight }) {
      const rngClass = window.WorldgenRandom?.QuadraticCongruential;
      this.seed = seed | 0;
      this.perlin = perlin;
      this.seaLevel = seaLevel;
      this.baseLandY = baseLandY;
      this.chunkHeight = chunkHeight;
      this.random = new rngClass(this.seed);
      this.pipeline = new window.LayeredBiomePipeline({ seed: this.seed, random: this.random, perlin: this.perlin });
    }

    sampleBiome(wx, wz) {
      const out = this.pipeline.at(wx, wz);
      if (out.biome === 'Mushroom Fields') return 'Forest';
      if (out.biome === 'River' || out.biome === 'Frozen River') return out.biome === 'Frozen River' ? 'Snowy Plains' : 'Plains';
      return out.biome;
    }

    sampleRiverMask(wx, wz) {
      return this.pipeline.at(wx, wz).riverMask;
    }

    sampleRavineMask(wx, wz) {
      const warp = this.perlin.noise2D(wx * 0.001 + 250, wz * 0.001 + 250) * 26;
      const line = Math.abs(this.perlin.noise2D(wx * 0.0018 + warp, wz * 0.0018));
      return 1 - Math.min(1, line / 0.04);
    }

    getHeight(wx, wz, biome) {
      const baseFbm = this.perlin.fbm2D(wx * 0.0042, wz * 0.0042, 5, 2, 0.5);
      const detailFbm = this.perlin.fbm2D(wx * 0.0145 + 200, wz * 0.0145 - 200, 3, 2, 0.5);
      const continental = this.perlin.fbm2D(wx * 0.00085 - 300, wz * 0.00085 + 300, 4, 2, 0.55);
      const mountain = Math.abs(this.perlin.fbm2D(wx * 0.0026 + 800, wz * 0.0026 - 500, 4, 2, 0.5));

      const biomeAmplitude = {
        Ocean: -11,
        Plains: 8,
        Forest: 11,
        Desert: 9,
        Mountains: 30,
        'Snowy Plains': 10,
      };
      const amp = biomeAmplitude[biome] ?? 9;
      const continentalLift = (continental + 1) * 0.5 * 16;
      let h = this.baseLandY + continentalLift + baseFbm * amp + detailFbm * (amp * 0.32);

      if (biome === 'Mountains') h += mountain * 18;
      if (biome === 'Ocean') h = this.seaLevel - 8 + baseFbm * 4;

      const river = this.sampleRiverMask(wx, wz);
      if (river > 0.12 && biome !== 'Ocean') {
        h -= (river - 0.12) * 20;
      }

      return Math.max(2, Math.min(this.chunkHeight - 2, Math.floor(h)));
    }

    hashRand2D(wx, wz, salt = 0) {
      return this.random.valueAt2D(wx | 0, wz | 0, (this.seed + salt) | 0);
    }
  }

  window.InfiniteWorldGenerator = InfiniteWorldGenerator;
})();
