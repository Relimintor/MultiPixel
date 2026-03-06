(function () {
  const P = () => window.WorldgenLayerPrograms;

  class RiverStack {
    constructor(layerOps) {
      this.ops = layerOps;
    }

    sampleMask(wx, wz, baseNoise64) {
      const p = P();
      let n = baseNoise64;
      n = p.river_zoom_64_32({ ops: this.ops, wx, wz, value: n });
      n = p.river_empty_a({ value: n });
      n = p.river_zoom_32_16({ ops: this.ops, wx, wz, value: n });
      n = p.river_empty_b({ value: n });
      n = p.river_zoom_16_8({ ops: this.ops, wx, wz, value: n });
      n = p.river_zoom_8_4({ ops: this.ops, wx, wz, value: n });
      n = p.river_noise_to_river({ ops: this.ops, value: n });
      n = p.river_smooth({ ops: this.ops, wx, wz, value: n });
      return n;
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.RiverStack = RiverStack;
})();
