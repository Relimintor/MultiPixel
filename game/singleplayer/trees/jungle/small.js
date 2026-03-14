(function () {
  const JungleSmallTree = {
    style: 'jungle_small',
    trunkOffsets: [{ x: 0, z: 0 }],
    canopyRadius(relYToTop) {
      if (relYToTop >= 1) return 1;
      if (relYToTop >= 0) return 2;
      if (relYToTop >= -1) return 2;
      return 1;
    },
  };

  window.JungleSmallTree = JungleSmallTree;
})();
