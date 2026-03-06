(function () {
  class TerrainChunkGenerator {
    constructor({ perlin, seaLevel, baseLandY, chunkSize, chunkHeight }) {
      this.perlin = perlin;
      this.seaLevel = seaLevel;
      this.baseLandY = baseLandY;
      this.chunkSize = chunkSize;
      this.chunkHeight = chunkHeight;
    }

    // Phase-2 terrain pass: gentle large-scale relief driven by biome map.
    // Keep this intentionally smooth until the dedicated terrain pipeline lands.
    heightFromBiome(wx, wz, biome, riverMask) {
      const continental = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.0018 + 210, wz * 0.0018 - 210, 4, 0.5, 2.0);
      const erosion = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.0032 - 145, wz * 0.0032 + 145, 3, 0.5, 2.0);
      const detail = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.0075 + 33, wz * 0.0075 - 33, 2, 0.5, 2.0);

      const biomeTarget = {
        Ocean: this.seaLevel - 5,
        'Deep Ocean': this.seaLevel - 9,
        Plains: this.baseLandY + 5,
        Forest: this.baseLandY + 7,
        Desert: this.baseLandY + 6,
        'Snowy Plains': this.baseLandY + 8,
        Mountains: this.baseLandY + 16,
      };

      const biomeRelief = {
        Ocean: 2.0,
        'Deep Ocean': 2.6,
        Plains: 3.2,
        Forest: 3.8,
        Desert: 3.5,
        'Snowy Plains': 3.8,
        Mountains: 7.2,
      };

      const base = biomeTarget[biome] ?? (this.baseLandY + 6);
      const relief = biomeRelief[biome] ?? 3.5;

      // Low-frequency continentalness and erosion shape the main slope.
      let h = base + continental * relief + erosion * (relief * 0.45) + detail * 1.1;

      // Rivers should carve softly during this stage.
      if (biome !== 'Ocean' && biome !== 'Deep Ocean' && riverMask > 0.12) {
        h -= (riverMask - 0.12) * 8.5;
      }

      // Keep mountain regions recognizable but avoid jagged phase-3 style spikes.
      if (biome === 'Mountains') {
        const ridge = window.WorldgenNoise.ridge2D(this.perlin, wx * 0.0018, wz * 0.0018, 3);
        h += ridge * 4.5;
      }

      return Math.max(2, Math.min(this.chunkHeight - 2, Math.floor(h)));
    }

    surfaceBlockForBiome(biome, y, h, seaLevel) {
      const depth = h - 1 - y;
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
