(function () {
  const REPO_BASE_PREFIX = window.SingleplayerConfig?.REPO_BASE_PREFIX || '/MultiPixel';
  const ASSET_BASE_PATH = `${REPO_BASE_PREFIX}/game/singleplayer/assets`;
  const fallbackTexturePath = 'textures/Fallback.png';

  const flowerDefinitions = [
    { name: 'Dandelion', textureKey: 'FLOWER_DANDELION', texturePath: 'textures/flowers/dandelion.png', color: 0xf2d84b, spawnBiomes: ['Plains', 'Forest'] },
    { name: 'Poppy', textureKey: 'FLOWER_POPPY', texturePath: 'textures/flowers/poppy.png', color: 0xd94a4a, spawnBiomes: ['Plains', 'Forest'] },
    { name: 'Blue Orchid', textureKey: 'FLOWER_BLUE_ORCHID', texturePath: 'textures/flowers/blue_orchid.png', color: 0x6db7ff, spawnBiomes: ['Plains'] },
    { name: 'Allium', textureKey: 'FLOWER_ALLIUM', texturePath: 'textures/flowers/allium.png', color: 0xc98cff, spawnBiomes: ['Plains', 'Forest'] },
    { name: 'Azure Bluet', textureKey: 'FLOWER_AZURE_BLUET', texturePath: 'textures/flowers/azure_bluet.png', color: 0xe9eef7, spawnBiomes: ['Plains'] },
    { name: 'Oxeye Daisy', textureKey: 'FLOWER_OXEYE_DAISY', texturePath: 'textures/flowers/oxeye_daisy.png', color: 0xf4f4e8, spawnBiomes: ['Plains', 'Forest'] },
    { name: 'Cornflower', textureKey: 'FLOWER_CORNFLOWER', texturePath: 'textures/flowers/cornflower.png', color: 0x4d7cff, spawnBiomes: ['Plains'] },
    { name: 'Lily of the Valley', textureKey: 'FLOWER_LILY_OF_THE_VALLEY', texturePath: 'textures/flowers/lily_of_the_valley.png', color: 0xf2f7ea, spawnBiomes: ['Plains', 'Forest'] },
    { name: 'Orange Tulip', textureKey: 'FLOWER_ORANGE_TULIP', texturePath: 'textures/flowers/orange_tulip.png', color: 0xf08c3c, spawnBiomes: ['Plains'] },
    { name: 'Pink Tulip', textureKey: 'FLOWER_PINK_TULIP', texturePath: 'textures/flowers/pink_tulip.png', color: 0xf29bc1, spawnBiomes: ['Plains'] },
    { name: 'Red Tulip', textureKey: 'FLOWER_RED_TULIP', texturePath: 'textures/flowers/red_tulip.png', color: 0xdb4c4c, spawnBiomes: ['Plains', 'Forest'] },
    { name: 'White Tulip', textureKey: 'FLOWER_WHITE_TULIP', texturePath: 'textures/flowers/white_tulip.png', color: 0xf3f0e8, spawnBiomes: ['Plains'] },
  ];

  const FIRST_FLOWER_ID = 114;
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
