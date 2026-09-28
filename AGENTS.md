# Snapforge tests

`npm run test:snapforge` is the default route: level rules, pile and resume behavior, the catalog map, tray math, and the compiler. `npm run test:snapforge:scene` is the niche route: meshes, Rapier, intro timing, the held-piece overlay, and the gallery. Ordinary recipe work stays on the default route. Run the scene route when changing those systems.

Add each test to the route that owns the behavior. The catalog is already walked for pile replenishment and an empty start on the default route, and for the pour lead on the scene route. Do not add another sweep to pin a timing constant or mesh epsilon.



