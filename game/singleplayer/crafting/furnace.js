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
      10: 5,
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
      if (state.burnTime > 0) state.burnTime = Math.max(0, state.burnTime - deltaSec);
      if (state.burnTime <= 0 && canSmelt(state) && state.fuel) consumeFuel(state);
      if (canSmelt(state)) {
        const recipe = getRecipe(state.input.id);
        state.cookTimeTarget = recipe?.cookTimeSec || cfg.cookTimeSec;
        if (state.burnTime > 0) {
          state.cookTime += deltaSec;
          if (state.cookTime >= state.cookTimeTarget) {
            smeltOne(state);
            state.cookTime = 0;
          }
        }
      } else {
        state.cookTime = 0;
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
