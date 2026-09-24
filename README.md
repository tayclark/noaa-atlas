# NOAA Atlas

A linked globe and graph that answers "which NOAA API do I use for X?".

- The **graph** is the NOAA API ecosystem: a curated set of services (owner, base URL, formats, auth, coverage, freshness, sample call) grouped by theme and connected where a documented relationship exists.
- The **globe** shows NOAA APIs in action: a live layer of active National Weather Service alerts, click-anywhere point lookups, and the geographic coverage of whichever service you select.
- The two are linked. Select something on one side and the other reacts.

It is a client-only single-page app. There is no backend, no accounts and no API keys; live data comes straight from `api.weather.gov` in the browser.

```sh
npm install
npm run dev     # local dev server (http://localhost:5173)
npm test        # unit tests
npm run build   # typecheck + production build
```

Requires Node 22 or newer (`.nvmrc`, `engines`).

## What you see

The window is split into two resizable panes: the left pane has two tabs, **Explore** and **Inspector**, and the right pane is the globe. Drag a divider to resize, or focus it and use the arrow keys (`Home` and `End` jump to the limits).

## Explore tab

Explore stacks the task finder above the graph, with a draggable divider between them, so picking a task highlights its path in the graph without switching tabs.

### "I need..." task finder

A list of common tasks under **I need to…** ("Get today's local forecast", "Get deep-ocean tsunami buoy readings", "Look up historical daily temperature or rainfall for a station", and so on). Until you pick one, the space below the list explains how to read the app. Picking a task:

- shows the recommended nodes as numbered steps, the first marked **Primary** and the rest **Also**, each with a one-line reason;
- highlights the whole path in the graph and draws connector lines between the steps;
- clicking a single step narrows the selection to that one node, which opens its detail panel and flies the globe to it.

### Graph

A force-directed graph of the curated services.

- **Nodes** form one tree: **NOAA** sits at the centre, each theme hub links to it, and every service links to its theme hub. Services are coloured by theme; the root is neutral and the largest, and theme hubs are larger than services.
- **Links** come in four types (see the **Legend** button): *NOAA → theme* and *Theme → service* (both derived automatically), *Shared identifiers* (services that use the same identifiers) and *Data flows into* (one service republishes or feeds another). The last two only exist where a source documents the relationship.
- **Navigate** by dragging the background to pan, scrolling or pinching to zoom (0.25x to 4x), and dragging a node to rearrange it. **Fit** re-frames the whole graph. The graph frames itself automatically until you pan or zoom.
- **Search** filters as you type. Every word must match somewhere in a node's name, summary, tags, formats, owner office or program, theme label, or the label of a task that uses it. Non-matches are dimmed and the match count is announced. `Esc` clears the box.
- **Select** a node by clicking it, or by focusing it with `Tab` and pressing `Enter` or `Space`. The view frames the node with its neighbours.

### Node detail panel

Selecting a node opens a panel over the graph:

- name and a **Live** or **Available, not live yet** tag;
- owner (NOAA office and program), base URL, formats, auth requirement, rate limits, coverage summary, freshness, and the date the entry was last verified;
- **Sample call**: the request URL, **Copy as curl** and **Copy as fetch** buttons, and a static response excerpt. Nodes with a live client (currently the NWS API) also get **Run sample**, which makes the real call and shows the parsed response;
- **Relationships**: neighbours grouped by edge type, with direction, the reason for the link and a link to the source that documents it. Click a neighbour to jump to it;
- for services that are not on the map yet, the reason why;
- a link to the official docs.

Selecting a theme hub opens the same panel with a one-line description of the theme, how many of its services are live, and a list of its services. Click a service to jump to it.

Selecting the **NOAA** root opens an overview: how many services there are and how many are live, and every theme with its service count. Click a theme to jump to its hub.

## Inspector tab

A network log of every live `api.weather.gov` request the app makes (alerts, point lookups, forecasts, observations), newest first, capped at the last 50.

- The tab shows how many requests are logged, and a toolbar above the list has the count and a **Clear** button.
- Each row shows the status (`200 OK`, `403 Error`, `Parse error`, `Network error`), the request path and the time. Rows start collapsed.
- Clicking a row expands it in place (click again to collapse; one row is open at a time) to show the full URL, the request headers (folded) and the response.
- The response is a foldable tree: the top-level keys are shown, nested objects and arrays are folded to a summary such as `[…] 467 items`, and long arrays show 20 items at a time behind a **Show more** button. A failed call shows its error message instead.
- **Copy as curl** and **Copy as fetch** reproduce the request outside the app.

## Globe

A 3D globe (MapLibre GL, OpenFreeMap dark basemap) that opens on the continental US.

- **Active alerts layer.** Current NWS alerts are drawn as polygons coloured by severity (Extreme, Severe, Moderate, Minor, Unknown). Click a polygon for the event, affected area and effective/expiry times. Alerts that have no geometry (zone-only) cannot be drawn, so they are listed in an overlay instead, five at a time with a "N more" toggle. The overlay's header shows the count and can collapse the overlay to its title bar. If the fetch fails or nothing is active, the overlay says so.
- **Click anywhere for a point lookup.** A popup shows the current forecast period and the nearest station's latest observation (temperature normalised to Fahrenheit, wind, conditions and observation time), followed by **APIs covering this point**: every service in the graph whose coverage contains the spot, each marked live or "available, not live yet". Errors (rate limiting, 403s, unexpected responses) are reported in the popup rather than failing silently.
- **Locate me.** The navigation-arrow button (top right) asks the browser for your precise location (GPS where the device has it), flies there, marks the spot with an accuracy circle and runs the same point lookup. If location access is blocked or times out, a note says why.
- **Linked selection.** Selecting a graph node flies the globe to that service's coverage and shows a status card: "Live layer highlighted below." (and the alerts layer is emphasised) for live nodes, otherwise the reason it is not on the map yet. Going the other way, clicking the globe (or an alert polygon) selects that point and highlights every graph node that covers it.

