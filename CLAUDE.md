# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

GeoDoodle is a Turkish-first, bilingual (tr/en) PWA game where players draw country/province borders from memory or by tracing, and get scored on accuracy. Vanilla JavaScript SPA (no framework), built with Vite, with a single runtime dependency (`perfect-freehand`). A tiny Go binary serves the built `dist/` folder in production (Railway, via the multi-stage `Dockerfile`).

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — build to `dist/`
- `npm run preview` — preview the production build
- `npm test` — run the Vitest suite (currently covers `ComparisonEngine`; run a single file with `npx vitest run src/engine/comparison-engine.test.js`)
- `go run main.go` — production static server for `./dist` (run `npm run build` first; listens on `$PORT`, default 8080; serves gzip + immutable cache headers for `/assets/`)
- `node scripts/generate_geo_data.js` — regenerate `src/data/countries.js` and `src/data/turkey-provinces.js` from remote GeoJSON sources

No linter is configured.

## Git rules (from .agents/AGENTS.md)

- **NEVER** autonomously run `git add`, `git commit`, or `git push`.
- After completing a task, summarize the changes and get the user's explicit approval before any commit/push.

## Architecture

**Screen router (`src/main.js`)** — `GeoDoodleApp` owns a `GameState` instance and one instance of each screen. Screens live in `src/screens/`; each takes the app in its constructor and exposes `render(...)` returning a DOM element, which `app.navigateTo()` swaps into `#app`. Navigation flow: home → levelSelect → game → (handoff for 2-player) → result → stats. Screens build DOM imperatively (`document.createElement` / `innerHTML`), no templating.

**Engine layer (`src/engine/`)** — the core of the game, shared by screens:
- `game-state.js` — all persistent state under localStorage key `geodoodle_state` (theme, language, unlocked levels, best scores, hints) plus a non-persisted `session` object for the current round (player count, per-player scores, current region/mode). Has a simple listener/notify system for reactive UI.
- `canvas-manager.js` — wraps a canvas per screen: DPR scaling, ResizeObserver-driven resize, page→canvas coordinates, and `normalizePathToCanvas()` which scales a region's raw points to fit the canvas with padding. Both rendering and scoring depend on this same normalization.
- `drawing-engine.js` — pointer-event drawing (touch + mouse) with perfect-freehand smoothing, brush sizes, eraser (strokes with `color: 'eraser'`), undo/redo. Re-renders on canvas resize.
- `comparison-engine.js` — scoring: applies eraser strokes to the point set chronologically, resamples the user's strokes and the normalized target path to 60 equal-distance points each, then measures deviation symmetrically (user→target AND target→user, so partial tracings are penalized; no Procrustes alignment — position/size on canvas is intentionally part of the score). Returns `{ score, rank, visualData }`; `visualData` drives the result screen's overlay rendering (rays are user→target only). Ranks come from `getRank()` in `src/data/levels.js`. Unit-tested in `comparison-engine.test.js` via DOM-free stubs.

**Data (`src/data/`)** — `countries.js` and `turkey-provinces.js` are **generated files** (each region: id, bilingual name, difficulty, funFact, and a point-array border path); edit region metadata in `scripts/generate_geo_data.js` and regenerate rather than hand-editing paths. `levels.js` is hand-maintained: level sections referencing region ids, star-gated progression (`requiredStars`), the two modes, and the `RANKS` table.

**Game modes** — `'trace'` (Eğitim: target border visible, trace it) and `'blind'` (Hafıza: draw from memory). 1 or 2 players; 2-player rounds go through the handoff screen between turns and the result screen compares scores.

**i18n (`src/i18n.js`)** — module-level current language (`tr` default) with a flat translation dictionary; `t(key)` for UI strings. Data records carry bilingual fields (`name`/`nameEn`, `sectionName`/`sectionNameEn`) chosen at render time. Any new UI string needs both tr and en entries.

**Conventions to keep in mind:**
- Theming is `data-theme="day"|"night"` on `<html>`; styles in `src/styles/`. The drawing engine also has its own theme setting that must be updated on toggle (see `createTopControls` in `main.js`).
- Icons are Lucide, bundled from npm: `main.js` imports only the icons in use and exposes a `window.lucide.createIcons()` shim for the screens. **When adding a new `<i data-lucide="...">` icon, also add its PascalCase import to the icon map in `main.js`** or it won't render.
- The Outfit font is self-hosted via `@fontsource/outfit` imports in `main.js` — no CDN requests at runtime.
- Hints: per-game allowance (3) lives in `GameScreen` and resets in `render()`; `GameState.recordHintUsed()` only tracks the lifetime counter for stats.
- PWA bits live in `public/` (`manifest.json`, `sw.js`); the service worker is registered in `main.js`. HTML is network-first, everything else cache-first — bump `CACHE_NAME` only on breaking cache changes.
- `scratch/` holds one-off data-fetching scripts; `data-sources/` holds raw geo-data artifacts (not app inputs).
