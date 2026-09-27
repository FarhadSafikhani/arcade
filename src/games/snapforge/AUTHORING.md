# Snapforge level authoring

Snapforge is a static game. An LLM can draft a model, but level JSON is reviewed and committed before players see it. The game derives the opening silhouette, disassembly, build order, ghost hints, pile, and gallery preview from the same `bricks` array.

## Add a model

1. Give an LLM the prompt below and replace `[SUBJECT]`, `[PIECE COUNT]`, and `[ORDER]`.
2. Save its JSON as `src/games/snapforge/levels/<id>.json`.
3. Run `npm run validate:snapforge`. Fix every error before continuing.
4. Run `npm run dev`, open `/arcade/games/snapforge/index.html`, and inspect the gallery preview and full build at desktop and phone widths. Revise the JSON if the subject is hard to recognize. Structural validation cannot judge visual likeness.
5. Increment `version` when changing an existing model so an incomplete saved build starts fresh. Use a unique `order` and lowercase slug `id`. Gallery positions 1–4 are reserved for Duck, Race Car, Rocket, and Castle respectively; new themes start at 5. Models with no hand-made teaser card appear automatically in gallery order.

The coordinate system uses integer studs: `x` and `y` are horizontal axes and `z` is the layer. Every piece has one standard brick height. `w` and `d` are positive rectangular stud dimensions, so rotating a piece means swapping `w` and `d`. All coordinates begin at zero. Colors are names from the level's six-digit hex `palette`. A brick above ground needs at least one stud of overlap with a brick directly below it. Bricks cannot occupy the same stud cell on the same layer. The whole model must be connected. The game sorts pieces from bottom to top for construction and reverses that order for the opening breakup.

## Prompt template

> Design a recognizable brick-built **[SUBJECT]** for Snapforge, using about **[PIECE COUNT]** rectangular pieces. Return **only valid JSON**, with no Markdown. Use this exact shape:
>
> `{ "id": "lowercase-slug", "title": "Display name", "description": "One short sentence.", "order": [ORDER], "version": 1, "palette": { "color-name": "#RRGGBB" }, "bricks": [ { "id": "unique-slug", "x": 0, "y": 0, "z": 0, "w": 2, "d": 2, "color": "color-name" } ] }`
>
> Think in layers first. Build a recognizable silhouette from the fixed isometric view, then divide each layer into non-overlapping rectangular bricks. Use a few contrasting colors for defining details such as eyes, wheels, or windows. Every `x`, `y`, and `z` must be a non-negative integer; every `w` and `d` must be a positive integer. Keep all brick IDs unique. Every raised brick must overlap at least one stud in the layer directly beneath it, and the model must be connected. Do not invent unsupported special shapes, slopes, plates, or floating pieces. Include all bricks needed to make the shape; the player will select them from a tray. Make the first few layers broad enough to support details above. Check the JSON yourself for collisions before returning it.

`npm run validate:snapforge -- path/to/candidate.json` checks one candidate file. The validator checks geometry and metadata; the in-game preview is the final check for readability and visual quality.
