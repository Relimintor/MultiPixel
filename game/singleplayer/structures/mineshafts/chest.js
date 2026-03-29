(function () {
  const TABLE = [
    { id: 35, min: 3, max: 10, weight: 7 },
    { id: 30, min: 2, max: 8, weight: 6 },
    { id: 40, min: 1, max: 5, weight: 4 },
    { id: 18, min: 3, max: 12, weight: 5 },
    { id: 95, min: 2, max: 7, weight: 4 },
    { id: 43, min: 1, max: 2, weight: 1 },
    { id: 54, min: 1, max: 2, weight: 1 }
  ];

  function rollAmount(hashRand2D, seedX, seedZ, salt, entry) {
    const min = Math.max(1, Number(entry?.min) || 1);
    const max = Math.max(min, Number(entry?.max) || min);
    const roll = hashRand2D(seedX + salt * 3, seedZ - salt * 5, 45300 + salt);
    return min + Math.floor(roll * (max - min + 1));
  }

  function pick(hashRand2D, seedX, seedZ, salt) {
    const total = TABLE.reduce((s, e) => s + Math.max(0.0001, Number(e.weight) || 1), 0);
    let roll = hashRand2D(seedX + salt * 7, seedZ - salt * 11, 45320 + salt) * total;
    for (const entry of TABLE) {
      roll -= Math.max(0.0001, Number(entry.weight) || 1);
      if (roll <= 0) return entry;
    }
    return TABLE[TABLE.length - 1];
  }

  function generateLoot({ hashRand2D, seedX, seedZ }) {
    if (typeof hashRand2D !== 'function') return [];
    const items = [];
    const rolls = 3 + Math.floor(hashRand2D(seedX, seedZ, 45340) * 3);
    for (let i = 0; i < rolls; i++) {
      const entry = pick(hashRand2D, seedX, seedZ, i + 1);
      items.push({ id: entry.id, count: rollAmount(hashRand2D, seedX, seedZ, i + 1, entry) });
    }
    return items;
  }

  window.MineshaftChestLoot = { TABLE, generateLoot };
})();
