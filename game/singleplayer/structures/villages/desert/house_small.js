(function () {
  const registry = window.SingleplayerVillagePieceRegistry;
  if (!registry?.register) return;

  registry.register({
    biome: 'desert',
    pieceId: 'house_small',
    design: {
    "category": "house",
    "footprint": {
        "width": 7,
        "depth": 7
    },
    "structure": {
        "tokens": {
            "#": "wall",
            "+": "beam",
            ".": "floor",
            "w": "window",
            "=": "roof",
            "c": "chest",
            " ": "air"
        },
        "layers": [
            {
                "yOffset": 0,
                "rows": [
                    ".......",
                    ".......",
                    "..c....",
                    ".......",
                    ".......",
                    ".......",
                    "......."
                ]
            },
            {
                "yOffset": 1,
                "rows": [
                    "+++ +++",
                    "+     +",
                    "+     +",
                    "+     +",
                    "+     +",
                    "+     +",
                    "+++++++"
                ]
            },
            {
                "yOffset": 2,
                "rows": [
                    "++w w++",
                    "+     +",
                    "w     w",
                    "+     +",
                    "w     w",
                    "+     +",
                    "++w w++"
                ]
            },
            {
                "yOffset": 3,
                "rows": [
                    "+++++++",
                    "+     +",
                    "+     +",
                    "+     +",
                    "+     +",
                    "+     +",
                    "+++++++"
                ]
            },
            {
                "yOffset": 4,
                "rows": [
                    "=======",
                    "=======",
                    "=======",
                    "=======",
                    "=======",
                    "=======",
                    "======="
                ]
            },
            {
                "yOffset": 5,
                "rows": [
                    " ===== ",
                    " ===== ",
                    " ===== ",
                    " ===== ",
                    " ===== ",
                    " ===== ",
                    " ===== "
                ]
            }
        ]
    },
    "placeChest": false,
    "doorDirs": [
        "N"
    ]
}
  });
})();
