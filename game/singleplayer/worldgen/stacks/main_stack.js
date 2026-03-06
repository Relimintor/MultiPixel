(function () {
  const C = () => window.WorldgenLayers.Constants;

  const isOceanCell = (v) => v === C().OCEAN || v === C().DEEP_OCEAN;
  const isWarmClass = (t) => t === C().WARM || t === C().WARM_SPECIAL;
  const isColdClass = (t) => t === C().COLD || t === C().COLD_SPECIAL;
  const isFreezingClass = (t) => t === C().FREEZING;

  class MainBiomeStack {
    constructor(layerOps, settings = {}) {
      this.ops = layerOps;
      this.settings = settings;
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
        const c11 = parentFn(px + 1, pz + 1);
        const roll = this.ops.random.at2D(x, z, this.ops.seed + salt);

        if (sx === 0 && sz === 1) return roll < 0.5 ? c00 : c01;
        if (sx === 1 && sz === 0) return roll < 0.5 ? c00 : c10;
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

    addIsland(parentFn, x, z, salt) {
      return this.cached(`add_island_${salt}`, x, z, () => {
        const center = parentFn(x, z);
        const north = parentFn(x, z - 1);
        const south = parentFn(x, z + 1);
        const west = parentFn(x - 1, z);
        const east = parentFn(x + 1, z);
        const neighbors = [north, south, west, east];
        const rand = this.ops.random.at2D(x, z, this.ops.seed + salt);

        if (center === C().LAND) {
          const oceanNeighbors = neighbors.filter((v) => isOceanCell(v)).length;
          if (oceanNeighbors >= 3 && rand < 0.14) return C().OCEAN;
          return C().LAND;
        }

        const landNeighbors = neighbors.filter((v) => v === C().LAND).length;
        if (landNeighbors === 0) return center;
        return rand < 0.36 ? C().LAND : center;
      });
    }

    removeTooMuchOcean(parentFn, x, z) {
      return this.cached('remove_ocean', x, z, () => {
        const center = parentFn(x, z);
        if (!isOceanCell(center)) return center;
        const n = parentFn(x, z - 1);
        const s = parentFn(x, z + 1);
        const w = parentFn(x - 1, z);
        const e = parentFn(x + 1, z);
        if (isOceanCell(n) && isOceanCell(s) && isOceanCell(w) && isOceanCell(e)) {
          return this.ops.random.at2D(x, z, this.ops.seed + 222) < 0.5 ? C().LAND : C().OCEAN;
        }
        return center;
      });
    }

    addTemperatures(landFn, x, z) {
      return this.cached('temperature', x, z, () => {
        if (landFn(x, z) !== C().LAND) return C().OCEAN;
        const r = this.ops.random.at2D(x, z, this.ops.seed + 303);
        const special = this.ops.random.at2D(x, z, this.ops.seed + 304) < (1 / 13);
        if (r < (4 / 6)) return special ? C().WARM_SPECIAL : C().WARM;
        if (r < (5 / 6)) return special ? C().COLD_SPECIAL : C().COLD;
        return C().FREEZING;
      });
    }

    warmToTemperate(tempFn, x, z) {
      return this.cached('warm_to_temperate', x, z, () => {
        const center = tempFn(x, z);
        if (!isWarmClass(center)) return center;
        const neighbors = [tempFn(x, z - 1), tempFn(x, z + 1), tempFn(x - 1, z), tempFn(x + 1, z)];
        const hasColdNeighbor = neighbors.some((v) => isColdClass(v) || isFreezingClass(v));
        if (!hasColdNeighbor) return center;
        return center === C().WARM_SPECIAL ? C().TEMPERATE_SPECIAL : C().TEMPERATE;
      });
    }

    freezingToCold(tempFn, x, z) {
      return this.cached('freezing_to_cold', x, z, () => {
        const center = tempFn(x, z);
        if (!isFreezingClass(center)) return center;
        const neighbors = [tempFn(x, z - 1), tempFn(x, z + 1), tempFn(x - 1, z), tempFn(x + 1, z)];
        const hasWarmishNeighbor = neighbors.some((v) => isWarmClass(v) || v === C().TEMPERATE || v === C().TEMPERATE_SPECIAL);
        return hasWarmishNeighbor ? C().COLD : center;
      });
    }

    addBiomeVariants(tempFn, x, z) {
      return this.cached('biome_variant', x, z, () => tempFn(x, z));
    }

    addMushroomIsland(landFn, x, z) {
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
      return this.cached('deep_ocean', x, z, () => {
        const center = landFn(x, z);
        if (!isOceanCell(center)) return center;
        const neighbors = [landFn(x, z - 1), landFn(x, z + 1), landFn(x - 1, z), landFn(x + 1, z)];
        const oceanNeighbors = neighbors.filter((v) => isOceanCell(v)).length;
        return oceanNeighbors >= 4 ? C().DEEP_OCEAN : C().OCEAN;
      });
    }

    sampleLegacyMain(wx, wz) {
      const x4096 = Math.floor(wx / 4096);
      const z4096 = Math.floor(wz / 4096);
      const x256 = Math.floor(wx / 256);
      const z256 = Math.floor(wz / 256);

      const island4096 = (x, z) => this.cached('island_4096', x, z, () => this.ops.island(x, z));
      const zoom2048 = (x, z) => this.zoom(island4096, x, z, 1);
      const addIsland2048 = (x, z) => this.addIsland(zoom2048, x, z, 2);
      const zoom1024 = (x, z) => this.zoom(addIsland2048, x, z, 3);
      const addIsland1024a = (x, z) => this.addIsland(zoom1024, x, z, 4);
      const addIsland1024b = (x, z) => this.addIsland(addIsland1024a, x, z, 5);
      const addIsland1024c = (x, z) => this.addIsland(addIsland1024b, x, z, 6);
      const removeOcean1024 = (x, z) => this.removeTooMuchOcean(addIsland1024c, x, z);
      const temp1024 = (x, z) => this.addTemperatures(removeOcean1024, x, z);
      const addIslandPostTemp1024 = (x, z) => this.addIsland(removeOcean1024, x, z, 7);
      const warmTemp1024 = (x, z) => this.warmToTemperate(temp1024, x, z);
      const coldTemp1024 = (x, z) => this.freezingToCold(warmTemp1024, x, z);
      const variantTemp1024 = (x, z) => this.addBiomeVariants(coldTemp1024, x, z);
      const zoomLand512 = (x, z) => this.zoom(addIslandPostTemp1024, x, z, 8);
      const zoomTemp512 = (x, z) => this.zoom(variantTemp1024, x, z, 9);
      const zoomLand256 = (x, z) => this.zoom(zoomLand512, x, z, 10);
      const zoomTemp256 = (x, z) => this.zoom(zoomTemp512, x, z, 11);
      const addIsland256 = (x, z) => this.addIsland(zoomLand256, x, z, 12);
      const mushroom256 = (x, z) => this.addMushroomIsland(addIsland256, x, z);
      const deepOcean256 = (x, z) => this.addDeepOcean(mushroom256, x, z);

      return {
        island: island4096(x4096, z4096),
        land: deepOcean256(x256, z256),
        temp: zoomTemp256(x256, z256),
        landFn256: deepOcean256,
        tempFn256: zoomTemp256,
      };
    }

    sampleBiomeStack(wx, wz, legacyMain, hillNoise) {
      const x256 = Math.floor(wx / 256);
      const z256 = Math.floor(wz / 256);
      const x4 = Math.floor(wx / 4);
      const z4 = Math.floor(wz / 4);

      const biome256 = (x, z) => this.cached('biome_256', x, z, () => {
        const landCell = legacyMain.landFn256(x, z);
        const tempCell = legacyMain.tempFn256(x, z);
        let b = this.ops.temperatureToBiome(tempCell, x * 256, z * 256, 256);
        if (landCell !== C().LAND && landCell !== 99) b = landCell === C().DEEP_OCEAN ? 'Deep Ocean' : 'Ocean';
        if (this.settings.enableBambooJungleVariant) b = this.ops.bambooJungleVariant(b, x * 256, z * 256, 256);
        return b;
      });

      const zoomBiome = (parentFn, x, z, salt) => this.cached(`biome_zoom_${salt}`, x, z, () => {
        const px = x >> 1;
        const pz = z >> 1;
        const sx = x & 1;
        const sz = z & 1;
        const c00 = parentFn(px, pz);
        if (sx === 0 && sz === 0) return c00;
        const c10 = parentFn(px + 1, pz);
        const c01 = parentFn(px, pz + 1);
        const c11 = parentFn(px + 1, pz + 1);
        const roll = this.ops.random.at2D(x, z, this.ops.seed + salt);
        if (sx === 0 && sz === 1) return roll < 0.5 ? c00 : c01;
        if (sx === 1 && sz === 0) return roll < 0.5 ? c00 : c10;
        if (c10 === c01 && c01 === c11) return c10;
        if (c00 === c10 && c00 === c01) return c00;
        return [c00, c10, c01, c11][Math.floor(roll * 4)];
      });

      const biome128 = (x, z) => zoomBiome(biome256, x, z, 2001);
      const biome64Pre = (x, z) => zoomBiome(biome128, x, z, 2002);
      const biome64 = (x, z) => this.cached('biome_64', x, z, () => {
        let b = biome64Pre(x, z);
        b = this.ops.biomeEdge(b, x * 64, z * 64, 64);
        b = this.ops.regionHills(b, hillNoise, x * 64, z * 64, 64);
        if (this.settings.enableSunflowerPlainsVariant) b = this.ops.sunflowerPlainsVariant(b, x * 64, z * 64, 64);
        return b;
      });
      const biome32 = (x, z) => zoomBiome(biome64, x, z, 2003);
      const biome16Pre = (x, z) => zoomBiome(biome32, x, z, 2004);
      const biome16 = (x, z) => this.cached('biome_16', x, z, () => this.ops.shore(biome16Pre(x, z), x * 16, z * 16, 16));
      const biome8 = (x, z) => zoomBiome(biome16, x, z, 2005);
      const biome4Pre = (x, z) => zoomBiome(biome8, x, z, 2006);
      const biome4 = (x, z) => this.cached('biome_4', x, z, () => this.ops.smoothBiome(biome4Pre(x, z), x * 4, z * 4, 4));

      return biome4(x4, z4);
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.MainBiomeStack = MainBiomeStack;
})();
