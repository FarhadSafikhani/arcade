# Snapforge model authoring

Snapforge ships static level JSON. Codex designs and revises models locally; no separate AI service, API key, or runtime model generation is needed. Follow the design rules in `docs/design.md`. The recipe is the source of truth for a migrated model; do not hand-edit its generated brick list.

## Subject → recipe → compiler → visual review

1. Choose the subject, collection, order, and `targetParts` N. Describe the recognizable silhouette, color regions, defining details, and intended symmetry before choosing bricks. Increase N deliberately for later models in a collection.
2. Write a recipe in `src/games/snapforge/recipes/<id>.json`, using the turtle recipe as a complete example. Author named volumes; mark intentional color/detail overrides explicitly. Protect only justified details or assembly boundaries.
3. Run `npm run compile:snapforge -- src/games/snapforge/recipes/<id>.json`. By default it writes `levels/<id>.json`; pass a second path to generate a draft elsewhere. The report includes actual count versus N ±2, custom sizes, and geometric merge opportunities. Failure exits nonzero without writing an output. Geometry errors explain the offending overlap, symmetry, or support problem.
4. Revise the source shape if count is outside N ±2 or construction is awkward. Add meaningful detail when below budget, remove low-value detail when above it. Never split clean parts to pad N. Unsupported geometry must be redesigned; the compiler never adds support cells.
5. Run `npm run validate:snapforge`, `npm run test:snapforge`, and `npm run build:prod`. Catalog validation also checks all recipes. `npm run check:snapforge-recipes` checks only the recipes; for a single recipe, append `--check` to its compile command. Check-only mode performs no writes and fails for a missing, stale, or out-of-budget artifact.
6. Run `npm run dev`, open `/arcade/games/snapforge/index.html`, and inspect the actual gallery, pile, complete model, and first construction steps at desktop and phone widths. Inspect all four resting views. Use the development panel's Snap next piece / Finish model controls for review. Revise the recipe when details are obscured, the silhouette reads poorly, or the build is cluttered. Automated checks cannot judge likeness.
7. Leave `vetted: 0`. Only the user's explicit request can promote it to 1. Increment the recipe's `version` before changing a previously published model's bricks, palette, or construction order; the compiler refuses such changes without a newer version. A fresh unshipped draft can be iterated at version 1 using a separate draft output.

## Recipe interface

Required metadata: `id`, `title`, `description`, `collection`, `order`, `version`, `targetParts`, and `palette`. Use non-negative integer order, positive integer version and target, a unique lowercase slug ID, and named six-digit hex colors. Known collections are `starter`, `land-animal`, `fruit`, `bird`, `car`, `ocean`, and `dinosaur`.

`volumes` is an ordered array of `{ name, x, y, z, w, d, h, color, overlay?, protected? }`. Names are unique. Coordinates are non-negative integers, x/y horizontal and z vertical; dimensions are positive integers. Recipe volumes can be taller than two layers; runtime bricks cannot. A volume normally cannot overlap earlier volumes. With `overlay: true`, its cells replace the earlier color and protection region at those positions. Overlays never imply extra hidden bricks.

`protected: true` keeps bricks from crossing that volume's surviving boundary, even where colors match. Use this for essential details or readable assemblies, not count inflation. The turtle protects its four feet and head so their complete shapes stay together. Its long central foundation also forms the tail; a custom 2×10 footprint avoids unnecessary seams.

Optional `symmetry` is `{ "axis": "y", "plane": 5 }` (x is also supported). The plane can be an integer or half-integer. A cell at y mirrors to `2 * plane - y - 1`; a brick mirrors to `2 * plane - y - d`. The compiler enforces both colored-cell symmetry and mirrored seams. Intentional exceptions use `exceptions: [{ "volumes": ["named-feature"], "reason": "Intentional pose…" }]`; only those surviving volume cells are exempt. Keep exceptions narrow. Protected paired regions must themselves admit mirrored bricks.

The compiler explores deterministic rectangle-packing alternatives and repacks small neighborhoods. It preserves the exact colored cells and protected boundaries, chooses symmetric candidates at heights 1 and 2, and requires a connected stud graph. Among valid alternatives it prefers fewer pieces, then less seam area, then fewer unusual sizes. This is a practical heuristic, not a proof of a globally minimum partition. A failure may mean the recipe needs clearer assembly boundaries or revised geometry.

Geometric merge reports identify adjacent same-color bricks whose union is a rectangle; a proposed merge may still be prevented by symmetry, protected boundaries, or construction. Review these rather than blindly combining them.

## Runtime levels and compatibility

Runtime levels contain the metadata above, required `vetted: 0 | 1`, and `bricks: [{ id, x, y, z, w, d, h?, color }]`. Height defaults to 1 and is limited to 1 or 2. Width and depth may be any positive integer. A rotated rectangle of the same color and height is interchangeable during play. Occupied cells cannot overlap; every raised brick needs at least one stud beneath it.

Generated models also contain `buildSequence`, listing each brick ID exactly once. The compiler starts with the largest grounded footprint and places lower layers before upper layers; validation rejects any brick placed before its support. Models without this field retain the legacy bottom-up order, preserving existing saved builds. Fresh play always starts at zero placed pieces; previews and breakup animation never remove construction steps or consume inventory.

The six starter models are Little Turtle, Little Duck, Apple, Pineapple, Sports Car, and Castle. Other collections contain three models each. IDs and order determine independent unlock paths: the first model is playable immediately; completing it unlocks the next. Vetting never affects playability. Existing incomplete builds are tied to the model version; metadata-only changes do not require a version bump.

Legacy themed models still come from `python scripts/generate-snapforge-collections.py`. That generator preserves targets and explicit vetting, refuses unexpected geometry changes, and skips IDs with recipes. Migrate each model individually by adding a recipe, deliberately setting N, incrementing its version, compiling and reviewing it. Do not regenerate the whole catalog with new decomposition rules as a shortcut.

## Reusable Codex prompt

> Design **[SUBJECT]** for Snapforge, targeting **[N] pieces, ±2**, in **[COLLECTION]** at **[ORDER]**. Read `docs/design.md` and this guide. First describe its silhouette, color regions, defining features, and symmetry. Author a named-volume recipe, then run the local compiler. Use broad clean bricks for solid regions and small pieces only for useful detail. Prefer standard rectangles, but justify useful custom sizes. Protect only real features or assembly boundaries. Require mirrored colors, shape, and seams where the subject warrants symmetry. Do not add scattered support posts, silently alter cells during packing, or split bricks to pad the count. Inspect compiler diagnostics and revise the recipe until construction and count work. Run validation, tests, and production build; inspect the actual gallery and play screen from four resting views at desktop and phone widths. Keep `vetted: 0`; only the user can approve that flag. Report actual versus target count and any remaining visual limitations.
