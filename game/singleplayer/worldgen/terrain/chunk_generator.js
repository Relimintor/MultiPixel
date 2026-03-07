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

    buildColumnContext(wx, wz, profile) {
      const noise = this.worldgenNoise;
      const continentalness = (this.perlin.noise2D(wx * 0.00135 - 190, wz * 0.00135 + 190) + 1) * 0.5;
      const erosion = (noise.fbm2D(this.perlin, wx * 0.0019 + 64, wz * 0.0019 - 64, 3, 0.55, 2.0) + 1) * 0.5;
      const valleyBias = clamp((erosion - 0.36) / 0.5, 0, 1);
      const coastalFade = clamp((continentalness - 0.28) / 0.42, 0, 1);
      const mountainMask = clamp((profile.depth - 0.35) / 0.85, 0, 1);
      const erosionBlend = lerp(0.82, 1.05, erosion);
      const detailStrength = (0.86 + profile.scale * 0.58) * (1 - mountainMask * 0.22 * (1 - coastalFade)) * erosionBlend;
      const shelfBand = 1 - Math.abs(continentalness - 0.27) / 0.17;
      const shelfMask = clamp(shelfBand, 0, 1);
      const coastalShelf = lerp(-1.25, 1.8, coastalFade) * shelfMask;
      const depthNoise = noise.fbm2D(this.perlin, wx * 0.011 + 13, wz * 0.011 - 13, 2, 0.5, 2.0) * 0.22;
      const ridge = noise.ridge2D(this.perlin, wx * 0.0041 + 90, wz * 0.0041 - 90, 3) * 0.18;

      return {
        continentalness,
        detailStrength,
        depthNoise,
        ridge,
        coastalShelf,
        valleyBias,
        targetY: this.baseLandY + profile.floor + (profile.depth * 12) + (profile.ceiling * (0.55 + profile.scale * 0.45)) + lerp(-9.5, 6.5, continentalness) - valleyBias * 2.3,
      };
    }

    sampleCellDensityForProfile(wx, y, wz, profile, column = null) {
      const noise = this.worldgenNoise;
      const col = column || this.buildColumnContext(wx, wz, profile);

      // Biome map modulates the vertical target band through depth/scale.
      const biomeBase = this.baseLandY + profile.floor + (profile.depth * 12);
      const biomeVariation = profile.ceiling * (0.55 + profile.scale * 0.45);
      const continentalLift = lerp(-9.5, 6.5, col.continentalness);
      const targetY = biomeBase + biomeVariation + continentalLift - col.valleyBias * 2.3;
      const gradient = (targetY - y) / Math.max(4, (18 + profile.ceiling));

      // Three FBM fields (low/main/high) blended by a 3rd mixer map.
      const low = noise.fbm3D(this.perlin, wx * 0.0032 + 210, y * 0.0052 - 80, wz * 0.0032 - 210, 3, 0.55, 2.0);
      const high = noise.fbm3D(this.perlin, wx * 0.0105 - 480, y * 0.012 + 35, wz * 0.0105 + 480, 5, 0.5, 2.0);
      const main = noise.fbm3D(this.perlin, wx * 0.0058 + 330, y * 0.0078 - 150, wz * 0.0058 + 95, 4, 0.52, 2.0);
      const blendMask = clamp((main + 1) * 0.5, 0, 1);
      const detail = lerp(low, high, blendMask);

      // Subtle depth-noise compensation to restore detail lost by cell interpolation.
      return gradient + detail * col.detailStrength + col.depthNoise + col.ridge + col.coastalShelf;
    }

    sampleCellDensity(wx, y, wz, biome) {
      return this.sampleCellDensityForProfile(wx, y, wz, this.getBiomeProfile(biome));
    }

    heightFromBiome(wx, wz, biome, riverMask) {
      const profile = this.getBiomeProfile(biome);
      const column = this.buildColumnContext(wx, wz, profile);
      const sampleForProfile = (y) => this.sampleCellDensityForProfile(wx, y, wz, profile, column);
      let h = 2;

      // Scan top-down in 8-block cells around an expected terrain band, then refine.
      const scanTop = Math.max(this.cellSize.y, Math.min(this.startScanY, Math.floor(column.targetY + 26)));
      const scanBottom = Math.max(0, Math.floor(column.targetY - 48));
      let firstSolidCellY = -1;
      for (let y = scanTop; y >= scanBottom; y -= this.cellSize.y) {
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
        for (let y = scanTop; y >= Math.max(1, scanBottom - 12); y--) {
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

      const continentalness = column.continentalness;
      const seaBlend = clamp((h - this.seaLevel) / 14, -1, 1);
      const coastalTarget = this.seaLevel + (profile.depth > 0.55 ? 4.2 : 1.4);
      const coastMask = clamp((continentalness - 0.19) / 0.25, 0, 1) * clamp((0.58 - continentalness) / 0.22, 0, 1);
      h = lerp(h, coastalTarget, (1 - Math.max(0, seaBlend)) * (0.06 + coastMask * 0.14));

      // Add broad basins/trenches so oceans are less uniformly shallow.
      if (profile.depth < -0.8) {
        const abyss = this.worldgenNoise.fbm2D(this.perlin, wx * 0.0022 + 900, wz * 0.0022 - 900, 3, 0.55, 2.0);
        const trenchMask = clamp((0.18 - continentalness) / 0.18, 0, 1);
        h -= Math.max(0, abyss) * 7.5 * trenchMask;
      }

      // Biome clamping avoids absurd values and keeps profiles coherent.
      const biomeMin = this.baseLandY + profile.floor - 6;
      const biomeMax = this.baseLandY + profile.ceiling + 7;
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
