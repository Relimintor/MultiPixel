(function () {
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  class TerrainChunkGenerator {
    constructor({ perlin, seaLevel, baseLandY, chunkSize, chunkHeight }) {
      this.perlin = perlin;
      this.seaLevel = seaLevel;
      this.baseLandY = baseLandY;
      this.chunkSize = chunkSize;
      this.chunkHeight = chunkHeight;
      this.cellSize = { x: 4, y: 8, z: 4 };
      this.startScanY = Math.min(this.chunkHeight - 2, 96);
      this.worldgenNoise = window.WorldgenNoise;
      this.biomeProfiles = {
        Ocean: { depth: -1.18, scale: 0.18, floor: -20, ceiling: 6 },
        'Deep Ocean': { depth: -1.45, scale: 0.14, floor: -30, ceiling: 3 },
        Plains: { depth: 0.11, scale: 0.17, floor: -2, ceiling: 11 },
        Forest: { depth: 0.17, scale: 0.21, floor: 1, ceiling: 16 },
        Desert: { depth: 0.12, scale: 0.14, floor: -1, ceiling: 11 },
        'Snowy Plains': { depth: 0.15, scale: 0.21, floor: 1, ceiling: 15 },
        Mountains: { depth: 0.86, scale: 0.62, floor: 14, ceiling: 38 },
      };
    }

    getBiomeProfile(biome) {
      return this.biomeProfiles[String(biome || 'Plains')] || this.biomeProfiles.Plains;
    }

    sampleCellDensityForProfile(wx, y, wz, profile) {
      const noise = this.worldgenNoise;

      // Biome map modulates the vertical target band through depth/scale.
      const biomeBase = this.baseLandY + profile.floor + (profile.depth * 12);
      const biomeVariation = profile.ceiling * (0.55 + profile.scale * 0.45);
      const targetY = biomeBase + biomeVariation;
      const gradient = (targetY - y) / Math.max(4, (18 + profile.ceiling));

      // Three FBM fields (low/main/high) blended by a 3rd mixer map.
      const low = noise.fbm3D(this.perlin, wx * 0.0032 + 210, y * 0.0052 - 80, wz * 0.0032 - 210, 3, 0.55, 2.0);
      const high = noise.fbm3D(this.perlin, wx * 0.0105 - 480, y * 0.012 + 35, wz * 0.0105 + 480, 5, 0.5, 2.0);
      const main = noise.fbm3D(this.perlin, wx * 0.0058 + 330, y * 0.0078 - 150, wz * 0.0058 + 95, 4, 0.52, 2.0);
      const blendMask = clamp((main + 1) * 0.5, 0, 1);
      const detail = lerp(low, high, blendMask);

      // Subtle depth-noise compensation to restore detail lost by cell interpolation.
      const depthNoise = noise.fbm2D(this.perlin, wx * 0.011 + 13, wz * 0.011 - 13, 2, 0.5, 2.0) * 0.22;
      const ridge = noise.ridge2D(this.perlin, wx * 0.0041 + 90, wz * 0.0041 - 90, 3) * 0.18;
      const continentalness = (this.perlin.noise2D(wx * 0.00135 - 190, wz * 0.00135 + 190) + 1) * 0.5;
      const coastalFade = clamp((continentalness - 0.28) / 0.42, 0, 1);
      const mountainMask = clamp((profile.depth - 0.35) / 0.85, 0, 1);
      const detailStrength = (0.86 + profile.scale * 0.58) * (1 - mountainMask * 0.22 * (1 - coastalFade));

      return gradient + detail * detailStrength + depthNoise + ridge;
    }

    sampleCellDensity(wx, y, wz, biome) {
      return this.sampleCellDensityForProfile(wx, y, wz, this.getBiomeProfile(biome));
    }

    sampleCellDensity(wx, y, wz, biome) {
      return this.sampleCellDensityForProfile(wx, y, wz, this.getBiomeProfile(biome));
    }

    heightFromBiome(wx, wz, biome, riverMask) {
      const profile = this.getBiomeProfile(biome);
      const sampleForProfile = (y) => this.sampleCellDensityForProfile(wx, y, wz, profile);
      let h = 2;

      // Scan top-down in 8-block cells, then refine in 1-block steps.
      let firstSolidCellY = -1;
      for (let y = this.startScanY; y >= 0; y -= this.cellSize.y) {
        const d = sampleForProfile(y);
        if (d >= 0) {
          firstSolidCellY = y;
          break;
        }
      }

      if (firstSolidCellY < 0) {
        // Coarse 8-block samples can miss the zero-crossing in low/flat density bands.
        // Run a one-block fallback scan so ocean columns keep their natural depth variation.
        let foundSolidY = -1;
        for (let y = this.startScanY; y >= 1; y--) {
          if (sampleForProfile(y) >= 0) {
            foundSolidY = y;
            break;
          }
        }

        if (foundSolidY >= 0) {
          h = foundSolidY;
        } else {
          // If a full-column scan still finds no solid voxel, derive a biome-relative
          // fallback with noise so we never collapse large water biomes to a flat plane.
          const fallbackNoise = window.WorldgenNoise.fbm2D(this.perlin, wx * 0.014 - 71, wz * 0.014 + 71, 3, 0.5, 2.0);
          h = this.baseLandY + profile.floor + (profile.depth * 8) + fallbackNoise * (6 + profile.scale * 8);
        }
      } else {
        const refineTop = Math.min(this.chunkHeight - 2, firstSolidCellY + this.cellSize.y - 1);
        const refineBottom = Math.max(1, firstSolidCellY - this.cellSize.y);
        for (let y = refineTop; y >= refineBottom; y--) {
          if (sampleForProfile(y) >= 0) {
            h = y;
            break;
          }
        }
      }

      // River carving after terrain silhouette.
      if (riverMask > 0.1) {
        const riverDepth = Math.min(8.2, Math.pow(Math.max(0, riverMask - 0.1), 1.15) * 9.3);
        h -= riverDepth;
      }

      const seaBlend = clamp((h - this.seaLevel) / 14, -1, 1);
      const coastalTarget = this.seaLevel + (profile.depth > 0.55 ? 5.5 : 2.2);
      h = lerp(h, coastalTarget, (1 - Math.max(0, seaBlend)) * 0.06);

      // Biome clamping avoids absurd values and keeps profiles coherent.
      const biomeMin = this.baseLandY + profile.floor - 6;
      const biomeMax = this.baseLandY + profile.ceiling + 10;
      h = clamp(h, biomeMin, biomeMax);

      return Math.max(2, Math.min(this.chunkHeight - 2, Math.floor(h)));
    }

    surfaceBlockForBiome(biome, y, h, seaLevel) {
      const depth = h - 1 - y;

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
