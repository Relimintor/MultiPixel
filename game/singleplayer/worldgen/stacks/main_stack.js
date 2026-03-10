(function () {
  const S = () => window.WorldgenStacksMain.shared;

  class MainBiomeStack {
    constructor(layerOps, settings = {}) {
      this.ops = layerOps;
      this.settings = settings;
      const configuredRatios = settings.temperatureRatios || {};
      const warm = Number.isFinite(configuredRatios.warm) ? Number(configuredRatios.warm) : 4;
      const cold = Number.isFinite(configuredRatios.cold) ? Number(configuredRatios.cold) : 1;
      const freezing = Number.isFinite(configuredRatios.freezing) ? Number(configuredRatios.freezing) : 1;
      const total = Math.max(1e-6, warm + cold + freezing);
      this.temperatureDistribution = {
        warm: warm / total,
        cold: cold / total,
        freezing: freezing / total,
      };
      this.specialRegionChance = Number.isFinite(settings.specialRegionChance)
        ? Math.max(0, Math.min(1, Number(settings.specialRegionChance)))
        : (1 / 13);
      this.layerCache = new Map();
      this.maxCacheEntries = 180000;
    }

    cached(layerId, x, z, resolver) {
      const key = `${layerId}:${x},${z}`;
      if (this.layerCache.has(key)) return this.layerCache.get(key);
      const value = resolver();
      this.layerCache.set(key, value);
      if (this.layerCache.size > this.maxCacheEntries) {
        let trims = Math.floor(this.maxCacheEntries * 0.2);
        const it = this.layerCache.keys();
        while (trims-- > 0) {
          const n = it.next();
          if (n.done) break;
          this.layerCache.delete(n.value);
        }
      }
      return value;
    }

    // Fuzzy zoom: doubles resolution and fills new cells via random neighbor copying.
    zoom(parentFn, x, z, salt) {
      return this.cached(`zoom_${salt}`, x, z, () => {
        const px = x >> 1;
        const pz = z >> 1;
        const sx = x & 1;
        const sz = z & 1;

        const c00 = parentFn(px, pz);
        if (sx === 0 && sz === 0) return c00;

        const c10 = parentFn(px + 1, pz);
        const c01 = parentFn(px, pz + 1);
        if (sx === 1 && sz === 0) return this.ops.random.pick2D(x, z, this.ops.seed + salt + 31, 2) === 0 ? c00 : c10;
        if (sx === 0 && sz === 1) return this.ops.random.pick2D(x, z, this.ops.seed + salt + 53, 2) === 0 ? c00 : c01;

        const c11 = parentFn(px + 1, pz + 1);

        // For the center of the 2x2 block, preserve dominant neighbors when possible
        // so macro landmasses stay coherent across early large-scale zooms.
        const roll = this.ops.random.at2D(x, z, this.ops.seed + salt + 79);
        if (c10 === c01 && c01 === c11) return c10;
        if (c00 === c10 && c00 === c01) return c00;
        if (c00 === c10) return roll < 0.66 ? c00 : (roll < 0.83 ? c01 : c11);
        if (c00 === c01) return roll < 0.66 ? c00 : (roll < 0.83 ? c10 : c11);
        if (c10 === c11) return roll < 0.66 ? c10 : (roll < 0.83 ? c00 : c01);
        if (c01 === c11) return roll < 0.66 ? c01 : (roll < 0.83 ? c00 : c10);
        if (c00 === c11) return roll < 0.5 ? c00 : (roll < 0.75 ? c10 : c01);
        return [c00, c10, c01, c11][Math.floor(roll * 4)];
      });
    }

    // Backward-compatible alias for earlier commits/tests.
    zoomFuzzy(parentFn, x, z, salt) {
      return this.zoom(parentFn, x, z, salt);
    }

    addIsland(parentFn, x, z, salt) {
      const { C, isOceanCell } = S();
      return this.cached(`add_island_${salt}`, x, z, () => {
        const center = parentFn(x, z);
        const north = parentFn(x, z - 1);
        const south = parentFn(x, z + 1);
        const west = parentFn(x - 1, z);
        const east = parentFn(x + 1, z);
        const neighbors = [north, south, west, east];

        const landNeighbors = neighbors.filter((v) => !isOceanCell(v));

        // Ocean touching land: chance is exactly 1 / (N + 1), where N is land-neighbor count.
        // When conversion happens, copy one random neighboring land value (preserves region ids).
        if (isOceanCell(center)) {
          const n = landNeighbors.length;
          if (n === 0) return center;
          const chosen = landNeighbors[this.ops.random.pick2D(x, z, this.ops.seed + salt + 31, n)];
          return this.ops.random.pick2D(x, z, this.ops.seed + salt + 53, n + 1) === 0 ? chosen : center;
        }

        // Legacy behavior: isolated land (all four neighbors ocean) erodes with
        // exact 1 / 5 probability in this layer.
        const isolatedLand = neighbors.every((v) => isOceanCell(v));
        if (isolatedLand && this.ops.random.pick2D(x, z, this.ops.seed + salt + 79, 5) === 0) return C().OCEAN;
        return center;
      });
    }

    removeTooMuchOcean(parentFn, x, z) {
      const { isOceanCell, C } = S();
      return this.cached('remove_ocean', x, z, () => {
        const center = parentFn(x, z);
        if (!isOceanCell(center)) return center;

        const n = parentFn(x, z - 1);
        const s = parentFn(x, z + 1);
        const w = parentFn(x - 1, z);
        const e = parentFn(x + 1, z);

        // Legacy rule: if center + N/S/E/W are all ocean, flip center to land with 50% chance.
        const oceanCross = isOceanCell(n) && isOceanCell(s) && isOceanCell(w) && isOceanCell(e);
        if (!oceanCross) return center;
        return this.ops.random.pick2D(x, z, this.ops.seed + 222, 2) === 0 ? C().LAND : C().OCEAN;
      });
    }

    addTemperatures(landFn, x, z) {
      const { C } = S();
      return this.cached('temperature', x, z, () => {
        if (landFn(x, z) !== C().LAND) return C().OCEAN;

        // Legacy layer-9 behavior: assign climate classes with a 4:1:1 roll.
        // warm: 4/6, cold: 1/6, freezing: 1/6.
        const climateRoll = this.ops.random.pick2D(x, z, this.ops.seed + 303, 6);
        const baseTemp = climateRoll < 4 ? C().WARM : (climateRoll === 4 ? C().COLD : C().FREEZING);

        // Legacy special flag chance: exactly 1/13.
        const isSpecial = this.ops.random.pick2D(x, z, this.ops.seed + 304, 13) === 0;
        if (!isSpecial) return baseTemp;
        if (baseTemp === C().WARM) return C().WARM_SPECIAL;
        if (baseTemp === C().COLD) return C().COLD_SPECIAL;
        return baseTemp;
      });
    }

    warmToTemperate(tempFn, x, z) {
      const { C, isWarmClass, isColdClass, isFreezingClass } = S();
      return this.cached('warm_to_temperate', x, z, () => {
        const center = tempFn(x, z);
        if (!isWarmClass(center)) return center;

        // Layer 11 (Warm -> Temperate): if a warm center touches any cold/freezing tile
        // in the cardinal neighborhood (N/S/E/W), convert it to a temperate buffer.
        const north = tempFn(x, z - 1);
        const south = tempFn(x, z + 1);
        const west = tempFn(x - 1, z);
        const east = tempFn(x + 1, z);
        const hasColdOrFreezingNeighbor = [north, south, west, east]
          .some((v) => isColdClass(v) || isFreezingClass(v));
        if (!hasColdOrFreezingNeighbor) return center;

        return center === C().WARM_SPECIAL ? C().TEMPERATE_SPECIAL : C().TEMPERATE;
      });
    }

    freezingToCold(tempFn, x, z) {
      const { C, isFreezingClass, isWarmClass } = S();
      return this.cached('freezing_to_cold', x, z, () => {
        const center = tempFn(x, z);
        if (!isFreezingClass(center)) return center;

        // Layer 12 (Freezing -> Cold): deterministic cardinal-neighbor smoothing.
        // If freezing touches any warm/temperate class in N/S/E/W, downgrade to cold.
        const north = tempFn(x, z - 1);
        const south = tempFn(x, z + 1);
        const west = tempFn(x - 1, z);
        const east = tempFn(x + 1, z);
        const hasWarmOrTemperateNeighbor = [north, south, west, east].some((v) =>
          isWarmClass(v) || v === C().TEMPERATE || v === C().TEMPERATE_SPECIAL
        );
        return hasWarmOrTemperateNeighbor ? C().COLD : center;
      });
    }

    addBiomeVariants(tempFn, x, z) {
      const { C } = S();
      return this.cached('biome_variant', x, z, () => {
        const center = tempFn(x, z);
        if (center !== C().WARM && center !== C().TEMPERATE && center !== C().COLD) return center;

        // Layer 13: mark a subset of non-freezing climates as special biome candidates.
        // warm -> badlands candidate, temperate -> jungle candidate, cold -> giant taiga candidate.
        const becomesSpecial = this.ops.random.pick2D(x, z, this.ops.seed + 401, 13) === 0;
        if (!becomesSpecial) return center;
        if (center === C().WARM) return C().WARM_SPECIAL;
        if (center === C().COLD) return C().COLD_SPECIAL;
        return C().TEMPERATE_SPECIAL;
      });
    }


    expandTemperatureToLand(tempFn, landFn, x, z, salt) {
      const { C } = S();
      return this.cached(`temperature_expand_${salt}`, x, z, () => {
        if (landFn(x, z) !== C().LAND) return C().OCEAN;
        const center = tempFn(x, z);
        if (center !== C().OCEAN) return center;

        const neighbors = [
          tempFn(x, z - 1),
          tempFn(x, z + 1),
          tempFn(x - 1, z),
          tempFn(x + 1, z),
        ].filter((v) => v !== C().OCEAN);
        if (neighbors.length > 0) {
          const pick = Math.floor(this.ops.random.at2D(x, z, this.ops.seed + salt) * neighbors.length);
          return neighbors[pick];
        }

        return this.addTemperatures(() => C().LAND, x, z);
      });
    }

    addMushroomIsland(landFn, x, z) {
      const { isOceanCell } = S();
      return this.cached('mushroom', x, z, () => {
        const center = landFn(x, z);
        if (!isOceanCell(center)) return center;
        const neighbors = [landFn(x, z - 1), landFn(x, z + 1), landFn(x - 1, z), landFn(x + 1, z)];
        const oceanSurrounded = neighbors.every((v) => isOceanCell(v));
        if (!oceanSurrounded) return center;
        return this.ops.random.pick2D(x, z, this.ops.seed + 811, 100) === 0 ? 99 : center;
      });
    }

    addDeepOcean(landFn, x, z) {
      const { isOceanCell, C } = S();
      return this.cached('deep_ocean', x, z, () => {
        const center = landFn(x, z);
        if (!isOceanCell(center)) return center;
        const neighbors = [landFn(x, z - 1), landFn(x, z + 1), landFn(x - 1, z), landFn(x + 1, z)];
        const oceanNeighbors = neighbors.filter((v) => isOceanCell(v)).length;
        return oceanNeighbors >= 4 ? C().DEEP_OCEAN : C().OCEAN;
      });
    }

    sampleLegacyMain(wx, wz) {
      return window.WorldgenStacksMain.sampleLegacyMain(this, wx, wz);
    }

    sampleBiomeStack(wx, wz, legacyMain, hillNoise) {
      return window.WorldgenStacksMain.sampleBiomeStack(this, wx, wz, legacyMain, hillNoise);
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.MainBiomeStack = MainBiomeStack;
})();
