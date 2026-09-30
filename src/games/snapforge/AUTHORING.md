# Snapforge model authoring

Snapforge models are authored as recipes in `src/games/snapforge/recipes/` and compiled into static level JSON in `src/games/snapforge/levels/`. The recipe is the source of truth; do not edit generated bricks by hand. Read `docs/design.md` for shape and construction rules, and use `recipes/turtle.json` as an example.

## Workflow

1. Choose a recognizable subject, collection, order, and target part count. Sketch its silhouette, color regions, defining features, and symmetry before placing volumes. Later models in a collection should generally have larger budgets.
2. Write `recipes/<id>.json` with named volumes. Use broad clean bricks for solid forms and smaller ones where they add a visible detail. Protect only features or assembly boundaries that need to remain separate.
3. Run `npm run compile:snapforge -- src/games/snapforge/recipes/<id>.json`. The compiler writes `levels/<id>.json` and reports actual count, target range, custom sizes, and merge opportunities. Pass a second output path for a draft; append `--check` to verify an existing output without writing.
4. Revise the recipe until the count is within `targetParts Â±2`, the shape reads clearly, and the construction is supported. Add meaningful detail if below budget; remove low-value detail if above. Do not split clean parts to pad the count or add hidden supports to repair geometry.
5. Run `npm run validate:snapforge`, `npm run test:snapforge`, and `npm run build:prod`. Run `npm run test:snapforge:scene` when changing meshes, physics, intro timing, the held-piece overlay, or gallery behavior. `npm run check:snapforge-recipes` checks all recipe outputs without writing.
6. Run `npm run dev` and inspect `/arcade/games/snapforge/index.html`. Review the gallery, loose pile, finished model, and first construction steps in all four resting views at desktop and phone widths. The development panel has Snap next piece and Finish model controls. Automated checks cannot judge likeness.
7. Leave new or changed output at `vetted: 0`. Only an explicit user request can set it to `1`. Increment `version` before changing a published model's bricks, palette, or construction order. Metadata-only changes do not need a version bump. Use a separate draft output to iterate on an unshipped version-1 model.

## Recipe format

Required fields are `id`, `title`, `description`, `collection`, `order`, `version`, `targetParts`, `palette`, and `volumes`. Use a unique lowercase slug ID, non-negative integer order, positive integer version and target, and named six-digit hex colors. Collection IDs are `starter`, `farm`, `fruit`, `land-animal` (Safari), `car`, `ocean`, `bird`, `landmarks`, and `dinosaur`, listed from the smallest catalog to the largest. Dinosaur stays last while it is empty.

Each volume has `{ name, x, y, z, w, d, h, color }`. Names are unique; coordinates are non-negative integers, with x/y horizontal and z vertical. Dimensions are positive integers. Volumes may be taller than runtime bricks. An overlapping volume needs `overlay: true`, which replaces earlier color and protection at its occupied cells. An overlay does not add hidden bricks.

Use `protected: true` to keep packed bricks inside a volume's surviving boundary, even where adjacent cells have the same color. This is useful for a distinct appendage or assembly, but should not be used to increase the count artificially.

Optional `symmetry` has an axis of `x` or `y` and an integer or half-integer plane, for example `{ "axis": "y", "plane": 5 }`. The compiler checks colored cells and brick seams. For y symmetry, a cell mirrors to `2 * plane - y - 1` and a brick to `2 * plane - y - d`. Declare a narrow intentional exception with `exceptions: [{ "volumes": ["feature-name"], "reason": "..." }]`. Protected paired regions must still admit mirrored bricks.

Use `attachment: "underside"` on an ordinary volume for a hanging feature such as a tail or tusk. Its top studs must attach to a non-wheel brick immediately above it that appears earlier in `buildSequence`. The compiler rejects floating chains, cycles, and underside wheels. Prefer ordinary upward construction for other features.

Wheel volumes use `kind: "wheel"` and a 3Ã—1Ã—3 footprint, or 1Ã—3Ã—3 when rotated. A wheel is one atomic part, attaches sideways at its central axle cell, cannot support a brick above, and cannot be overlaid or split. Orient it along the footprint's long dimension.

## Compiler and generated levels

The compiler preserves recipe cells, colors, protected boundaries, and declared symmetry while packing rectangles of height 1 or 2, then consolidating exact vertical stacks into 1×1, 1×2, or 2×2 h4 parts. Stack consolidation retains protected boundaries and mirrored seams. It requires a connected stud graph and compares the final consolidated packings by piece count, then seam area, then unusual sizes. Its search is deterministic but does not prove a global minimum. A merge suggestion may still be blocked by symmetry, a protected boundary, or construction order.

Generated levels contain the recipe metadata, `vetted: 0 | 1`, `bricks`, and `buildSequence`. Each brick has an ID, position, dimensions, color, and optional `kind` or `attachment`. Ordinary brick height defaults to 1 and is 1 or 2, with h4 on 1×1, 1×2, and 2×2 stacks and h3 allowed for 1×2 pillars; wheels have height 3. A rotated rectangle of the same color, height, and kind is interchangeable during play. Occupied cells cannot overlap, and raised bricks need a valid attachment.

`buildSequence` lists every brick ID once. The compiler starts from a grounded part, builds ordinary assemblies upward, and builds hanging assemblies downward from an existing anchor. Validation checks each attachment. Existing saved builds are tied to the model version.

Legacy models without recipes are generated by `python scripts/generate-snapforge-collections.py`. It preserves their targets and vetting and skips IDs that have recipes. Migrate one model at a time by adding a recipe, choosing its target, incrementing its version if published, compiling, and reviewing it.
Great Pyramid version 2 retains only the largest pyramid and trims the sand base to 14×14. All 85 pyramid stones, including its entrance accents, are individual 2×2 h2 pieces; protected stone boundaries intentionally preserve the requested masonry seams. The hollow stepped silhouette and mirrored construction remain. Total: 86/86 parts including the base, at Landmarks #2, unvetted for manual review.

Use `pillar: true` on a 1×2 h3 volume (or rotated 2×1 h3) to emit one tall ordinary brick. These explicit parts cannot overlap or be overlaid. They use normal stud support and may support bricks above; unmarked volumes retain h1/h2 packing.

A 3×3 footprint supports ordinary h2 bricks and explicit `pillar: true` h3 bricks. Like the 1×2 h3 pillar, the 3×3 h3 part remains atomic and uses normal stud support. Odd-width tower cores allow a 1×1 antenna to align with their center stud.

Matching stacks of 1×3 or 3×1 ordinary bricks may also combine into one h4 brick. This extends the compact h4 parts to narrow three-stud side strips; 3×3 h4 core blocks are not introduced.
