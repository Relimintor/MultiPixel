(function () {
  const VALID_VILLAGE_BIOMES = new Set([
    'plains',
    'desert',
    'jungle_forest',
    'oak_forest',
    'ocean',
    'snowy_plains'
  ]);

  const DEFAULT_STRUCTURE_REGION_SIZE = 384;
  const DEFAULT_REGION_PADDING = 48;
  const DEFAULT_VILLAGE_CHANCE_PER_REGION = 0.36;
  const DEFAULT_TERRAIN_RULES = {
    minGroundY: 44,
    maxGroundY: 130,
    maxSlopeDelta: 3,
    minFlatRatio: 0.72,
    sampleRadius: 6,
    validSurfaceBlocks: new Set(['grass', 'sand', 'snow', 'dirt', 'stone'])
  };

  const DEFAULT_COLLISION_RULES = {
    maxTerrainCollisionRatio: 0.34,
    maxHeightDelta: 5,
    foundationDepthLimit: 3,
    stiltHeightLimit: 5
  };

  const VILLAGE_STYLE_BY_BIOME = {
    plains: 'plains_village',
    desert: 'pyramid_village',
    oak_forest: 'plains_village',
    jungle_forest: 'tree_village',
    snowy_plains: 'igloo_village',
    ocean: 'coral_village'
  };

  const VILLAGE_STYLE_PROFILES = {
    plains_village: {
      label: 'Plains village',
      buildingMaterials: ['oak_planks', 'cobblestone', 'glass'],
      roofShapes: ['gable', 'hip'],
      pathBlocks: ['dirt_path', 'gravel'],
      decorativeElements: ['lantern', 'fence', 'flowers']
    },
    pyramid_village: {
      label: 'Pyramid village',
      buildingMaterials: ['sandstone', 'cut_sandstone', 'smooth_sandstone'],
      roofShapes: ['flat', 'stepped_pyramid'],
      pathBlocks: ['sandstone_tiles', 'packed_sand'],
      decorativeElements: ['banner', 'palm_planter', 'chiseled_sandstone']
    },
    tree_village: {
      label: 'Tree village',
      buildingMaterials: ['jungle_planks', 'bamboo', 'leaf_blocks'],
      roofShapes: ['canopy', 'curved_thatch'],
      pathBlocks: ['jungle_roots', 'wood_walkway'],
      decorativeElements: ['vines', 'hanging_lanterns', 'totems']
    },
    igloo_village: {
      label: 'Igloo village',
      buildingMaterials: ['snow_block', 'packed_ice', 'spruce_planks'],
      roofShapes: ['dome', 'half_dome'],
      pathBlocks: ['packed_snow_path', 'ice_brick'],
      decorativeElements: ['ice_lantern', 'fur_banner', 'snow_pile']
    },
    coral_village: {
      label: 'Coral village',
      buildingMaterials: ['coral_block', 'prismarine', 'sea_lantern'],
      roofShapes: ['shell_dome', 'reef_arch'],
      pathBlocks: ['coral_tiles', 'wet_stone'],
      decorativeElements: ['kelp_garden', 'bubble_column', 'coral_fan']
    }
  };

  const BASE_TEMPLATE_SET = {
    central_well: {
      category: 'well',
      footprint: { width: 7, depth: 7 },
      connectors: [
        { x: 0, z: -4, dir: 'N', type: 'path' },
        { x: 4, z: 0, dir: 'E', type: 'path' },
        { x: 0, z: 4, dir: 'S', type: 'path' },
        { x: -4, z: 0, dir: 'W', type: 'path' }
      ],
      weight: 1
    },
    street_straight: {
      category: 'street',
      footprint: { width: 3, depth: 9 },
      connectors: [
        { x: 0, z: -5, dir: 'N', type: 'path' },
        { x: 0, z: 5, dir: 'S', type: 'path' }
      ],
      weight: 6
    },
    house_small: {
      category: 'house',
      footprint: { width: 7, depth: 7 },
      connectors: [{ x: 0, z: -4, dir: 'N', type: 'path' }],
      weight: 5
    },
    farm_patch: {
      category: 'farm',
      footprint: { width: 9, depth: 7 },
      connectors: [{ x: 0, z: -4, dir: 'N', type: 'path' }],
      weight: 3
    },
    church_small: {
      category: 'church',
      footprint: { width: 9, depth: 11 },
      connectors: [{ x: 0, z: -6, dir: 'N', type: 'path' }],
      weight: 2
    }
  };

  const STYLE_TEMPLATE_OVERRIDES = {
    igloo_village: {
      igloo_house: {
        category: 'house',
        footprint: { width: 9, depth: 9 },
        connectors: [{ x: 0, z: -5, dir: 'N', type: 'path' }],
        weight: 4,
        templatePath: './structures/villages/snowy_plains/igloo.json'
      }
    }
  };

  const DEFAULT_LOOT_TABLE = [
    { item: 'bread', min: 1, max: 5, weight: 10 },
    { item: 'apple', min: 1, max: 4, weight: 9 },
    { item: 'iron_ingot', min: 1, max: 3, weight: 5 },
    { item: 'emerald', min: 1, max: 2, weight: 3 },
    { item: 'torch', min: 2, max: 8, weight: 8 },
    { item: 'coal', min: 2, max: 6, weight: 7 }
  ];

  const DIR_TO_VEC = {
    N: { x: 0, z: -1 },
    E: { x: 1, z: 0 },
    S: { x: 0, z: 1 },
    W: { x: -1, z: 0 }
  };

  const DIR_ORDER = ['N', 'E', 'S', 'W'];

  function normalizeBiomeName(biomeName) {
    if (typeof biomeName !== 'string') return '';
    return biomeName.trim().toLowerCase();
  }

  function isVillageBiome(biomeName) {
    const normalized = normalizeBiomeName(biomeName);
    return VALID_VILLAGE_BIOMES.has(normalized);
  }

  function canGenerateVillageAt(candidate) {
    const biomeName = typeof candidate === 'string' ? candidate : candidate?.biome;
    return isVillageBiome(biomeName);
  }

  function getStructureRegionForPosition(worldX, worldZ, regionSize = DEFAULT_STRUCTURE_REGION_SIZE) {
    const size = Math.max(1, Math.floor(regionSize));
    return {
      regionX: Math.floor(worldX / size),
      regionZ: Math.floor(worldZ / size),
      regionSize: size
    };
  }

  function shouldAllowVillageInRegion({ regionX, regionZ, hashRand2D, chance = DEFAULT_VILLAGE_CHANCE_PER_REGION }) {
    if (typeof hashRand2D !== 'function') return false;
    const roll = hashRand2D(regionX * 31 + 17, regionZ * 31 - 23, 11021);
    return roll < chance;
  }

  function getVillageCandidateInRegion({
    regionX,
    regionZ,
    hashRand2D,
    regionSize = DEFAULT_STRUCTURE_REGION_SIZE,
    regionPadding = DEFAULT_REGION_PADDING
  }) {
    if (typeof hashRand2D !== 'function') return null;

    const size = Math.max(1, Math.floor(regionSize));
    const maxPadding = Math.max(0, Math.floor((size - 1) / 2));
    const padding = Math.min(maxPadding, Math.max(0, Math.floor(regionPadding)));
    const minOffset = padding;
    const maxOffset = size - padding - 1;
    const offsetSpan = Math.max(1, maxOffset - minOffset + 1);

    const offsetX = minOffset + Math.floor(hashRand2D(regionX * 47 + 5, regionZ * 47 + 13, 11022) * offsetSpan);
    const offsetZ = minOffset + Math.floor(hashRand2D(regionX * 47 + 29, regionZ * 47 + 37, 11023) * offsetSpan);

    return {
      worldX: regionX * size + offsetX,
      worldZ: regionZ * size + offsetZ,
      regionX,
      regionZ,
      regionSize: size
    };
  }

  function getVillageRegionCandidate({
    regionX,
    regionZ,
    hashRand2D,
    getBiomeAt,
    chance = DEFAULT_VILLAGE_CHANCE_PER_REGION,
    regionSize = DEFAULT_STRUCTURE_REGION_SIZE,
    regionPadding = DEFAULT_REGION_PADDING
  }) {
    if (!shouldAllowVillageInRegion({ regionX, regionZ, hashRand2D, chance })) {
      return { allowed: false, reason: 'region_roll_failed' };
    }

    const candidate = getVillageCandidateInRegion({ regionX, regionZ, hashRand2D, regionSize, regionPadding });
    if (!candidate) return { allowed: false, reason: 'missing_hash' };

    const biomeName = typeof getBiomeAt === 'function'
      ? getBiomeAt(candidate.worldX, candidate.worldZ)
      : '';

    if (!canGenerateVillageAt({ biome: biomeName })) {
      return {
        allowed: false,
        reason: 'invalid_biome',
        biome: biomeName,
        candidate
      };
    }

    return {
      allowed: true,
      biome: normalizeBiomeName(biomeName),
      candidate
    };
  }

  function getVillageStyleForBiome(biomeName) {
    const normalized = normalizeBiomeName(biomeName);
    return VILLAGE_STYLE_BY_BIOME[normalized] || null;
  }

  function getVillageStyleProfile(styleName) {
    if (typeof styleName !== 'string') return null;
    const profile = VILLAGE_STYLE_PROFILES[styleName];
    return profile ? { style: styleName, ...profile } : null;
  }

  function selectVillageStyle(candidate) {
    const biomeName = typeof candidate === 'string' ? candidate : candidate?.biome;
    const style = getVillageStyleForBiome(biomeName);
    if (!style) return { ok: false, reason: 'unsupported_village_style', biome: biomeName };
    return {
      ok: true,
      biome: normalizeBiomeName(biomeName),
      style,
      profile: getVillageStyleProfile(style)
    };
  }

  function getVillageCenterTemplatePath(biomeName) {
    const biome = normalizeBiomeName(biomeName);
    if (!biome) return null;
    return `./structures/villages/${biome}/well.json`;
  }

  function normalizeSurfaceBlockName(blockName) {
    if (typeof blockName !== 'string') return '';
    return blockName.trim().toLowerCase();
  }

  function isValidVillageSurfaceBlock(blockName, validSurfaceBlocks = DEFAULT_TERRAIN_RULES.validSurfaceBlocks) {
    return validSurfaceBlocks.has(normalizeSurfaceBlockName(blockName));
  }

  function evaluateTerrainSuitability({
    candidate,
    getGroundHeightAt,
    getSurfaceBlockAt,
    rules = {}
  }) {
    if (!candidate || typeof getGroundHeightAt !== 'function' || typeof getSurfaceBlockAt !== 'function') {
      return { ok: false, reason: 'missing_terrain_providers' };
    }

    const mergedRules = {
      ...DEFAULT_TERRAIN_RULES,
      ...rules,
      validSurfaceBlocks: rules.validSurfaceBlocks || DEFAULT_TERRAIN_RULES.validSurfaceBlocks
    };

    const centerHeight = getGroundHeightAt(candidate.worldX, candidate.worldZ);
    if (!Number.isFinite(centerHeight)) return { ok: false, reason: 'invalid_height_sample' };
    if (centerHeight < mergedRules.minGroundY || centerHeight > mergedRules.maxGroundY) {
      return { ok: false, reason: 'ground_height_out_of_range', centerHeight };
    }

    const centerSurface = getSurfaceBlockAt(candidate.worldX, candidate.worldZ);
    if (!isValidVillageSurfaceBlock(centerSurface, mergedRules.validSurfaceBlocks)) {
      return { ok: false, reason: 'invalid_surface_block', centerSurface };
    }

    let totalSamples = 0;
    let flatSamples = 0;
    let minHeight = centerHeight;
    let maxHeight = centerHeight;

    const radius = Math.max(1, Math.floor(mergedRules.sampleRadius));
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const sampleX = candidate.worldX + dx;
        const sampleZ = candidate.worldZ + dz;
        const sampleHeight = getGroundHeightAt(sampleX, sampleZ);
        if (!Number.isFinite(sampleHeight)) {
          return { ok: false, reason: 'invalid_height_sample' };
        }

        const sampleSurface = getSurfaceBlockAt(sampleX, sampleZ);
        if (!isValidVillageSurfaceBlock(sampleSurface, mergedRules.validSurfaceBlocks)) {
          return { ok: false, reason: 'invalid_surface_block', sampleSurface };
        }

        totalSamples++;
        minHeight = Math.min(minHeight, sampleHeight);
        maxHeight = Math.max(maxHeight, sampleHeight);
        if (Math.abs(sampleHeight - centerHeight) <= mergedRules.maxSlopeDelta) flatSamples++;
      }
    }

    const slopeDelta = maxHeight - minHeight;
    if (slopeDelta > mergedRules.maxSlopeDelta) {
      return { ok: false, reason: 'terrain_too_steep', slopeDelta };
    }

    const flatRatio = totalSamples > 0 ? flatSamples / totalSamples : 0;
    if (flatRatio < mergedRules.minFlatRatio) {
      return { ok: false, reason: 'insufficient_flat_space', flatRatio };
    }

    return {
      ok: true,
      centerHeight,
      slopeDelta,
      flatRatio
    };
  }

  function rotateDirection(dir, quarterTurns) {
    const idx = DIR_ORDER.indexOf(dir);
    if (idx < 0) return dir;
    return DIR_ORDER[(idx + quarterTurns + 4) % 4];
  }

  function oppositeDirection(dir) {
    return rotateDirection(dir, 2);
  }

  function transformLocalPoint(point, transform) {
    let x = point.x;
    let z = point.z;
    if (transform.mirror) x = -x;
    for (let i = 0; i < transform.rotation; i++) {
      const nx = -z;
      const nz = x;
      x = nx;
      z = nz;
    }
    return { x, z };
  }

  function transformDirection(dir, transform) {
    let out = dir;
    if (transform.mirror) {
      if (out === 'E') out = 'W';
      else if (out === 'W') out = 'E';
    }
    return rotateDirection(out, transform.rotation);
  }

  function getRandomTransform(hashRand2D, seedX, seedZ, salt) {
    const rollRot = Math.floor(hashRand2D(seedX * 13 + salt, seedZ * 17 - salt, 22000 + salt) * 4) % 4;
    const rollMirror = hashRand2D(seedX * 29 - salt, seedZ * 31 + salt, 22100 + salt) > 0.5;
    return { rotation: rollRot, mirror: rollMirror };
  }

  function getTemplateSetForStyle(style) {
    return {
      ...BASE_TEMPLATE_SET,
      ...(STYLE_TEMPLATE_OVERRIDES[style] || {})
    };
  }

  function getTemplateChoices(templateSet, weightsByCategory) {
    return Object.entries(templateSet)
      .filter(([, tpl]) => tpl.category !== 'well')
      .map(([id, tpl]) => ({
        id,
        ...tpl,
        computedWeight: (tpl.weight || 1) * ((weightsByCategory && weightsByCategory[tpl.category]) || 1)
      }));
  }

  function weightedPick(items, hashRand2D, seedX, seedZ, salt) {
    const total = items.reduce((sum, item) => sum + Math.max(0.0001, item.computedWeight || 1), 0);
    let roll = hashRand2D(seedX + salt * 3, seedZ - salt * 5, 22200 + salt) * total;
    for (const item of items) {
      roll -= Math.max(0.0001, item.computedWeight || 1);
      if (roll <= 0) return item;
    }
    return items[items.length - 1] || null;
  }

  function getFootprintCells(centerX, centerZ, footprint) {
    const halfW = Math.floor((footprint.width || 1) / 2);
    const halfD = Math.floor((footprint.depth || 1) / 2);
    const cells = [];
    for (let x = centerX - halfW; x <= centerX + halfW; x++) {
      for (let z = centerZ - halfD; z <= centerZ + halfD; z++) {
        cells.push(`${x},${z}`);
      }
    }
    return cells;
  }

  function getBoundingBox2D(centerX, centerZ, footprint) {
    const halfW = Math.floor((footprint.width || 1) / 2);
    const halfD = Math.floor((footprint.depth || 1) / 2);
    return {
      minX: centerX - halfW,
      maxX: centerX + halfW,
      minZ: centerZ - halfD,
      maxZ: centerZ + halfD
    };
  }

  function boxesOverlap2D(a, b) {
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxZ < b.minZ || a.minZ > b.maxZ);
  }

  function resolveTerrainPlacement({ worldX, worldZ, footprint, sampleTerrainHeight, collisionRules = {} }) {
    if (typeof sampleTerrainHeight !== 'function') {
      return { ok: true, baseY: 0, elevationMode: 'none', terrainCollisionRatio: 0, heightDelta: 0 };
    }

    const rules = { ...DEFAULT_COLLISION_RULES, ...collisionRules };
    const box = getBoundingBox2D(worldX, worldZ, footprint);
    const heights = [];
    for (let x = box.minX; x <= box.maxX; x++) {
      for (let z = box.minZ; z <= box.maxZ; z++) {
        const h = sampleTerrainHeight(x, z);
        if (!Number.isFinite(h)) return { ok: false, reason: 'invalid_terrain_height' };
        heights.push(h);
      }
    }

    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    const heightDelta = maxH - minH;
    if (heightDelta > rules.maxHeightDelta) {
      return { ok: false, reason: 'terrain_collision_excessive', heightDelta };
    }

    const baseY = Math.round(heights.reduce((a, b) => a + b, 0) / heights.length);
    let collisionCount = 0;
    let fillNeeded = 0;
    let stiltNeeded = 0;
    for (const h of heights) {
      if (h > baseY) collisionCount++;
      if (h < baseY) fillNeeded = Math.max(fillNeeded, baseY - h);
      if (h > baseY) stiltNeeded = Math.max(stiltNeeded, h - baseY);
    }

    const collisionRatio = heights.length > 0 ? collisionCount / heights.length : 0;
    if (collisionRatio > rules.maxTerrainCollisionRatio) {
      return { ok: false, reason: 'terrain_collision_excessive', terrainCollisionRatio: collisionRatio };
    }

    const needsFoundation = fillNeeded > 0;
    const needsStilts = stiltNeeded > 0;
    if (needsFoundation && fillNeeded > rules.foundationDepthLimit) {
      return { ok: false, reason: 'foundation_too_deep', foundationDepth: fillNeeded };
    }
    if (needsStilts && stiltNeeded > rules.stiltHeightLimit) {
      return { ok: false, reason: 'stilts_too_tall', stiltHeight: stiltNeeded };
    }

    return {
      ok: true,
      baseY,
      elevationMode: needsFoundation ? 'foundation' : (needsStilts ? 'stilts' : 'none'),
      terrainCollisionRatio: collisionRatio,
      heightDelta,
      foundationDepth: fillNeeded,
      stiltHeight: stiltNeeded
    };
  }

  function getTransformedConnectors(piece) {
    const connectors = piece.connectors || [];
    return connectors.map((c) => {
      const pt = transformLocalPoint({ x: c.x, z: c.z }, piece.transform);
      return {
        x: piece.worldX + pt.x,
        z: piece.worldZ + pt.z,
        dir: transformDirection(c.dir, piece.transform),
        type: c.type || 'path'
      };
    });
  }

  function connectionKey(conn) {
    return `${conn.x},${conn.z},${conn.dir},${conn.type}`;
  }

  function generateVillageLayout({
    seedX,
    seedZ,
    biome,
    origin,
    hashRand2D,
    maxStructures = 26,
    maxPlacementAttempts = 220,
    validateArea,
    sampleTerrainHeight,
    collisionRules
  }) {
    if (typeof hashRand2D !== 'function') return { ok: false, reason: 'missing_hash' };
    if (!origin || !Number.isFinite(origin.worldX) || !Number.isFinite(origin.worldZ)) return { ok: false, reason: 'missing_origin' };
    if (!canGenerateVillageAt({ biome })) return { ok: false, reason: 'invalid_biome' };

    const styleSelection = selectVillageStyle({ biome });
    if (!styleSelection.ok) return { ok: false, reason: styleSelection.reason };

    const templateSet = getTemplateSetForStyle(styleSelection.style);
    const centerTemplateId = 'central_well';
    const centerTemplate = templateSet[centerTemplateId];
    if (!centerTemplate) return { ok: false, reason: 'missing_center_template' };

    const centerPiece = {
      id: centerTemplateId,
      category: centerTemplate.category,
      templatePath: getVillageCenterTemplatePath(biome),
      worldX: origin.worldX,
      worldZ: origin.worldZ,
      transform: { rotation: 0, mirror: false },
      footprint: centerTemplate.footprint,
      connectors: centerTemplate.connectors
    };

    const occupied = new Set();
    for (const c of getFootprintCells(centerPiece.worldX, centerPiece.worldZ, centerPiece.footprint)) occupied.add(c);

    const placedBoxes = [getBoundingBox2D(centerPiece.worldX, centerPiece.worldZ, centerPiece.footprint)];
    const centerPlacement = resolveTerrainPlacement({
      worldX: centerPiece.worldX,
      worldZ: centerPiece.worldZ,
      footprint: centerPiece.footprint,
      sampleTerrainHeight,
      collisionRules
    });
    if (!centerPlacement.ok) return { ok: false, reason: centerPlacement.reason || 'center_terrain_invalid' };
    centerPiece.baseY = centerPlacement.baseY;
    centerPiece.elevationMode = centerPlacement.elevationMode;

    const structures = [centerPiece];
    const openConnections = getTransformedConnectors(centerPiece);
    const usedConnectionSet = new Set();

    let attempts = 0;
    const choices = getTemplateChoices(templateSet, styleSelection.profile?.weightsByCategory);

    while (openConnections.length > 0 && structures.length < maxStructures && attempts < maxPlacementAttempts) {
      attempts++;
      const openIdx = Math.floor(hashRand2D(seedX + attempts * 11, seedZ - attempts * 7, 22300) * openConnections.length);
      const openConn = openConnections.splice(Math.max(0, Math.min(openConnections.length - 1, openIdx)), 1)[0];
      if (!openConn) break;
      if (usedConnectionSet.has(connectionKey(openConn))) continue;

      const picked = weightedPick(choices, hashRand2D, seedX, seedZ, attempts);
      if (!picked) break;

      const transform = getRandomTransform(hashRand2D, seedX + openConn.x, seedZ + openConn.z, attempts);
      const transformedPickedConnectors = picked.connectors.map((c) => {
        const p = transformLocalPoint({ x: c.x, z: c.z }, transform);
        return {
          localX: p.x,
          localZ: p.z,
          dir: transformDirection(c.dir, transform),
          type: c.type || 'path'
        };
      });

      const attachOptions = transformedPickedConnectors.filter((c) => c.type === openConn.type && c.dir === oppositeDirection(openConn.dir));
      if (attachOptions.length === 0) continue;
      const attach = attachOptions[Math.floor(hashRand2D(seedX + attempts * 3, seedZ - attempts * 13, 22400) * attachOptions.length)];
      const worldX = openConn.x - attach.localX;
      const worldZ = openConn.z - attach.localZ;

      const footprintCells = getFootprintCells(worldX, worldZ, picked.footprint);
      const candidateBox = getBoundingBox2D(worldX, worldZ, picked.footprint);
      const overlaps = footprintCells.some((cell) => occupied.has(cell)) || placedBoxes.some((box) => boxesOverlap2D(box, candidateBox));
      if (overlaps) continue;
      if (typeof validateArea === 'function' && !validateArea({ worldX, worldZ, footprint: picked.footprint, category: picked.category })) {
        continue;
      }

      const terrainPlacement = resolveTerrainPlacement({
        worldX,
        worldZ,
        footprint: picked.footprint,
        sampleTerrainHeight,
        collisionRules
      });
      if (!terrainPlacement.ok) continue;

      const piece = {
        id: picked.id,
        category: picked.category,
        templatePath: picked.templatePath || null,
        worldX,
        worldZ,
        transform,
        footprint: picked.footprint,
        connectors: picked.connectors,
        baseY: terrainPlacement.baseY,
        elevationMode: terrainPlacement.elevationMode,
        terrainCollisionRatio: terrainPlacement.terrainCollisionRatio,
        terrainHeightDelta: terrainPlacement.heightDelta
      };

      for (const cell of footprintCells) occupied.add(cell);
      placedBoxes.push(candidateBox);
      structures.push(piece);
      usedConnectionSet.add(connectionKey(openConn));

      const newConnectors = getTransformedConnectors(piece)
        .filter((c) => !(c.x === openConn.x && c.z === openConn.z && c.dir === oppositeDirection(openConn.dir)));
      openConnections.push(...newConnectors);
    }

    let stopReason = 'open_connections_exhausted';
    if (structures.length >= maxStructures) stopReason = 'max_structures_reached';
    else if (attempts >= maxPlacementAttempts) stopReason = 'space_exhausted';
    else if (openConnections.length === 0) stopReason = 'no_valid_connections';

    return {
      ok: true,
      biome: normalizeBiomeName(biome),
      style: styleSelection.style,
      styleProfile: styleSelection.profile,
      structures,
      stats: {
        attempts,
        structureCount: structures.length,
        stopReason
      }
    };
  }


  function chooseLootEntry(hashRand2D, seedX, seedZ, salt, lootTable = DEFAULT_LOOT_TABLE) {
    const totalWeight = lootTable.reduce((sum, e) => sum + Math.max(0.0001, e.weight || 1), 0);
    let roll = hashRand2D(seedX + salt * 5, seedZ - salt * 7, 33000 + salt) * totalWeight;
    for (const entry of lootTable) {
      roll -= Math.max(0.0001, entry.weight || 1);
      if (roll <= 0) return entry;
    }
    return lootTable[lootTable.length - 1] || null;
  }

  function generateChestLoot({ hashRand2D, seedX, seedZ, chestIndex, lootTable = DEFAULT_LOOT_TABLE, slots = 3 }) {
    if (typeof hashRand2D !== 'function') return [];
    const out = [];
    for (let i = 0; i < slots; i++) {
      const entry = chooseLootEntry(hashRand2D, seedX + chestIndex * 13, seedZ - chestIndex * 11, i + 1, lootTable);
      if (!entry) continue;
      const amountRoll = hashRand2D(seedX + chestIndex * 17, seedZ - chestIndex * 19, 33100 + i);
      const minAmount = Math.max(1, entry.min || 1);
      const maxAmount = Math.max(minAmount, entry.max || minAmount);
      const amount = minAmount + Math.floor(amountRoll * (maxAmount - minAmount + 1));
      out.push({ item: entry.item, amount });
    }
    return out;
  }

  function getPathCellsFromStructures(structures) {
    const cells = new Map();
    for (const piece of structures || []) {
      const connectors = getTransformedConnectors(piece).filter((c) => c.type === 'path');
      for (const c of connectors) {
        const k = `${c.x},${c.z}`;
        if (!cells.has(k)) cells.set(k, { x: c.x, z: c.z });
      }
    }
    return Array.from(cells.values());
  }

  function getVillageChestAnchors(structures) {
    const anchors = [];
    for (const piece of structures || []) {
      if (piece.category === 'house' || piece.category === 'church') {
        anchors.push({ x: piece.worldX, z: piece.worldZ, pieceId: piece.id, category: piece.category });
      }
    }
    return anchors;
  }

  function getVillageTorchAnchors(pathCells, hashRand2D, seedX, seedZ) {
    const torches = [];
    for (let i = 0; i < pathCells.length; i++) {
      const p = pathCells[i];
      const roll = hashRand2D(seedX + p.x * 3, seedZ + p.z * 5, 33200 + i);
      if (roll < 0.22) torches.push({ x: p.x, z: p.z });
    }
    return torches;
  }

  function finalizeVillageLayout({ layout, hashRand2D, seedX, seedZ, pathBlock = 'cobblestone', lootTable = DEFAULT_LOOT_TABLE }) {
    if (!layout || !layout.ok) return { ok: false, reason: 'invalid_layout' };
    if (typeof hashRand2D !== 'function') return { ok: false, reason: 'missing_hash' };

    const pathCells = getPathCellsFromStructures(layout.structures);
    const chestAnchors = getVillageChestAnchors(layout.structures);
    const chests = chestAnchors.map((anchor, i) => ({
      ...anchor,
      loot: generateChestLoot({ hashRand2D, seedX, seedZ, chestIndex: i, lootTable })
    }));
    const torches = getVillageTorchAnchors(pathCells, hashRand2D, seedX, seedZ);

    return {
      ok: true,
      finalized: true,
      pathBlock,
      pathReplacements: pathCells.map((p) => ({ x: p.x, z: p.z, block: pathBlock })),
      chests,
      torches,
      stats: {
        pathCount: pathCells.length,
        chestCount: chests.length,
        torchCount: torches.length
      }
    };
  }

  window.VillageGeneration = {
    VALID_VILLAGE_BIOMES: Array.from(VALID_VILLAGE_BIOMES),
    DEFAULT_STRUCTURE_REGION_SIZE,
    DEFAULT_REGION_PADDING,
    DEFAULT_VILLAGE_CHANCE_PER_REGION,
    DEFAULT_TERRAIN_RULES,
    DEFAULT_COLLISION_RULES,
    VILLAGE_STYLE_BY_BIOME,
    VILLAGE_STYLE_PROFILES,
    BASE_TEMPLATE_SET,
    STYLE_TEMPLATE_OVERRIDES,
    DEFAULT_LOOT_TABLE,
    normalizeBiomeName,
    isVillageBiome,
    canGenerateVillageAt,
    getStructureRegionForPosition,
    shouldAllowVillageInRegion,
    getVillageCandidateInRegion,
    getVillageRegionCandidate,
    getVillageStyleForBiome,
    getVillageStyleProfile,
    selectVillageStyle,
    getVillageCenterTemplatePath,
    normalizeSurfaceBlockName,
    isValidVillageSurfaceBlock,
    evaluateTerrainSuitability,
    getBoundingBox2D,
    boxesOverlap2D,
    resolveTerrainPlacement,
    chooseLootEntry,
    generateChestLoot,
    getPathCellsFromStructures,
    getVillageChestAnchors,
    getVillageTorchAnchors,
    finalizeVillageLayout,
    generateVillageLayout
  };
})();
