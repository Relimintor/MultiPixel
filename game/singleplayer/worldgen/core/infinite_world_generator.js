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
      this.sampleCache = new Map();
      this.heightCache = new Map();
      this.cacheMaxEntries = 45000;
    }

    makeCoordKey(wx, wz) {
      return `${wx | 0},${wz | 0}`;
    }

    setCache(map, key, value) {
      map.set(key, value);
      if (map.size > this.cacheMaxEntries) {
        const first = map.keys().next();
        if (!first.done) map.delete(first.value);
      }
    }

    sample(wx, wz) {
      const key = this.makeCoordKey(wx, wz);
      const cached = this.sampleCache.get(key);
      if (cached) return cached;
      const out = this.pipeline.sample(wx, wz);
      this.setCache(this.sampleCache, key, out);
      return out;
    }

    sampleBiome(wx, wz, sampleData = null) {
      const sample = sampleData || this.sample(wx, wz);
      return sample.gameplayBiome;
    }

    sampleRiverMask(wx, wz, sampleData = null) {
      const sample = sampleData || this.sample(wx, wz);
      return sample.riverMask;
    }

    sampleRavineMask(wx, wz) {
      const warp = this.perlin.noise2D(wx * 0.001 + 250, wz * 0.001 + 250) * 26;
      const line = Math.abs(this.perlin.noise2D(wx * 0.0018 + warp, wz * 0.0018));
      return 1 - Math.min(1, line / 0.04);
    }

    getHeight(wx, wz, biome, sampleData = null) {
      const riverMask = this.sampleRiverMask(wx, wz, sampleData);
      const biomeKey = String(biome || 'Plains');
      const riverKey = Math.round(riverMask * 1000);
      const key = `${wx | 0},${wz | 0},${biomeKey},${riverKey}`;
      const cached = this.heightCache.get(key);
      if (cached !== undefined) return cached;
      const h = this.terrain.heightFromBiome(wx, wz, biome, riverMask);
      this.setCache(this.heightCache, key, h);
      return h;
    }

    hashRand2D(wx, wz, salt = 0) {
      return this.random.at2D(wx | 0, wz | 0, (this.seed + salt) | 0);
    }
  }

  window.WorldgenCore = window.WorldgenCore || {};
  window.WorldgenCore.InfiniteWorldGenerator = InfiniteWorldGenerator;
})();
