# Arcade

Set of classic Arcade games, mostly vibe coded.


## Description

##to serve and develop locally on http://localhost:3000/
npm run dev 


##to build and preview on http://localhost:4174/
npm run build
npm run preview

## Defender co-op

Defender runs solo in the page, or co-op through a Colyseus server that owns the simulation.

```sh
npm run server          # co-op server on http://localhost:2567 (routes under /ws)
npm run dev             # then open /arcade/games/defender/ and choose "Defend together"
npm run smoke:defender  # two scripted archers join, start a run, and shoot
```

Co-op is live at https://defender-production.up.railway.app (Railway project `defender`, service
`defender`). One Node service serves the page at `/` and the Colyseus server at `/ws`. GitHub Pages
serves only static files, so the arcade copy of Defender there is solo only: "Defend together" reports
that it cannot reach a server.

To deploy a new version, build the folder and upload it:

```sh
npm run release:defender -- --output releases/defender/<release-id>
cd releases/defender/<release-id>
railway link --project defender --service defender   # once per folder
railway up --service defender --ci
```

The same builder can target the RareCandy game host instead (`--target rarecandy`), which publishes
under `/defender/` with `tools/publish-game.mjs` from netherglaive/rarecandy-games.

Bump `PROTOCOL` in `src/games/defender/net/schema.ts` whenever the wire format changes, so open tabs
from an older build refuse the new server instead of misreading it.

## Deploy to GitHub Pages

`npm run deploy` bumps the patch version (or reuses an uncommitted version bump),
builds the site, commits all pending changes, pushes the current branch to `origin`,
and publishes `dist` to the `gh-pages` branch.

Snapforge recipe compilation is skipped during builds when its recipes, generated
levels, and compiler inputs have not changed. The site still needs a Vite build to
include other source changes and the new version.

https://farhadsafikhani.github.io/arcade/
npm run deploy

