(function () {
  const GUARANTEED = [
    { id: 40, min: 2, max: 6 },
    { id: 35, min: 4, max: 12 },
  ];

  const OPTIONAL = [
    { id: 43, min: 1, max: 2, weight: 1 },
    { id: 54, min: 1, max: 2, weight: 1.2 },
    { id: 30, min: 3, max: 8, weight: 4 },
    { id: 40, min: 3, max: 10, weight: 4.5 },
    { id: 35, min: 4, max: 14, weight: 5.5 },
    { id: 95, min: 2, max: 6, weight: 2.2 },
    { id: 83, min: 1, max: 1, weight: 0.8 },
    { id: 127, min: 1, max: 1, weight: 0.8 }
  ];

  function rollAmount(hashRand2D, seedX, seedZ, salt, entry) {
    const min = Math.max(1, Number(entry?.min) || 1);
    const max = Math.max(min, Number(entry?.max) || min);
    const roll = hashRand2D(seedX + salt * 11, seedZ - salt * 17, 43900 + salt);
    return min + Math.floor(roll * (max - min + 1));
  }

  function pickWeighted(hashRand2D, seedX, seedZ, salt, table) {
    const total = table.reduce((sum, entry) => sum + Math.max(0.0001, Number(entry?.weight) || 1), 0);
    let roll = hashRand2D(seedX + salt * 9, seedZ - salt * 13, 43960 + salt) * total;
    for (const entry of table) {
      roll -= Math.max(0.0001, Number(entry?.weight) || 1);
      if (roll <= 0) return entry;
    }
    return table[table.length - 1] || null;
  }

  function generateLoot({ hashRand2D, seedX, seedZ }) {
    if (typeof hashRand2D !== 'function') return [];

    const loot = GUARANTEED.map((entry, index) => ({
      id: entry.id,
      count: rollAmount(hashRand2D, seedX, seedZ, index + 1, entry),
    }));

    const bonusRolls = 2 + Math.floor(hashRand2D(seedX, seedZ, 44020) * 3);
    for (let i = 0; i < bonusRolls; i++) {
      const entry = pickWeighted(hashRand2D, seedX, seedZ, i + 1, OPTIONAL);
      if (!entry) continue;
      loot.push({ id: entry.id, count: rollAmount(hashRand2D, seedX, seedZ, 30 + i, entry) });
    }

    return loot;
  }

  window.BadlandsSpireChestLoot = {
    GUARANTEED,
    OPTIONAL,
    generateLoot,
  };
})();
