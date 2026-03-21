(function () {
  const SmallOakTree = {
    style: 'small_oak',
    trunkOffsets: [{ x: 0, z: 0 }],
    trunkBlockId: 5,
    leafBlockId: 6,
    crownRadius: 0,
    trunkHeight({ hashRand2D, wx, wz }) {
      return 3 + Math.floor(hashRand2D(wx, wz, 211) * 2);
    },
    canopyRadius(relYToTop) {
      if (relYToTop >= 1) return 0;
      if (relYToTop >= 0) return 1;
      if (relYToTop >= -1) return 2;
      return 1;
    },
  };

  window.SmallOakTree = SmallOakTree;
})();
