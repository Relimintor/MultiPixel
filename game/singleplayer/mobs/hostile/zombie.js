(function () {
  const root = (window.SingleplayerMobData = window.SingleplayerMobData || {
    categories: { passive: {}, neutral: {}, hostile: {} },
  });

  root.categories.hostile.zombie = {
    id: 2,
    key: 'zombie',
    name: 'Zombie',
    category: 'hostile',
  };
})();
