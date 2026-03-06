(function () {
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  class TerrainChunkGenerator {
    constructor({ perlin, seaLevel, baseLandY, chunkSize, chunkHeight }) {
      this.perlin = perlin;
      this.seaLevel = seaLevel;
      this.baseLandY = baseLandY;
      this.chunkSize = chunkSize;
      this.chunkHeight = chunkHeight;
    }

    // 1.17-style continentalness + erosion + peaks/valleys inspired terrain shaping.
    heightFromBiome(wx, wz, biome, riverMask) {
      const continentalness = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.00085 + 220, wz * 0.00085 - 220, 5, 0.5, 2.0);
      const erosion = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.0022 - 150, wz * 0.0022 + 150, 4, 0.53, 2.0);
      const weirdness = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.0016 + 410, wz * 0.0016 - 90, 4, 0.5, 2.0);
      const detail = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.011 + 40, wz * 0.011 - 40, 3, 0.5, 2.1);
      const jagged = window.WorldgenNoise.ridge2D(this.perlin, wx * 0.0042, wz * 0.0042, 4);

      const inland = clamp((continentalness + 1) * 0.5, 0, 1);
      const erosionInv = clamp(1 - (erosion + 1) * 0.5, 0, 1);
      const peaksValleys = 1 - Math.abs(weirdness);
      const ridgeShape = Math.pow(clamp(peaksValleys, 0, 1), 1.8);

      const biomeBase = {
        Ocean: this.seaLevel - 10,
        'Deep Ocean': this.seaLevel - 16,
        Plains: this.baseLandY + 3,
        Forest: this.baseLandY + 6,
        Desert: this.baseLandY + 5,
        'Snowy Plains': this.baseLandY + 7,
        Mountains: this.baseLandY + 12,
      };

      const base = biomeBase[biome] ?? (this.baseLandY + 5);

      const continentalLift = lerp(-12, 48, Math.pow(inland, 1.22));
      const biomeRelief = {
        Ocean: 2.6,
        'Deep Ocean': 3.5,
        Plains: 7.4,
        Forest: 8.2,
        Desert: 7.8,
        'Snowy Plains': 8.8,
        Mountains: 34,
      }[biome] ?? 7.5;

      const erosionScale = lerp(0.45, 1.35, Math.pow(erosionInv, 1.1));
      const ridgedness = biome === 'Mountains'
        ? ridgeShape * lerp(8, 48, erosionInv)
        : ridgeShape * lerp(1, 8, 1 - erosionInv);
      const jaggedness = biome === 'Mountains'
        ? Math.max(0, jagged - 0.25) * 16
        : Math.max(0, jagged - 0.45) * 4;

      let h = base
        + continentalLift
        + biomeRelief * erosionScale
        + ridgedness
        + jaggedness
        + detail * lerp(1.4, 4.5, smoothstep(0.45, 0.8, inland));

      if (biome === 'Ocean' || biome === 'Deep Ocean') {
        h -= lerp(0, 18, 1 - inland);
      }

      // Soft river carving to keep connected valleys without cutting giant trenches.
      if (biome !== 'Ocean' && biome !== 'Deep Ocean' && riverMask > 0.1) {
        h -= Math.min(8.5, (riverMask - 0.1) * 11.5);
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