Selection is a single shared state (a node, a globe point, or a task at any one time), so the finder, graph, detail panel and globe always agree.

## Data

The graph is authored as JSON and validated with [zod](https://zod.dev) at load time, so a malformed entry fails tests and the build rather than rendering wrong.

| File | Contents |
| --- | --- |
| `src/data/graph.json` | Service nodes and the authored edges (`shared-id`, `data-flow`). Theme hubs and theme edges are derived in `buildGraph.ts`. |
| `src/data/tasks.json` | "I need..." tasks, each an ordered list of node ids with a one-line reason. |
| `src/data/graphSchema.ts`, `taskSchema.ts` | The schemas and the list of themes. |

The NOAA root, the theme hubs and the edges linking them are derived in `buildGraph.ts`, never authored; the id `noaa` and the `theme-` prefix are reserved.

Themes: Weather & forecast, Climate & historical, Ocean & coastal, Satellite & radar, Space weather, Models & gridded data, Hazards, Fisheries & ecosystem, Geospatial services, Catalogs & meta. A theme with no services yet still appears in the legend.

A service node records: `id`, `name`, `summary`, `owner` (office and program), `theme`, `baseUrl`, `formats`, `auth` (`none`, `token` or `key`), `coverage` (a GeoJSON Polygon or MultiPolygon), `freshness` (cadence such as realtime, hourly, daily), `docUrl`, `lastVerified`, `liveLayer`, optional `rateLimits`, `sample` (URL, headers, real response excerpt) and `tags`. A node that is not a live map layer must give a `notLiveReason`. Every edge needs a `sourceUrl` documenting the relationship.

### Adding or editing services

1. Verify against the official docs and with real requests: check the response, the CORS headers (`curl -D - -o /dev/null -H "Origin: http://localhost:5173" '<url>'`) and copy a genuine excerpt into `sample.responseExcerpt`.
2. Generate coverage geometry rather than hand-writing it:
   ```sh
   npm run coverage-geometry -- --preset us-coastal-waters --out coverage.json
   ```
   Presets are `us-coastal-waters`, `contiguous-us`, `alaska`, `hawaii` and `worldwide`; `--input <file.geojson>` merges your own polygons. Output is size-limited and schema-valid.
3. Add the node to `graph.json`, then add or extend a task in `tasks.json` (its node ids must exist).
4. Run `npm test`: the schema and task tests fail on unknown fields, missing `notLiveReason`, duplicate ids or dangling references.

## Live data and limits

- The only live integration is `api.weather.gov`, through a typed client (`src/data/nwsClient.ts`) that validates every response with zod and caches successful GETs in memory for 60 seconds.
- Browsers cannot set the `User-Agent` header NWS asks for, so the client sends the documented `Accept: application/geo+json` header instead.
- NWS rate limits or 403s surface as readable messages in the alerts overlay, point popup and Inspector.
- Every other service in the graph is reference data only. Its sample is a static excerpt, and it is marked "not live yet" with the reason.

## Project layout

```
src/
  components/
    LeftPanel.tsx        Explore / Inspector tabs
    SplitPane.tsx        resizable, keyboard-accessible divider
    finder/              "I need..." task finder
    graph/               graph view, search, legend, node detail, sample, relationships
    inspector/           request log viewer
    globe/               MapLibre globe, alerts layer, point lookup, coverage popup
  data/                  graph/task JSON + schemas, NWS client, request log,
                         selection store, coverage geometry and lookup
e2e/                     Playwright specs and fixtures
scripts/                 coverage-geometry generator
```

Stack: React 19, TypeScript, Vite, MapLibre GL (globe), d3-force / d3-zoom / d3-drag (graph, rendered as SVG), zod (validation). There is no state library: shared state lives in small module-level stores (`selectionStore.ts`, `requestLog.ts`) read with `useSyncExternalStore`.

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and production build |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | oxlint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:coverage` | Unit tests with a 75% gate on lines, statements, functions and branches |
| `npm run test:e2e:mocked` | Playwright against mocked NWS responses |
| `npm run test:e2e:live` | Playwright tests tagged `@live` that hit the real NWS API |
| `npm run coverage-geometry` | Coverage geometry generator (see above) |

The Playwright config starts the dev server on port 5173 (reusing one if it is already running). If another app holds that port, run `npx vite --port 5199 --strictPort` and point a copy of the config at it.

`MapLibreGlobe.tsx` and `GraphView.tsx` are excluded from the coverage gate because they are imperative wrappers around MapLibre and d3; their pure logic lives in separate, unit-tested modules and the components themselves are covered by the Playwright specs.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and push to `main`:

- **ci**: typecheck, lint, unit tests with the coverage gate (summary posted to the run), production build.
- **e2e**: Playwright (Chromium) with the report uploaded on failure.
