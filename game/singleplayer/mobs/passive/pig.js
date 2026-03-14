(function () {
  const root = (window.SingleplayerMobData = window.SingleplayerMobData || {
    categories: { passive: {}, neutral: {}, hostile: {} },
  });

  root.categories.passive.pig = {
    id: 1,
    key: 'pig',
    name: 'Pig',
    category: 'passive',
    behavior: {
      goals: [
        { priority: 0, key: 'float', label: 'FloatGoal', description: 'Keeps pig afloat in water or lava' },
        { priority: 1, key: 'panic', label: 'PanicGoal', description: 'Runs away when hurt, burning, or scared' },
        { priority: 3, key: 'breed', label: 'BreedGoal', description: 'Moves to another pig to breed' },
        { priority: 4, key: 'tempt', label: 'TemptGoal', description: 'Follows players holding carrot, potato, or beetroot' },
        { priority: 5, key: 'followParent', label: 'FollowParentGoal', description: 'Baby pigs follow adults' },
        { priority: 6, key: 'stroll', label: 'WaterAvoidingRandomStrollGoal', description: 'Random wandering while avoiding water' },
        { priority: 7, key: 'lookAtPlayer', label: 'LookAtPlayerGoal', description: 'Looks at nearby players' },
        { priority: 8, key: 'idleLook', label: 'RandomLookAroundGoal', description: 'Idle head movement' },
      ],
      temptItems: ['carrot', 'potato', 'beetroot'],
    },
  };
})();
