(function () {
  const JungleSmallTree = {
    style: 'jungle_small',
    trunkOffsets: [{ x: 0, z: 0 }],
    trunkBlockId: 96,
    leafBlockId: 97,
    crownRadius: 0,
    trunkHeight({ hashRand2D, wx, wz }) {
      return 5 + Math.floor(hashRand2D(wx, wz, 157) * 3);
    },
    canopyRadius(relYToTop) {
      if (relYToTop >= 1) return 1;
      if (relYToTop >= 0) return 2;
      if (relYToTop >= -1) return 2;
      return 1;
    },
  };

  window.JungleSmallTree = JungleSmallTree;
})();
