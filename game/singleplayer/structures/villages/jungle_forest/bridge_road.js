(function () {
  const registry = window.SingleplayerVillagePieceRegistry;
  if (!registry?.register) return;

  registry.register({
    biome: 'jungle_forest',
    pieceId: 'bridge_road',
    design: {
    "category": "bridge",
    "footprint": {
        "width": 3,
        "depth": 13
    },
    "axis": "z",
    "supportBlockId": 96,
    "supportDepth": 6
}
  });
})();
