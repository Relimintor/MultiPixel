(function () {
  class InfiniteWorldGenerator {
    constructor({ seed, perlin, seaLevel, baseLandY, chunkSize, chunkHeight, worldGenSettings = {} }) {
      const RNG = window.WorldgenRandom.QuadraticCongruential;
      this.seed = seed | 0;
      this.perlin = perlin;
      this.seaLevel = seaLevel;
      this.baseLandY = baseLandY;
      this.random = new RNG(this.seed);
      this.pipeline = new window.WorldgenPipeline.BiomePipeline({
        seed: this.seed,
        random: this.random,
        perlin: this.perlin,
        settings: worldGenSettings.biomeMap || {},
      });
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

      const sampleHeightAt = (sx, sz) => {
        const sampled = this.sample(sx, sz);
        return this.terrain.heightFromBiome(sx, sz, sampled.gameplayBiome, sampled.riverMask);
      };

      const averageAtDistance = (distance, includeDiagonals = true) => {
        const offsets = [[distance, 0], [-distance, 0], [0, distance], [0, -distance]];
        if (includeDiagonals) {
          offsets.push([distance, distance], [distance, -distance], [-distance, distance], [-distance, -distance]);
        }
        let sum = 0;
        for (const [dx, dz] of offsets) sum += sampleHeightAt(wx + dx, wz + dz);
        return sum / offsets.length;
      };

      const center = this.terrain.heightFromBiome(wx, wz, biome, riverMask);

      // Multi-scale blending to reduce vertical pillar artifacts:
      // blend coarse -> medium -> fine neighborhoods (4 -> 2 -> 1 block distances).
      const avg2 = averageAtDistance(2, false);
      const avg1 = averageAtDistance(1, false);

      const sample = sampleData || this.sample(wx, wz);
      const oceanInfluence = sample.gameplayBiome === 'Ocean' ? 1 : 0;
      const mountainInfluence = sample.gameplayBiome === 'Mountains' ? 1 : 0;

      const coastNoise = (this.perlin.noise2D(wx * 0.0012 + 120, wz * 0.0012 - 120) + 1) * 0.5;
      const coastBlend = Math.max(0, 1 - Math.abs(coastNoise - 0.42) / 0.2);
      const lowFreq = this.perlin.noise2D(wx * 0.0008 - 260, wz * 0.0008 + 260);
      const continentalness = (lowFreq + 1) * 0.5;

      const nearSeaWeight = oceanInfluence ? 0.26 : 0.12 + coastBlend * 0.08;
      const nearLandWeight = mountainInfluence ? 0.12 : 0.18;

      let blended = center;
      blended = blended * (1 - nearSeaWeight) + avg2 * nearSeaWeight;
      blended = blended * 0.79 + avg1 * 0.21;
      blended = blended * (1 - nearLandWeight) + avg1 * nearLandWeight;

      // Extra anti-spike clamp so isolated towers/pits are softened without flattening terrain.
      const localMean = avg1 * 0.7 + avg2 * 0.3;
      const spike = blended - localMean;
      if (spike > 5.0) blended -= (spike - 5.0) * 0.6;
      if (spike < -6.8) blended -= (spike + 6.8) * 0.42;

      // Shape coastlines into gentler shelves while keeping inland relief.
      const coastTarget = this.seaLevel + (mountainInfluence ? 3.6 : 1.2);
      blended = blended * (1 - coastBlend * 0.12) + coastTarget * coastBlend * 0.12;

      // Final local slope guard to avoid sheer 1-column cliffs while preserving mountains.
      const inlandMask = Math.max(0, Math.min(1, (continentalness - 0.45) / 0.3));
      const maxDeltaFromNear = mountainInfluence ? 6.4 : 4.2 + inlandMask * 1.4;
      blended = Math.max(avg1 - maxDeltaFromNear, Math.min(avg1 + maxDeltaFromNear, blended));

      const h = Math.floor(blended);
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
