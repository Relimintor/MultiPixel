(function () {
  const trunkOffsets = [];
  for (let x = 0; x < 8; x++) {
    for (let z = 0; z < 8; z++) trunkOffsets.push({ x, z });
  }

  const RedwoodGiantTree = {
    style: 'redwood_giant',
    trunkOffsets,
    trunkBlockId: 250,
    leafBlockId: 251,
    crownRadius: 4,
    trunkHeight() {
      return 100;
    },
    canopyRadius(relYToTop) {
      if (relYToTop >= 1) return 4;
      if (relYToTop >= 0) return 6;
      if (relYToTop >= -1) return 7;
      return 5;
    },
  };

  window.RedwoodGiantTree = RedwoodGiantTree;
})();
