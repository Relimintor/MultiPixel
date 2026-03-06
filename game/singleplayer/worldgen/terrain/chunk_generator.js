(function () {
  class TerrainChunkGenerator {
    constructor({ perlin, seaLevel, baseLandY, chunkSize, chunkHeight }) {
      this.perlin = perlin;
      this.seaLevel = seaLevel;
      this.baseLandY = baseLandY;
      this.chunkSize = chunkSize;
      this.chunkHeight = chunkHeight;
    }

    heightFromBiome(wx, wz, biome, riverMask) {
      const n = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.0042, wz * 0.0042, 5, 0.5, 2.0);
      const d = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.0125 + 201, wz * 0.0125 - 201, 3, 0.5, 2.0);
      const ridge = window.WorldgenNoise.ridge2D(this.perlin, wx * 0.0026, wz * 0.0026, 4);
      const amp = biome === 'Mountains' ? 28 : biome === 'Forest' ? 11 : biome === 'Desert' ? 9 : biome === 'Snowy Plains' ? 10 : biome === 'Ocean' ? -9 : 8;

      let h = this.baseLandY + n * amp + d * (amp * 0.35);
      if (biome === 'Mountains') h += ridge * 18;
      if (biome === 'Ocean') h = this.seaLevel - 7 + n * 4;
      if (biome !== 'Ocean' && riverMask > 0.12) h -= (riverMask - 0.12) * 20;

      return Math.max(2, Math.min(this.chunkHeight - 2, Math.floor(h)));
    }

    surfaceBlockForBiome(biome, y, h, seaLevel) {
      const depth = h - 1 - y;
      if (biome === 'Desert') return depth < 5 ? 7 : 13;
      if (biome === 'Snowy Plains') return depth === 0 ? 15 : 59;
      if (biome === 'Mountains') return depth === 0 && h > seaLevel + 24 ? 15 : 3;
      if (biome === 'Ocean') return depth <= 2 ? 28 : 3;
      const beach = h >= seaLevel - 1 && h <= seaLevel + 2;
      if (depth === 0) return beach ? 7 : 1;
      if (depth < 4) return beach ? 7 : 2;
      return 3;
    }
  }

  window.WorldgenTerrain = window.WorldgenTerrain || {};
  window.WorldgenTerrain.TerrainChunkGenerator = TerrainChunkGenerator;
})();
