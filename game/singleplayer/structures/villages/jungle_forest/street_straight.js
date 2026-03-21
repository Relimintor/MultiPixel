(function () {
  const registry = window.SingleplayerVillagePieceRegistry;
  if (!registry?.register) return;

  registry.register({
    biome: 'jungle_forest',
    pieceId: 'street_straight',
    design: {
    "category": "street",
    "footprint": {
        "width": 3,
        "depth": 9
    },
    "axis": "z"
}
  });
})();
