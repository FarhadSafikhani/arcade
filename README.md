# Arcade

Set of classic Arcade games, mostly vibe coded.


## Description

##to serve and develop locally on http://localhost:3000/
npm run dev 


##to build and preview on http://localhost:4174/
npm run build
npm run preview

## Deploy to GitHub Pages

`npm run deploy` bumps the patch version (or reuses an uncommitted version bump),
builds the site, commits all pending changes, pushes the current branch to `origin`,
and publishes `dist` to the `gh-pages` branch.

Snapforge recipe compilation is skipped during builds when its recipes, generated
levels, and compiler inputs have not changed. The site still needs a Vite build to
include other source changes and the new version.

https://farhadsafikhani.github.io/arcade/
npm run deploy

