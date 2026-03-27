(function () {
  const DEFAULTS = {
    cookTimeSec: 8,
    fuels: {
      19: 80,
      20: 800,
      25: 80,
      5: 15,
      8: 15,
      96: 15,
      98: 15,
      103: 15,
      99: 2,
      100: 2,
      101: 2,
      10: 5,
      11: 10,
      12: 10,
      83: 10,
      84: 10,
    },
    recipes: {
      17: { out: 3, cookTimeSec: 8 },
      7: { out: 26, cookTimeSec: 7 },
      30: { out: 67, cookTimeSec: 10 },
      35: { out: 69, cookTimeSec: 10 },
      40: { out: 70, cookTimeSec: 10 },
      5: { out: 25, cookTimeSec: 8 },
      96: { out: 25, cookTimeSec: 8 },
      31: { out: 67, cookTimeSec: 10 },
      42: { out: 70, cookTimeSec: 10 },
      38: { out: 69, cookTimeSec: 10 },
      89: { out: 90, cookTimeSec: 7 },
      111: { out: 112, cookTimeSec: 7 },
    }
  };

  function cloneDefaults() {
    return {
      cookTimeSec: DEFAULTS.cookTimeSec,
      fuels: { ...DEFAULTS.fuels },
      recipes: JSON.parse(JSON.stringify(DEFAULTS.recipes)),
    };
  }

  function createSystem(config = {}) {
    const cfg = cloneDefaults();
    if (typeof config.cookTimeSec === 'number') cfg.cookTimeSec = config.cookTimeSec;
    if (config.fuels) Object.assign(cfg.fuels, config.fuels);
    if (config.recipes) Object.assign(cfg.recipes, config.recipes);

    function createState() {
      return {
        input: null,
        fuel: null,
        output: null,
        burnTime: 0,
        maxBurnTime: 0,
        cookTime: 0,
        cookTimeTarget: cfg.cookTimeSec,
      };
    }

    function getRecipe(id) { return cfg.recipes[id] || null; }
    function getFuelTime(id) { return cfg.fuels[id] || 0; }

    function canSmelt(state) {
      if (!state.input) return false;
      const recipe = getRecipe(state.input.id);
      if (!recipe) return false;
      if (!state.output) return true;
      if (state.output.id !== recipe.out) return false;
      return state.output.count < 64;
    }

    function consumeFuel(state) {
      if (!state.fuel) return false;
      const fuelTime = getFuelTime(state.fuel.id);
      if (!fuelTime) return false;
      state.maxBurnTime = fuelTime;
      state.burnTime = fuelTime;
      state.fuel.count -= 1;
      if (state.fuel.count <= 0) state.fuel = null;
      return true;
    }

    function smeltOne(state) {
      const recipe = getRecipe(state.input?.id);
      if (!recipe) return false;
      state.input.count -= 1;
      if (state.input.count <= 0) state.input = null;
      if (!state.output) state.output = { id: recipe.out, count: 1 };
      else state.output.count += 1;
      return true;
    }

    function updateState(state, deltaSec) {
      const stepSec = Number(deltaSec);
      if (!Number.isFinite(stepSec) || stepSec <= 0) return;

      let remaining = Math.min(60, stepSec);
      while (remaining > 0) {
        if (state.burnTime <= 0 && canSmelt(state) && state.fuel) {
          consumeFuel(state);
        }

        const smeltable = canSmelt(state);
        if (!smeltable) {
          state.cookTime = 0;
          if (state.burnTime <= 0) break;
          const idleBurnStep = Math.min(remaining, state.burnTime);
          state.burnTime = Math.max(0, state.burnTime - idleBurnStep);
          remaining -= idleBurnStep;
          continue;
        }

        const recipe = getRecipe(state.input?.id);
        state.cookTimeTarget = recipe?.cookTimeSec || cfg.cookTimeSec;

        if (state.burnTime <= 0) break;

        const cookRemaining = Math.max(0, state.cookTimeTarget - state.cookTime);
        const appliedStep = Math.min(remaining, state.burnTime, cookRemaining);
        if (appliedStep <= 0) break;

        state.cookTime += appliedStep;
        state.burnTime = Math.max(0, state.burnTime - appliedStep);
        remaining -= appliedStep;

        if (state.cookTime >= state.cookTimeTarget) {
          if (!smeltOne(state)) break;
          state.cookTime = Math.max(0, state.cookTime - state.cookTimeTarget);
        }
      }
    }

    function registerFuel(id, burnTimeSec) {
      cfg.fuels[id] = burnTimeSec;
      return api;
    }

    function registerRecipe(inputId, outputId, cookTimeSec = cfg.cookTimeSec) {
      cfg.recipes[inputId] = { out: outputId, cookTimeSec };
      return api;
    }

    const api = { cfg, createState, updateState, canSmelt, getRecipe, getFuelTime, registerFuel, registerRecipe };
    return api;
  }

  window.FurnaceSystem = createSystem();
  window.createFurnaceSystem = createSystem;
})();
