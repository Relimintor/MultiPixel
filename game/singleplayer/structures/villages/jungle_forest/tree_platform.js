(function () {
  const registry = window.SingleplayerVillagePieceRegistry;
  if (!registry?.register) return;

  registry.register({
    biome: 'jungle_forest',
    pieceId: 'tree_platform',
    design: {
    "category": "platform",
    "footprint": {
        "width": 11,
        "depth": 11
    },
    "deckHeight": 4,
    "supportBlockId": 96,
    "supportOffsets": [
        {
            "x": -5,
            "z": -5
        },
        {
            "x": 5,
            "z": -5
        },
        {
            "x": -5,
            "z": 5
        },
        {
            "x": 5,
            "z": 5
        }
    ]
}
  });
})();
