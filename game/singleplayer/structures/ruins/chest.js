(function () {
  const GUARANTEED_LOOT = [
    { id: 95, min: 1, max: 3 },
    { id: 17, min: 2, max: 8 },
  ];

  const OPTIONAL_LOOT_TABLE = [
    { id: 118, min: 1, max: 4, weight: 2 },
    { id: 95, min: 1, max: 5, weight: 4 },
    { id: 2, min: 3, max: 10, weight: 4 },
    { id: 17, min: 3, max: 10, weight: 4 },
    { id: 11, min: 1, max: 1, weight: 1 },
    { id: 83, min: 1, max: 1, weight: 1 },
    { id: 127, min: 1, max: 1, weight: 1 },
    { id: 121, min: 1, max: 1, weight: 1 },
  ];

  function rollAmount(hashRand2D, seedX, seedZ, salt, entry) {
    const roll = hashRand2D(seedX + salt * 13, seedZ - salt * 17, 42100 + salt);
    const min = Math.max(1, Number(entry?.min) || 1);
    const max = Math.max(min, Number(entry?.max) || min);
    return min + Math.floor(roll * (max - min + 1));
  }

  function chooseWeightedEntry(hashRand2D, seedX, seedZ, salt, table) {
    const totalWeight = table.reduce((sum, entry) => sum + Math.max(0.0001, Number(entry?.weight) || 1), 0);
    let roll = hashRand2D(seedX + salt * 7, seedZ - salt * 11, 42200 + salt) * totalWeight;
    for (const entry of table) {
      roll -= Math.max(0.0001, Number(entry?.weight) || 1);
      if (roll <= 0) return entry;
    }
    return table[table.length - 1] || null;
  }

  function generateLoot({ hashRand2D, seedX, seedZ }) {
    if (typeof hashRand2D !== 'function') return [];
    const out = GUARANTEED_LOOT.map((entry, index) => ({
      id: entry.id,
      count: rollAmount(hashRand2D, seedX, seedZ, index + 1, entry),
    }));

    const bonusRolls = 1 + Math.floor(hashRand2D(seedX, seedZ, 42300) * 3);
    for (let i = 0; i < bonusRolls; i++) {
      const entry = chooseWeightedEntry(hashRand2D, seedX, seedZ, i + 1, OPTIONAL_LOOT_TABLE);
      if (!entry) continue;
      out.push({ id: entry.id, count: rollAmount(hashRand2D, seedX, seedZ, 20 + i, entry) });
    }
    return out;
  }

  window.RuinsChestLoot = {
    GUARANTEED_LOOT,
    OPTIONAL_LOOT_TABLE,
    generateLoot,
  };
})();
