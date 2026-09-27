# jsm-options.com — Builder + Simulator pages

Upload these three files (replacing the old single-file builder):

| File | Deploy to |
|---|---|
| `assets/jsm-options-engine.js` | `/assets/jsm-options-engine.js` (same folder as `site.js`) |
| `builder/index.html` | `/builder/index.html` (replaces the old builder file) |
| `simulator/index.html` | `/simulator/index.html` (new page) |

How it works
- Both pages load the same engine (`/assets/jsm-options-engine.js`). The engine
  detects which sections exist in the DOM and only updates those.
- The Builder keeps: templates, live chain, legs editor (A/B compare), payoff
  chart with compact summary, and the strategy guide drawer. New: visible
  "Days remaining" / "Underlying" sliders under the payoff chart, and a
  📊 Analyze → button that opens the position in the Simulator (new tab).
- The Simulator receives the position via `?setup=<token>` (same encoding as
  Share link). It shows: assumptions, full position summary, Greeks, and the
  day-by-day simulator with IV shock. "Next earnings" / "Ex-dividend" dates in
  Assumptions draw E / D markers on the simulation day-axis (also carried in
  the share token).
- Opening `/simulator/` with no `?setup=` shows a friendly empty state.

If you deploy the simulator somewhere other than `/simulator/`, update the
`ANALYZER_URL` constant at the bottom of `jsm-options-engine.js`.
