(function () {
  class InfiniteWorldGenerator {
    constructor({ seed, perlin, seaLevel, baseLandY, chunkSize, chunkHeight }) {
      const RNG = window.WorldgenRandom.QuadraticCongruential;
      this.seed = seed | 0;
      this.perlin = perlin;
      this.seaLevel = seaLevel;
      this.baseLandY = baseLandY;
      this.random = new RNG(this.seed);
      this.pipeline = new window.WorldgenPipeline.BiomePipeline({ seed: this.seed, random: this.random, perlin: this.perlin });
      this.terrain = new window.WorldgenTerrain.TerrainChunkGenerator({
        perlin: this.perlin,
        seaLevel: this.seaLevel,
        baseLandY: this.baseLandY,
        chunkSize,
        chunkHeight,
      });
    }

    sample(wx, wz) {
      return this.pipeline.sample(wx, wz);
    }

    sampleBiome(wx, wz) {
      return this.sample(wx, wz).biome;
    }

    sampleRiverMask(wx, wz) {
      return this.sample(wx, wz).riverMask;
    }

    sampleRavineMask(wx, wz) {
      const warp = this.perlin.noise2D(wx * 0.001 + 250, wz * 0.001 + 250) * 26;
      const line = Math.abs(this.perlin.noise2D(wx * 0.0018 + warp, wz * 0.0018));
      return 1 - Math.min(1, line / 0.04);
    }

    getHeight(wx, wz, biome) {
      const riverMask = this.sampleRiverMask(wx, wz);
      return this.terrain.heightFromBiome(wx, wz, biome, riverMask);
    }

    hashRand2D(wx, wz, salt = 0) {
      return this.random.at2D(wx | 0, wz | 0, (this.seed + salt) | 0);
    }
  }

  window.WorldgenCore = window.WorldgenCore || {};
  window.WorldgenCore.InfiniteWorldGenerator = InfiniteWorldGenerator;
})();
