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

Co-op is hosted on the RareCandy game host (https://rarecandy.ca/game-host/) as the `defender` slug,
at https://games.rarecandy.ca/defender/. GitHub Pages serves only static files, so the arcade copy of
Defender there is solo only: "Defend together" reports that it cannot reach a server.

Build a release, then publish it with the host's client from a clone of netherglaive/rarecandy-games:

```sh
npm run release:defender -- --output releases/defender/<release-id>
node tools/publish-game.mjs --slug defender --directory <path-to>/releases/defender/<release-id>
```

Publishing needs `GAME_HOST_URL` and a game-scoped `GAME_HOST_TOKEN` for `defender` in the environment.
Never commit or paste the token. Each release ID must be new. Bump `PROTOCOL` in
`src/games/defender/net/schema.ts` whenever the wire format changes, so open tabs from an older
release refuse the new server instead of misreading it.

## Deploy to GitHub Pages

`npm run deploy` bumps the patch version (or reuses an uncommitted version bump),
builds the site, commits all pending changes, pushes the current branch to `origin`,
and publishes `dist` to the `gh-pages` branch.

Snapforge recipe compilation is skipped during builds when its recipes, generated
levels, and compiler inputs have not changed. The site still needs a Vite build to
include other source changes and the new version.

https://farhadsafikhani.github.io/arcade/
npm run deploy

