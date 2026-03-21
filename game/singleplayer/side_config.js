(function () {
  const REPO_BASE_PREFIX = window.SingleplayerConfig?.REPO_BASE_PREFIX || '/MultiPixel';
  const ASSET_BASE_PATH = `${REPO_BASE_PREFIX}/game/singleplayer/assets`;
  const fallbackTexturePath = 'textures/Fallback.png';

  const flowerDefinitions = [
    { name: 'Dandelion', textureKey: 'FLOWER_DANDELION', texturePath: 'textures/flowers/dandelion.png', color: 0xf2d84b, spawnBiomes: ['Plains', 'Forest'], dyeId: 149 },
    { name: 'Poppy', textureKey: 'FLOWER_POPPY', texturePath: 'textures/flowers/poppy.png', color: 0xd94a4a, spawnBiomes: ['Plains', 'Forest'], dyeId: 148 },
    { name: 'Blue Orchid', textureKey: 'FLOWER_BLUE_ORCHID', texturePath: 'textures/flowers/blue_orchid.png', color: 0x6db7ff, spawnBiomes: ['Plains'], dyeId: 150 },
    { name: 'Allium', textureKey: 'FLOWER_ALLIUM', texturePath: 'textures/flowers/allium.png', color: 0xc98cff, spawnBiomes: ['Plains', 'Forest'], dyeId: 153 },
    { name: 'Azure Bluet', textureKey: 'FLOWER_AZURE_BLUET', texturePath: 'textures/flowers/azure_bluet.png', color: 0xe9eef7, spawnBiomes: ['Plains'], dyeId: 147 },
    { name: 'Oxeye Daisy', textureKey: 'FLOWER_OXEYE_DAISY', texturePath: 'textures/flowers/oxeye_daisy.png', color: 0xf4f4e8, spawnBiomes: ['Plains', 'Forest'], dyeId: 147 },
    { name: 'Cornflower', textureKey: 'FLOWER_CORNFLOWER', texturePath: 'textures/flowers/cornflower.png', color: 0x4d7cff, spawnBiomes: ['Plains'], dyeId: 150 },
    { name: 'Lily of the Valley', textureKey: 'FLOWER_LILY_OF_THE_VALLEY', texturePath: 'textures/flowers/lily_of_the_valley.png', color: 0xf2f7ea, spawnBiomes: ['Plains', 'Forest'], dyeId: 147 },
    { name: 'Orange Tulip', textureKey: 'FLOWER_ORANGE_TULIP', texturePath: 'textures/flowers/orange_tulip.png', color: 0xf08c3c, spawnBiomes: ['Plains'], dyeId: 151 },
    { name: 'Pink Tulip', textureKey: 'FLOWER_PINK_TULIP', texturePath: 'textures/flowers/pink_tulip.png', color: 0xf29bc1, spawnBiomes: ['Plains'], dyeId: 152 },
    { name: 'Red Tulip', textureKey: 'FLOWER_RED_TULIP', texturePath: 'textures/flowers/red_tulip.png', color: 0xdb4c4c, spawnBiomes: ['Plains', 'Forest'], dyeId: 148 },
    { name: 'White Tulip', textureKey: 'FLOWER_WHITE_TULIP', texturePath: 'textures/flowers/white_tulip.png', color: 0xf3f0e8, spawnBiomes: ['Plains'], dyeId: 147 },
  ];

  const dyeDefinitions = [
    { id: 57, name: 'Black Dye', color: 0x1c1c1c, glassBlockId: 79 },
    { id: 58, name: 'Green Dye', color: 0x4d8b45, glassBlockId: 80 },
    { id: 147, name: 'White Dye', color: 0xf3f0e8, glassBlockId: 160 },
    { id: 148, name: 'Red Dye', color: 0xd94a4a, glassBlockId: 161 },
    { id: 149, name: 'Yellow Dye', color: 0xf2d84b, glassBlockId: 162 },
    { id: 150, name: 'Blue Dye', color: 0x4d7cff, glassBlockId: 163 },
    { id: 151, name: 'Orange Dye', color: 0xf08c3c, glassBlockId: 164 },
    { id: 152, name: 'Pink Dye', color: 0xf29bc1, glassBlockId: 165 },
    { id: 153, name: 'Purple Dye', color: 0xc98cff, glassBlockId: 166 },
    { id: 154, name: 'Light Green Dye', color: 0xa9d98f, glassBlockId: 167 },
    { id: 155, name: 'Cyan Dye', color: 0x5abcc5, glassBlockId: 168 },
    { id: 156, name: 'Light Gray Dye', color: 0xbfc3c9, glassBlockId: 169 },
    { id: 157, name: 'Magenta Dye', color: 0xd66fe3, glassBlockId: 170 },
  ];

  const dyeBlockMaterials = Object.fromEntries(
    dyeDefinitions
      .filter((dye) => dye.id > 146)
      .map((dye) => [
        dye.id,
        {
          name: dye.name,
          id: dye.id,
          textured: false,
          color: dye.color,
        },
      ])
  );

  const dyedGlassDefinitions = dyeDefinitions.map((dye) => ({
    id: dye.glassBlockId,
    name: `${dye.name.replace(/ Dye$/, '')} Glass`,
    dyeId: dye.id,
    color: dye.color,
    textured: dye.glassBlockId === 79 || dye.glassBlockId === 80,
    textureKey: dye.glassBlockId === 79 ? 'BLACK_STAINED_GLASS' : (dye.glassBlockId === 80 ? 'GREEN_STAINED_GLASS' : null),
  }));

  const dyedGlassBlockMaterials = Object.fromEntries(
    dyedGlassDefinitions
      .filter((glass) => glass.id !== 79 && glass.id !== 80)
      .map((glass) => [
        glass.id,
        {
          name: glass.name,
          id: glass.id,
          textured: false,
          color: glass.color,
          transparent: true,
          opacity: 0.8,
        },
      ])
  );

  const dyeMixRecipes = [
    { outputId: 151, ingredientIds: [148, 149] },
    { outputId: 152, ingredientIds: [148, 147] },
    { outputId: 153, ingredientIds: [150, 152] },
    { outputId: 154, ingredientIds: [58, 147] },
    { outputId: 155, ingredientIds: [150, 58] },
    { outputId: 156, ingredientIds: [57, 147] },
    { outputId: 157, ingredientIds: [153, 152] },
    { outputId: 58, ingredientIds: [150, 148] },
  ];

  const FIRST_FLOWER_ID = 134;
  const flowerBlockMaterials = {};
  const flowerAssetFilepaths = {};
  const flowerIds = [];

  flowerDefinitions.forEach((flower, index) => {
    const id = FIRST_FLOWER_ID + index;
    flowerIds.push(id);
    flowerAssetFilepaths[flower.textureKey] = `${ASSET_BASE_PATH}/${flower.texturePath || fallbackTexturePath}`;
    flowerBlockMaterials[id] = {
      name: flower.name,
      id,
      textured: true,
      textureKey: flower.textureKey,
      transparent: true,
      opacity: 1,
      alphaCutout: true,
      renderAs: 'cross',
      placeable: true,
      color: flower.color,
      spawnBiomes: flower.spawnBiomes.slice(),
    };
  });

  const VINE_ID = FIRST_FLOWER_ID + flowerDefinitions.length;
  const vineDefinition = {
    name: 'Vines',
    id: VINE_ID,
    textureKey: 'VINES',
    texturePath: 'textures/vines.png',
    color: 0x4d8b45,
    spawnBiomes: ['Forest', 'Jungle Forest'],
    renderAs: 'plane',
  };

  const sideBlockMaterials = {
    ...flowerBlockMaterials,
    ...dyeBlockMaterials,
    ...dyedGlassBlockMaterials,
    [VINE_ID]: {
      name: vineDefinition.name,
      id: vineDefinition.id,
      textured: true,
      textureKey: vineDefinition.textureKey,
      transparent: true,
      opacity: 1,
      alphaCutout: true,
      renderAs: vineDefinition.renderAs,
      placeable: true,
      color: vineDefinition.color,
      spawnBiomes: vineDefinition.spawnBiomes.slice(),
    },
  };

  const sideAssetFilepaths = {
    ...flowerAssetFilepaths,
    [vineDefinition.textureKey]: `${ASSET_BASE_PATH}/${vineDefinition.texturePath || fallbackTexturePath}`,
  };

  const flowerSpawnConfig = {
    Plains: flowerIds.slice(),
    Forest: flowerDefinitions
      .map((flower, index) => ({ flower, id: FIRST_FLOWER_ID + index }))
      .filter(({ flower }) => flower.spawnBiomes.includes('Forest'))
      .map(({ id }) => id),
  };

  const flowerPatchFeatures = {
    Plains: {
      patchesPerChunk: 3,
      patchSkipChance: 0.4,
      tries: 24,
      xzSpread: 11,
      ySpread: 4,
      substrateIds: [1],
      flowerIds: flowerSpawnConfig.Plains.slice(),
    },
    Forest: {
      patchesPerChunk: 2,
      patchSkipChance: 0.55,
      tries: 16,
      xzSpread: 9,
      ySpread: 4,
      substrateIds: [1],
      flowerIds: flowerSpawnConfig.Forest.slice(),
    },
  };

  window.SingleplayerSideConfig = {
    FIRST_FLOWER_ID,
    LAST_FLOWER_ID: FIRST_FLOWER_ID + flowerDefinitions.length - 1,
    FLOWER_IDS: flowerIds,
    FLOWER_DEFINITIONS: flowerDefinitions.map((flower, index) => ({
      ...flower,
      id: FIRST_FLOWER_ID + index,
      spawnBiomes: flower.spawnBiomes.slice(),
    })),
    DYE_DEFINITIONS: dyeDefinitions.map((dye) => ({ ...dye })),
    DYE_IDS: dyeDefinitions.map((dye) => dye.id),
    DYED_GLASS_DEFINITIONS: dyedGlassDefinitions.map((glass) => ({ ...glass })),
    DYED_GLASS_IDS: dyedGlassDefinitions.map((glass) => glass.id),
    DYE_MIX_RECIPES: dyeMixRecipes.map((recipe) => ({
      ...recipe,
      ingredientIds: recipe.ingredientIds.slice(),
    })),
    FLOWER_BLOCK_MATERIALS: flowerBlockMaterials,
    FLOWER_ASSET_FILEPATHS: flowerAssetFilepaths,
    FLOWER_SPAWN_CONFIG: flowerSpawnConfig,
    FLOWER_PATCH_FEATURES: flowerPatchFeatures,
    VINE_ID: vineDefinition.id,
    VINE_DEFINITION: {
      ...vineDefinition,
      spawnBiomes: vineDefinition.spawnBiomes.slice(),
    },
    SIDE_BLOCK_MATERIALS: sideBlockMaterials,
    SIDE_ASSET_FILEPATHS: sideAssetFilepaths,
    SIDE_RENDER_BLOCK_IDS: [...flowerIds, vineDefinition.id],
  };
})();
