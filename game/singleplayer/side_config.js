(function () {
  const fallbackFlowerTexture = 'textures/Fallback.png';
  const flowerDefinitions = [
    { name: 'Dandelion', textureKey: 'FLOWER_DANDELION', color: 0xf2d84b, spawnBiomes: ['Plains', 'Forest'] },
    { name: 'Poppy', textureKey: 'FLOWER_POPPY', color: 0xd94a4a, spawnBiomes: ['Plains', 'Forest'] },
    { name: 'Blue Orchid', textureKey: 'FLOWER_BLUE_ORCHID', color: 0x6db7ff, spawnBiomes: ['Plains'] },
    { name: 'Allium', textureKey: 'FLOWER_ALLIUM', color: 0xc98cff, spawnBiomes: ['Plains', 'Forest'] },
    { name: 'Azure Bluet', textureKey: 'FLOWER_AZURE_BLUET', color: 0xe9eef7, spawnBiomes: ['Plains'] },
    { name: 'Oxeye Daisy', textureKey: 'FLOWER_OXEYE_DAISY', color: 0xf4f4e8, spawnBiomes: ['Plains', 'Forest'] },
    { name: 'Cornflower', textureKey: 'FLOWER_CORNFLOWER', color: 0x4d7cff, spawnBiomes: ['Plains'] },
    { name: 'Lily of the Valley', textureKey: 'FLOWER_LILY_OF_THE_VALLEY', color: 0xf2f7ea, spawnBiomes: ['Plains', 'Forest'] },
    { name: 'Orange Tulip', textureKey: 'FLOWER_ORANGE_TULIP', color: 0xf08c3c, spawnBiomes: ['Plains'] },
    { name: 'Pink Tulip', textureKey: 'FLOWER_PINK_TULIP', color: 0xf29bc1, spawnBiomes: ['Plains'] },
    { name: 'Red Tulip', textureKey: 'FLOWER_RED_TULIP', color: 0xdb4c4c, spawnBiomes: ['Plains', 'Forest'] },
    { name: 'White Tulip', textureKey: 'FLOWER_WHITE_TULIP', color: 0xf3f0e8, spawnBiomes: ['Plains'] },
  ];

  const FIRST_FLOWER_ID = 113;
  const flowerBlockMaterials = {};
  const flowerAssetFilepaths = {};
  const flowerIds = [];

  flowerDefinitions.forEach((flower, index) => {
    const id = FIRST_FLOWER_ID + index;
    flowerIds.push(id);
    flowerAssetFilepaths[flower.textureKey] = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || '/MultiPixel'}/game/singleplayer/assets/${fallbackFlowerTexture}`;
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

  const flowerSpawnConfig = {
    Plains: flowerIds.slice(),
    Forest: flowerDefinitions
      .map((flower, index) => ({ flower, id: FIRST_FLOWER_ID + index }))
      .filter(({ flower }) => flower.spawnBiomes.includes('Forest'))
      .map(({ id }) => id),
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
  };
})();
