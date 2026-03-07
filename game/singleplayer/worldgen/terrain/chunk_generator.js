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

    // Noise-first terrain shaping (biome only does light modulation, not hard control).
    heightFromBiome(wx, wz, biome, riverMask) {
      const continentalness = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.00082 + 220, wz * 0.00082 - 220, 5, 0.5, 2.0);
      const erosion = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.002 + 111, wz * 0.002 - 111, 4, 0.53, 2.0);
      const weirdness = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.0015 - 410, wz * 0.0015 + 90, 4, 0.5, 2.0);
      const macro = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.00045 + 650, wz * 0.00045 - 650, 4, 0.55, 2.0);
      const detail = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.009 + 40, wz * 0.009 - 40, 3, 0.5, 2.1);
      const ridge = window.WorldgenNoise.ridge2D(this.perlin, wx * 0.0038 + 90, wz * 0.0038 - 90, 4);

      const inland = clamp((continentalness + 1) * 0.5, 0, 1);
      const erosionInv = clamp(1 - (erosion + 1) * 0.5, 0, 1);
      const peaksValleys = 1 - Math.abs(weirdness);
      const ridgeShape = Math.pow(clamp(peaksValleys, 0, 1), 1.7);
      const macroMask = smoothstep(0.35, 0.75, (macro + 1) * 0.5);

      // Core terrain is fully noise-driven.
      const continentalLift = lerp(-18, 24, Math.pow(inland, 1.22));
      const baseRelief = lerp(2.5, 16.5, Math.pow(erosionInv, 1.15));
      const ridgeRelief = ridgeShape * lerp(0.8, 20, erosionInv) * lerp(0.65, 1.2, macroMask);
      const detailRelief = detail * lerp(1.1, 4.2, smoothstep(0.38, 0.84, inland));
      const jaggedRelief = Math.max(0, ridge - 0.48) * lerp(1.5, 8, erosionInv);

      let h = this.baseLandY
        + continentalLift
        + baseRelief
        + ridgeRelief
        + detailRelief
        + jaggedRelief;

      // Gentle biome modulation only (keeps style, avoids biome cliff walls).
      const biomeOffset = {
        Ocean: -4,
        'Deep Ocean': -8,
        Plains: 0,
        Forest: 1,
        Desert: 0,
        'Snowy Plains': 1,
        Mountains: 2,
      }[biome] ?? 0;
      const biomeReliefScale = {
        Ocean: 0.65,
        'Deep Ocean': 0.62,
        Plains: 0.92,
        Forest: 0.98,
        Desert: 0.94,
        'Snowy Plains': 1.0,
        Mountains: 1.08,
      }[biome] ?? 0.95;

      h = this.baseLandY + (h - this.baseLandY) * biomeReliefScale + biomeOffset;

      // Ocean shaping still based on continentalness (noise), not biome category switches.
      if (inland < 0.38) {
        const oceanDepth = 1 - smoothstep(0.0, 0.38, inland);
        h -= lerp(0, 16, oceanDepth);
      }

      // Soft river carving to keep connected valleys without cutting giant trenches.
      if (riverMask > 0.1) {
        h -= Math.min(7.5, (riverMask - 0.1) * 9.2);
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
