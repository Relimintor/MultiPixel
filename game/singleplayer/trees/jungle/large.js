(function () {
  const JungleLargeTree = {
    style: 'jungle_large',
    trunkOffsets: [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
    ],
    trunkBlockId: 96,
    leafBlockId: 97,
    crownRadius: 0,
    trunkHeight({ hashRand2D, wx, wz }) {
      return 8 + Math.floor(hashRand2D(wx, wz, 913) * 4);
    },
    canopyRadius(relYToTop) {
      if (relYToTop >= 2) return 2;
      if (relYToTop >= 1) return 3;
      if (relYToTop >= 0) return 4;
      if (relYToTop >= -1) return 4;
      return 3;
    },
  };

  window.JungleLargeTree = JungleLargeTree;
})();
