(function () {
  class TerrainChunkGenerator {
    constructor({ perlin, seaLevel, baseLandY, chunkSize, chunkHeight }) {
      this.perlin = perlin;
      this.seaLevel = seaLevel;
      this.baseLandY = baseLandY;
      this.chunkSize = chunkSize;
      this.chunkHeight = chunkHeight;
    }

    // Biome-map-led terrain with smooth large-scale shape.
    // This keeps biome identity, but removes the "flat 4x4 mined" look.
    heightFromBiome(wx, wz, biome, riverMask) {
      const continental = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.0019 + 220, wz * 0.0019 - 220, 4, 0.5, 2.0);
      const erosion = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.0036 - 150, wz * 0.0036 + 150, 3, 0.5, 2.0);
      const detail = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.0088 + 40, wz * 0.0088 - 40, 2, 0.5, 2.0);
      const ridge = window.WorldgenNoise.ridge2D(this.perlin, wx * 0.0022, wz * 0.0022, 3);

      const biomeBase = {
        Ocean: this.seaLevel - 6,
        'Deep Ocean': this.seaLevel - 10,
        Plains: this.baseLandY + 4,
        Forest: this.baseLandY + 6,
        Desert: this.baseLandY + 5,
        'Snowy Plains': this.baseLandY + 6,
        Mountains: this.baseLandY + 13,
      };

      const biomeAmplitude = {
        Ocean: 2.8,
        'Deep Ocean': 3.2,
        Plains: 5.0,
        Forest: 5.6,
        Desert: 5.2,
        'Snowy Plains': 5.4,
        Mountains: 9.5,
      };

      const base = biomeBase[biome] ?? (this.baseLandY + 5);
      const amp = biomeAmplitude[biome] ?? 5.0;

      let h = base + continental * amp + erosion * (amp * 0.42) + detail * 1.6;

      if (biome === 'Mountains') h += ridge * 5.0;

      // Soft river carving to keep connected valleys without aggressive trenches.
      if (biome !== 'Ocean' && biome !== 'Deep Ocean' && riverMask > 0.12) {
        h -= Math.min(6.5, (riverMask - 0.12) * 12);
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
