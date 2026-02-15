(function () {
  const CRAFTING_RECIPES = [
    { name: 'Oak Planks', output: { id: 8, count: 4 }, shape: [[5]] },
    { name: 'Crafting Table', output: { id: 9, count: 1 }, shape: [[8, 8], [8, 8]] },
    { name: 'Stick', output: { id: 10, count: 4 }, shape: [[8], [8]] },
    { name: 'Wooden Pickaxe', output: { id: 11, count: 1 }, shape: [[8, 8, 8], [0, 10, 0], [0, 10, 0]] },
    { name: 'Stone Pickaxe', output: { id: 12, count: 1 }, shape: [[17, 17, 17], [0, 10, 0], [0, 10, 0]] },
    { name: 'Sand Stone', output: { id: 13, count: 4 }, shape: [[7, 7], [7, 7]] },
    { name: 'Snow Block', output: { id: 15, count: 1 }, shape: [[16, 16], [16, 16]] },
    { name: 'Coal Block', output: { id: 20, count: 1 }, shape: [[19, 19, 19], [19, 19, 19], [19, 19, 19]] },
  ];

  function checkCraftingRecipe(inputSlots, gridWidth) {
    const grid = [];
    let hasItems = false;

    for (let r = 0; r < gridWidth; r++) {
      const row = [];
      for (let c = 0; c < gridWidth; c++) {
        const item = inputSlots[r * gridWidth + c];
        row.push(item ? item.id : 0);
        if (item) hasItems = true;
      }
      grid.push(row);
    }

    if (!hasItems) return null;

    let minR = gridWidth, maxR = -1, minC = gridWidth, maxC = -1;
    for (let r = 0; r < gridWidth; r++) {
      for (let c = 0; c < gridWidth; c++) {
        if (grid[r][c] !== 0) {
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }

    const patternHeight = maxR - minR + 1;
    const patternWidth = maxC - minC + 1;

    for (const recipe of CRAFTING_RECIPES) {
      const shape = recipe.shape;
      const recipeH = shape.length;
      const recipeW = shape[0].length;
      if (patternHeight !== recipeH || patternWidth !== recipeW) continue;

      let match = true;
      for (let r = 0; r < recipeH; r++) {
        for (let c = 0; c < recipeW; c++) {
          const requiredId = shape[r][c];
          const actualId = grid[minR + r][minC + c];
          if ((requiredId !== 0 && requiredId !== actualId) || (requiredId === 0 && actualId !== 0)) {
            match = false;
            break;
          }
        }
        if (!match) break;
      }

      if (match) {
        let minCount = 64;
        for (let r = 0; r < gridWidth; r++) {
          for (let c = 0; c < gridWidth; c++) {
            const item = inputSlots[r * gridWidth + c];
            if (item && grid[r][c] !== 0) minCount = Math.min(minCount, item.count);
          }
        }

        return {
          id: recipe.output.id,
          count: recipe.output.count * minCount,
          requiredCountPerCraft: 1,
          recipeOutputPerCraft: recipe.output.count,
          offset: { r: minR, c: minC, h: recipeH, w: recipeW, shape },
        };
      }
    }

    return null;
  }

  function consumeCraftingInputForOne(inputSlots, recipeResult, gridWidth) {
    if (!recipeResult || !recipeResult.offset) return false;
    const { r: minR, c: minC, h, w, shape } = recipeResult.offset;

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const requiredId = shape[r][c];
        if (requiredId !== 0) {
          const slotIndex = (minR + r) * gridWidth + (minC + c);
          const item = inputSlots[slotIndex];
          if (item) {
            item.count--;
            if (item.count <= 0) inputSlots[slotIndex] = null;
          }
        }
      }
    }
    return true;
  }

  window.CraftingSystem = { CRAFTING_RECIPES, checkCraftingRecipe, consumeCraftingInputForOne };
})();
