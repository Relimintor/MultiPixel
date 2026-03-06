(function () {
  class QuadraticCongruential {
    constructor(seed = 1) {
      const s = Number(seed) || 1;
      this.seed = (Math.abs(Math.floor(s)) % 2147483647) || 1;
    }

    nextInt(state, salt = 0) {
      let x = ((state ^ this.seed ^ salt) >>> 0) || 1;
      x = (Math.imul(x, x) + Math.imul(1664525, x) + 1013904223) >>> 0;
      return x;
    }

    valueAt2D(x, z, salt = 0) {
      const mixed = (Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ salt) >>> 0;
      return this.nextInt(mixed, salt) / 4294967296;
    }
  }

  window.WorldgenRandom = { QuadraticCongruential };
})();
