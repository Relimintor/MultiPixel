(function () {
  const LargeOakTree = {
    style: 'large_oak',
    trunkOffsets: [{ x: 0, z: 0 }],
    trunkHeight({ hashRand2D, wx, wz }) {
      return 5 + Math.floor(hashRand2D(wx, wz, 307) * 3);
    },
    canopyRadius(relYToTop) {
      if (relYToTop >= 2) return 1;
      if (relYToTop >= 1) return 2;
      if (relYToTop >= 0) return 3;
      if (relYToTop >= -1) return 2;
      return 1;
    },
  };

  window.LargeOakTree = LargeOakTree;
})();
