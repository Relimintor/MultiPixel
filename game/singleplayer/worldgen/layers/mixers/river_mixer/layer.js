(function () {
  window.WorldgenLayerPrograms.mix_river = function ({ biome, riverMask, freezeBand, isMushroom, isOcean }) {
    if (isMushroom || isOcean) return biome;
    if (riverMask > 0.24) return freezeBand ? 'Frozen River' : 'River';
    return biome;
  };
})();
