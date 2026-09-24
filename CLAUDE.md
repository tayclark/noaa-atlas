# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

NOAA Atlas is a client-only React SPA that answers "which NOAA API do I use for X?": a force-directed graph of curated NOAA services linked to a MapLibre globe. There is no backend, no accounts and no API keys. The only live integration is `api.weather.gov`, called from the browser; every other service is reference data with a static sample. `README.md` is the user-facing feature tour and the data field reference, so read it rather than duplicating it here.

Stack: React 19, TypeScript, Vite, MapLibre GL, d3-force / d3-zoom / d3-drag (SVG graph), zod, Vitest + Testing Library, Playwright. Node 22 (`.nvmrc`).

## Commands

- `npm run dev`: Vite dev server (port 5173)
- `npm run build`: `tsc -b` + `vite build`
- `npm run typecheck`: `tsc -b`
- `npm run lint`: oxlint. No Prettier or other formatter is configured, so match the surrounding style by hand.
- `npm test`: Vitest. For a single file use `npx vitest run src/data/buildGraph.test.ts`, and for a single test add `-t "<name>"`. The output is long, so pipe it through `grep -E "Test Files|Tests "` for the counts.
- `npm run test:coverage`: 75% gate on lines, statements, functions and branches. `MapLibreGlobe.tsx` and `GraphView.tsx` are excluded (`vite.config.ts`) and covered by e2e instead.
- `npm run test:e2e:mocked` runs Playwright against mocked NWS responses. `npm run test:e2e:live` runs only the `@live`-tagged specs against the real API.
- `npm run coverage-geometry -- --preset <us-coastal-waters|contiguous-us|alaska|hawaii|worldwide> --out file.json`: writes schema-valid coverage geometry.

CI (`.github/workflows/ci.yml`) runs on every PR and on pushes to `main`. The `ci` job runs typecheck → lint → `test:coverage` → build, and the `e2e` job runs Playwright in Chromium. Both must pass.

## Architecture

- **Data** (`src/data/`): `graph.json` (service nodes plus authored `shared-id` / `data-flow` edges) and `tasks.json` (the "I need..." tasks) are validated with zod at load time (`graphSchema.ts`, `taskSchema.ts`). `buildGraph.ts` derives the theme hubs and theme edges, so don't author them in the JSON. A malformed entry fails the tests and the build.
- **State**: there is no state library. Shared state lives in small module-level stores (`selectionStore.ts`, `requestLog.ts`) that components read with `useSyncExternalStore`. Selection is a single value (a node, a globe point or a task), which keeps the finder, graph, detail panel and globe in agreement.
- **Live client**: `nwsClient.ts` validates every response with zod (`nwsSchema.ts`), caches successful GETs in memory for 60s and logs each request to `requestLog.ts` for the Inspector tab. Browsers can't set `User-Agent`, so it sends `Accept: application/geo+json`.
- **Imperative wrappers stay thin**: `GraphView.tsx` (d3) and `MapLibreGlobe.tsx` (MapLibre) own the DOM and map. The logic lives in pure, unit-tested modules beside them: `graphLayout.ts`, `labelPlacement.ts` and `searchMatch.ts` for the graph; `nwsAlertsLayer.ts`, `nwsPointLookup.ts` and `coveragePopup.ts` for the globe. New logic goes in a pure module, not in the wrapper.
- **Graph internals** (`GraphView.tsx`):
  - The simulation is created once. The ResizeObserver on `.graph-canvas` only re-frames the view and does not restart the layout.
  - Label placement runs imperatively through `placeLabelsRef`: on zoom (rAF-throttled), every 20 ticks, on simulation end, and in the label-priority effect keyed on `[highlightKey, matchedIds]`.
  - Never add `matchedIds` to the pan effect, because every search keystroke would then reset the user's pan and zoom.
  - The detail panel renders only for service nodes (theme hubs have none). Its box is an obstacle for labels, and it sets the inset passed to `computeFitTransform(..., inset)`, so a selection is framed beside the panel.

## Curating services

The workflow is in the README ("Adding or editing services"). Beyond that:

- **Schema**: when `liveLayer` is false, `notLiveReason` is required. `shortName` (24 characters or fewer) is optional and used only for the on-graph label; give one to any new long-named node. Every authored edge needs a `sourceUrl`.
- **`graph.json` formatting**: the file is `json.dumps(indent=2, ensure_ascii=False)` with coordinate pairs collapsed onto one line (regex `\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]` → `[\1, \2]`) and a trailing newline. That round-trips the file exactly, so edit it with a script that asserts the round trip first, not by hand.
- **`tasks.json`**: compact one-line node entries, edited by hand. `tasks.test.ts` fails if a task references an unknown node id.
- **Verify for real, not from docs**:
  - Check CORS with a real GET: `curl -D - -o /dev/null -H "Origin: http://localhost:5173" '<url>'`, then look for `access-control-allow-origin`. A HEAD can behave differently from a GET, and POST-only APIs need a real POST.
  - Curl a real response before writing `sample.responseExcerpt`. Many doc-linked URLs 404, 410 or 503, and WebFetch/WebSearch summaries can be stale or misleading.
  - In zsh, quote any URL containing `?` or `&`.

## Testing

- Component tests opt into jsdom per file (`// @vitest-environment jsdom`), and the default environment is `node`. jsdom has no ResizeObserver.
- `useSyncExternalStore` tests: mutate the store before `render()`, or wrap the change in `act()`.
- oxlint also flags hook-dependency and ref-in-render issues, and `erasing-op` (e.g. `k * 0` in a test).
- e2e node selection: use the keyboard (`focus()` + Enter on `.graph-node[data-node-id=...]`). The graph re-frames after every selection, so a clicked node can end up under the globe canvas.
- Graph layout changes: check both Playwright's default 1280x720 viewport (a tight canvas, about 640x352) and a larger one such as 1400x900.
- e2e runs against the dev server, not `vite preview`, because the production build doesn't emit MapLibre's worker (see `playwright.config.ts`).
- If port 5173 is taken, start `npx vite --port 5199 --strictPort` and run Playwright against a temporary copy of `playwright.config.ts` with the port swapped (keep `reuseExistingServer` true). Delete the copy afterwards.
- For scripted browser checks, Playwright is importable from `node_modules/playwright/index.mjs`.

## Conventions

- Conventional Commits with the issue number as a suffix, e.g. `fix(graph): frame a selection beside the detail panel (#141)`. Branches: `feature/`, `fix/`, `chore/`, `docs/`.
- When user-visible behaviour changes, update `README.md` in the same PR.
- `SESSION_NOTES.md` is an intentionally untracked scratch file for session hand-off. Never stage it.
