(function () {
  const root = (window.SingleplayerMobData = window.SingleplayerMobData || {
    categories: { passive: {}, neutral: {}, hostile: {} },
  });

  root.categories.passive.villager = {
    id: 5,
    key: 'villager',
    name: 'Villager',
    category: 'passive',
    behavior: {
      goals: [
        { priority: 0, key: 'float', label: 'FloatGoal', description: 'Keeps villager above liquids' },
        { priority: 1, key: 'panic', label: 'PanicGoal', description: 'Runs randomly after taking damage or while threatened' },
        { priority: 2, key: 'avoidHostile', label: 'AvoidHostileMobGoal', description: 'Avoids nearby hostile mobs like zombies' },
        { priority: 3, key: 'observe', label: 'LookAroundGoal', description: 'Looks around when idle' },
        { priority: 4, key: 'wanderHome', label: 'VillageHomeWanderGoal', description: 'Wanders around home building interior' },
      ],
    },
  };
})();
