(function () {
  class TerrainChunkGenerator {
    constructor({ perlin, seaLevel, baseLandY, chunkSize, chunkHeight }) {
      this.perlin = perlin;
      this.seaLevel = seaLevel;
      this.baseLandY = baseLandY;
      this.chunkSize = chunkSize;
      this.chunkHeight = chunkHeight;
    }

    // Temporary phase: terrain is intentionally driven almost entirely by biome map.
    // Keep this simple until the dedicated terrain phase is implemented.
    heightFromBiome(wx, wz, biome, riverMask) {
      const baseByBiome = {
        Ocean: this.seaLevel - 5,
        'Deep Ocean': this.seaLevel - 8,
        Plains: this.baseLandY + 4,
        Forest: this.baseLandY + 5,
        Desert: this.baseLandY + 5,
        'Snowy Plains': this.baseLandY + 6,
        Mountains: this.baseLandY + 11,
      };

      let h = baseByBiome[biome] ?? (this.baseLandY + 5);

      // Rivers carve softly only where applicable.
      if (biome !== 'Ocean' && biome !== 'Deep Ocean' && riverMask > 0.15) {
        h -= Math.min(4, (riverMask - 0.15) * 7.5);
      }

      return Math.max(2, Math.min(this.chunkHeight - 2, Math.floor(h)));
    }

    surfaceBlockForBiome(biome, y, h, seaLevel) {
      const depth = h - 1 - y;

      // Keep submerged floors sandy/gravelly instead of grassy.
      if (h < seaLevel) {
        if (depth === 0) return 7;
        if (depth < 4) return 28;
        return 3;
      }

      if (biome === 'Desert') return depth < 5 ? 7 : 13;
      if (biome === 'Snowy Plains') return depth === 0 ? 15 : 59;
      if (biome === 'Mountains') return depth === 0 && h > seaLevel + 20 ? 15 : 3;
      if (biome === 'Ocean' || biome === 'Deep Ocean') return depth <= 2 ? 28 : 3;
      const beach = h >= seaLevel - 1 && h <= seaLevel + 2;
      if (depth === 0) return beach ? 7 : 1;
      if (depth < 4) return beach ? 7 : 2;
      return 3;
    }
  }

  window.WorldgenTerrain = window.WorldgenTerrain || {};
  window.WorldgenTerrain.TerrainChunkGenerator = TerrainChunkGenerator;
})();
