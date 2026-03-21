(function () {
  const registry = window.SingleplayerVillagePieceRegistry;
  if (!registry?.register) return;

  registry.register({
    biome: 'snowy_plains',
    pieceId: 'igloo',
    design: {
    "category": "house",
    "footprint": {
        "width": 7,
        "depth": 7
    },
    "wallHeight": 4,
    "doorDirs": [
        "N"
    ],
    "windowRows": [
        2
    ],
    "roofLayers": [
        {
            "yOffset": 0,
            "inset": 0,
            "edgeOnly": true
        },
        {
            "yOffset": 1,
            "inset": 1,
            "edgeOnly": false
        },
        {
            "yOffset": 2,
            "inset": 2,
            "edgeOnly": false
        }
    ],
    "windowBlockId": 80,
    "placeChest": true
}
  });
})();
