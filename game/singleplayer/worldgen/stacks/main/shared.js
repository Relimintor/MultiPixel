(function () {
  const C = () => window.WorldgenLayers.Constants;
  const isOceanCell = (v) => v === C().OCEAN || v === C().DEEP_OCEAN;
  const isOceanBiome = (b) => b === 'Ocean' || b === 'Deep Ocean';
  const isWarmClass = (t) => t === C().WARM || t === C().WARM_SPECIAL;
  const isColdClass = (t) => t === C().COLD || t === C().COLD_SPECIAL;
  const isFreezingClass = (t) => t === C().FREEZING;

  window.WorldgenStacksMain = window.WorldgenStacksMain || {};
  window.WorldgenStacksMain.shared = {
    C,
    isOceanCell,
    isOceanBiome,
    isWarmClass,
    isColdClass,
    isFreezingClass,
  };
})();
