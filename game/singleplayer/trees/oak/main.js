(function () {
  function getOakProfiles() {
    return [window.DefaultOakTree, window.SmallOakTree, window.LargeOakTree].filter(Boolean);
  }

  function resolveOakTreeProfile(treeStyle) {
    if (!treeStyle || treeStyle === 'oak') return window.DefaultOakTree || null;
    return getOakProfiles().find((profile) => profile.style === treeStyle) || null;
  }

  function chooseOakTreeProfile({ wx, wz, hashRand2D }) {
    const roll = hashRand2D(wx, wz, 773);
    if (roll < 0.18 && window.LargeOakTree) return window.LargeOakTree;
    if (roll < 0.52 && window.SmallOakTree) return window.SmallOakTree;
    return window.DefaultOakTree || window.SmallOakTree || window.LargeOakTree || null;
  }

  function getOakTreeLayout(treeStyle, relY) {
    const profile = resolveOakTreeProfile(treeStyle);
    if (!profile?.canopyRadius) return null;
    return {
      radius: profile.canopyRadius(relY),
      trunkOffsets: profile.trunkOffsets || [{ x: 0, z: 0 }],
    };
  }

  function resolveOakPlacementProfile({ biome, wx, wz, hashRand2D }) {
    if (biome === 'Mushroom Fields') return { treeStyle: 'glass_mushroom', trunkHeight: 5 };
    const oakProfile = chooseOakTreeProfile({ wx, wz, hashRand2D });
    if (!oakProfile) return null;
    return {
      treeStyle: oakProfile.style,
      trunkHeight: oakProfile.trunkHeight({ hashRand2D, wx, wz }),
    };
  }

  function createOakTreeDecoration({
    isTreeBiome,
    getTreeSpawnChanceForBiome,
    hasNearbyTreeTrunk,
    chooseJungleTreeProfile,
    canPlaceMinecraftLikeTree,
    placeMinecraftLikeTree,
    seaLevel,
    chunkHeight,
  }) {
    return {
      tryGenerateTreeAtColumn({ data, x, z, wx, wz, biome, isRiver, worldGenSettings, chunkSize, octaveNoise2D, hashRand2D, fallbackTreeCandidates }) {
        if (!isTreeBiome(biome) || isRiver) return false;

        let topY = -1;
        for (let yy = chunkHeight - 2; yy >= 1; yy--) {
          const tidx = x + yy * chunkSize + z * chunkSize * chunkHeight;
          const ttype = data[tidx];
          if (ttype !== 0 && ttype !== 4 && ttype !== 6 && ttype !== 97) {
            topY = yy;
            break;
          }
        }

        const minTreeY = Math.max(seaLevel - 2, 2);
        const maxTreeY = Math.min(chunkHeight - 8, seaLevel + 68);
        if (topY < minTreeY || topY > maxTreeY) return false;

        const topIdx = x + topY * chunkSize + z * chunkSize * chunkHeight;
        const topType = data[topIdx];
        const validGround = topType === 1 || topType === 2 || topType === 3 || topType === 7 || topType === 28;
        if (!validGround) return false;

        const treeNoise = octaveNoise2D(wx, wz, 2, 0.56, 2.0, 0.028, 700, -350) * 0.5 + 0.5;
        const scatter = hashRand2D(wx, wz, 99);
        const density = treeNoise * 0.6 + scatter * 0.4;
        const chance = getTreeSpawnChanceForBiome(biome, topY);
        const clusterBonus = Number(worldGenSettings.treeClusterBonus ?? 0.12);
        const nearbyTree = hasNearbyTreeTrunk(data, x, z, 3);
        const spacingGate = Number(worldGenSettings.treeMinSpacingChance ?? 0.65);
        const spawnRoll = hashRand2D(wx, wz, 431);
        const shouldTrySpawn = (spawnRoll < (chance + density * clusterBonus)) && (!nearbyTree || spawnRoll < spacingGate * 0.75);
        if (!shouldTrySpawn) {
          fallbackTreeCandidates.push({ x, z, topY, wx, wz, biome });
          return false;
        }

        const isJungleForest = biome === 'Jungle Forest';
        const jungleProfile = isJungleForest ? chooseJungleTreeProfile({ topY, wx, wz, seaLevel, hashRand2D }) : null;
        const oakPlacement = !isJungleForest ? resolveOakPlacementProfile({ biome, wx, wz, hashRand2D }) : null;
        const trunkHeight = isJungleForest ? jungleProfile.trunkHeight : oakPlacement?.trunkHeight;
        const treeStyle = isJungleForest ? jungleProfile.style : oakPlacement?.treeStyle;
        if (!treeStyle || !Number.isFinite(trunkHeight)) return false;
        if (!canPlaceMinecraftLikeTree(data, x, z, topY, trunkHeight, treeStyle)) {
          fallbackTreeCandidates.push({ x, z, topY, wx, wz, biome });
          return false;
        }

        if (data[topIdx] === 2) data[topIdx] = 1;
        placeMinecraftLikeTree(data, x, z, topY, trunkHeight, wx, wz, treeStyle);
        return true;
      },
      placeFallbackTree({ data, cx, cz, fallbackTreeCandidates, hashRand2D, chunkSize }) {
        if (!fallbackTreeCandidates.length) return false;
        const pick = Math.floor(hashRand2D(cx, cz, 6083) * fallbackTreeCandidates.length);
        const candidate = fallbackTreeCandidates[Math.max(0, Math.min(fallbackTreeCandidates.length - 1, pick))];
        if (!candidate) return false;

        const { x, z, topY, wx, wz, biome } = candidate;
        const isJungleForest = biome === 'Jungle Forest';
        const jungleProfile = isJungleForest ? chooseJungleTreeProfile({ topY, wx, wz, seaLevel, hashRand2D }) : null;
        const oakPlacement = !isJungleForest ? resolveOakPlacementProfile({ biome, wx, wz, hashRand2D }) : null;
        const trunkHeight = isJungleForest ? jungleProfile.trunkHeight : oakPlacement?.trunkHeight;
        const treeStyle = isJungleForest ? jungleProfile.style : oakPlacement?.treeStyle;
        if (!treeStyle || !Number.isFinite(trunkHeight)) return false;
        if (!canPlaceMinecraftLikeTree(data, x, z, topY, trunkHeight, treeStyle)) return false;

        const topIdx = x + topY * chunkSize + z * chunkSize * chunkHeight;
        if (data[topIdx] === 2) data[topIdx] = 1;
        placeMinecraftLikeTree(data, x, z, topY, trunkHeight, wx, wz, treeStyle);
        return true;
      },
    };
  }

  window.OakTreeGeneration = {
    getOakProfiles,
    resolveOakTreeProfile,
    chooseOakTreeProfile,
    getOakTreeLayout,
    createOakTreeDecoration,
  };
})();
