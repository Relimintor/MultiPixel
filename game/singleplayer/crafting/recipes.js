(function () {
  const VINE_ID = window.SingleplayerSideConfig?.VINE_ID || 126;

  const CRAFTING_RECIPES = [
    { name: 'Oak Planks', output: { id: 8, count: 4 }, shape: [[5]] },
    { name: 'Crafting Table', output: { id: 9, count: 1 }, shape: [[8, 8], [8, 8]] },
    { name: 'Crafting Table (Jungle)', output: { id: 9, count: 1 }, shape: [[98, 98], [98, 98]] },
    { name: 'Crafting Table (Bamboo)', output: { id: 9, count: 1 }, shape: [[103, 103], [103, 103]] },
    { name: 'Stick', output: { id: 10, count: 4 }, shape: [[8], [8]] },
    { name: 'Stick (Jungle)', output: { id: 10, count: 4 }, shape: [[98], [98]] },
    { name: 'Stick (Bamboo)', output: { id: 10, count: 4 }, shape: [[103], [103]] },
    { name: 'Sand Stone', output: { id: 13, count: 4 }, shape: [[7, 7], [7, 7]] },
    { name: 'Snow Block', output: { id: 15, count: 1 }, shape: [[16, 16], [16, 16]] },
    { name: 'Coal Block', output: { id: 20, count: 1 }, shape: [[19, 19, 19], [19, 19, 19], [19, 19, 19]] },
    { name: 'Stone Brick', output: { id: 21, count: 4 }, shape: [[3, 3], [3, 3]] },
    { name: 'Mossy Cobblestone', output: { id: 113, count: 1 }, shape: [[VINE_ID, 17]] },
    { name: 'Mossy Cobblestone', output: { id: 113, count: 1 }, shape: [[17, VINE_ID]] },
    { name: 'Sand Stone', output: { id: 7, count: 4 }, shape: [[13]] },
    { name: 'Coal Block', output: { id: 19, count: 9 }, shape: [[20]] },
    { name: 'Snow Block', output: { id: 16, count: 4 }, shape: [[15]] },
    { name: 'torch', output: { id: 22, count: 4 }, shape: [[19], [10]] },
    { name: 'furnace', output: { id: 23, count: 1 }, shape: [[3, 3, 3], [3, 0, 3], [3, 3, 3]] },
    { name: 'furnace', output: { id: 23, count: 1 }, shape: [[17, 17, 17], [17, 0, 17], [17, 17, 17]] },
    { name: 'raw iron block', output: { id: 32, count: 1 }, shape: [[31, 31, 31], [31, 31, 31], [31, 31, 31]] },
    { name: 'raw iron', output: { id: 31, count: 9 }, shape: [[32]] },
    { name: 'Raw copper block', output: {id: 36, count: 1}, shape: [[38, 38, 38], [38, 38, 38], [38, 38, 38]] },
    { name: 'Raw copper', output: { id: 38, count: 9}, shape: [[36]] },
    { name: 'Raw Gold Block', output: { id: 41, count: 1}, shape: [[42, 42, 42], [42, 42, 42], [42, 42, 42]] },
    { name: 'Raw Gold', output: { id: 42, count: 9}, shape: [[41]] },
    { name: 'Diamond Block', output: { id: 45, count: 1}, shape: [[44, 44, 44], [44, 44, 44], [44, 44, 44]] },
    { name: 'Diamond', output: { id: 44, count: 9}, shape: [[45]] },
    { name: 'Emerald Block', output: { id: 55, count: 1}, shape: [[56, 56, 56], [56, 56, 56], [56, 56, 56]] },
    { name: 'Emerald', output: { id: 56, count: 9}, shape: [[55]] },
    { name: 'Black Dye', output: { id: 57, count: 1}, shape: [[19]] },
    { name: 'Black Dye', output: { id: 57, count: 1}, shape: [[25]] },
    { name: 'Green Dye', output: { id: 58, count: 1}, shape: [[6]] },
    { name: 'Steel Block', output: { id: 68, count: 1}, shape: [[67, 67, 67], [67, 67, 67], [67, 67, 67]] },
    { name: 'Steel', output: { id: 67, count: 9}, shape: [[68]] },
    { name: 'copper block', output: { id: 34, count: 1}, shape: [[69, 69, 69], [69, 69, 69], [69, 69, 69]] },
    { name: 'Copper ingot', output: { id: 69, count: 9}, shape: [[34]] }, 
    { name: 'Copper Grate', output: { id: 76, count: 1}, shape: [[0, 34, 0], [34, 0, 34], [0, 34, 0]] },
    { name: 'Cut Copper', output: { id: 78, count: 4}, shape: [[34, 34], [34, 34]] },
    { name: 'Packed Ice', output: { id: 81, count: 1}, shape: [[59, 59, 59], [59, 59, 59], [59, 59, 59]] },
    { name: 'Blue Ice', output: { id: 91, count: 1}, shape: [[81, 81, 81], [81, 81, 81], [81, 81, 81]] },
    
    /*Glass*/
    { name: 'Black Stained Glass', output: { id: 79, count: 1}, shape: [[57, 26]] },
    { name: 'Green Stained Glass', output: { id: 80, count: 1}, shape: [[58, 26]] },
    
    /*Åickaxes*/
    { name: 'Wooden Pickaxe', output: { id: 11, count: 1 }, shape: [[8, 8, 8], [0, 10, 0], [0, 10, 0]] },
    { name: 'Wooden Pickaxe (Jungle)', output: { id: 11, count: 1 }, shape: [[98, 98, 98], [0, 10, 0], [0, 10, 0]] },
    { name: 'Wooden Pickaxe (Bamboo)', output: { id: 11, count: 1 }, shape: [[103, 103, 103], [0, 10, 0], [0, 10, 0]] },
    { name: 'Stone Pickaxe', output: { id: 12, count: 1 }, shape: [[17, 17, 17], [0, 10, 0], [0, 10, 0]] },
    { name: 'Stone Pickaxe', output: { id: 12, count: 1 }, shape: [[3, 3, 3], [0, 10, 0], [0, 10, 0]] },
    { name: 'Gold Pickaxe', output: { id: 72, count: 1}, shape: [[70, 70, 70], [0, 10, 0], [0, 10, 0]] },
    { name: 'Copper Pickaxe', output: { id: 73, count: 1}, shape: [[69, 69, 69], [0, 10, 0], [0, 10, 0]] },
    { name: 'Iron Pickaxe', output: { id: 74, count: 1}, shape: [[67, 67, 67 ], [0, 10, 0], [0, 10, 0]] },
    { name: 'Diamond Pickaxe', output: { id: 75, count: 1}, shape: [[44, 44, 44], [0, 10, 0], [0, 10, 0]] },
    { name: 'Emerald Pickaxe', output: { id: 93, count: 1}, shape: [[56, 56, 56], [0, 10, 0], [0, 10, 0]] },
    { name: 'Wooden Shovel', output: { id: 83, count: 1 }, shape: [[8], [10], [10]] },
    { name: 'Wooden Shovel (Jungle)', output: { id: 83, count: 1 }, shape: [[98], [10], [10]] },
    { name: 'Wooden Shovel (Bamboo)', output: { id: 83, count: 1 }, shape: [[103], [10], [10]] },
    { name: 'Stone Shovel', output: { id: 84, count: 1 }, shape: [[17], [10], [10]] },
    { name: 'Stone Shovel', output: { id: 84, count: 1 }, shape: [[3], [10], [10]] },
    { name: 'Gold Shovel', output: { id: 85, count: 1 }, shape: [[70], [10], [10]] },
    { name: 'Copper Shovel', output: { id: 86, count: 1 }, shape: [[69], [10], [10]] },
    { name: 'Iron Shovel', output: { id: 87, count: 1 }, shape: [[67], [10], [10]] },
    { name: 'Diamond Shovel', output: { id: 88, count: 1 }, shape: [[44], [10], [10]] },
    { name: 'Emerald Shovel', output: { id: 94, count: 1 }, shape: [[56], [10], [10]] },
    { name: 'Chiseled Copper', output: { id: 77, count: 4 }, shape: [[78], [78]] },
    { name: 'Jungle Planks', output:  { id: 98, count: 4 }, shape: [[96]] },
    { name: 'Bamboo Planks', output:  { id: 103, count: 4 }, shape: [[101]] },
    { name: 'Chiseled Stone Bricks', output: { id: 102, count: 1 }, shape: [[21], [21]] },
    { name: 'Pumpkin Slices', output: { id: 111, count: 9 }, shape: [[110]] },
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
