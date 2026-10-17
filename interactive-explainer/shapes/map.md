# Map ("where")

Start: `node scripts/build.js new map page.html` (demo: illustrative fire clusters in six countries, a uniform wind, smoke
reaching one city). Runtime: `<style data-ie="map">`, `<script data-ie="geo-world110m">` (world countries, 109 KB), `<script data-ie="map">`.

## When to pick it
The source says *where*: "values by country / region / district", "flows from A to B", "the wind carries it to…",
"hotspots near…", "routes", "how far". If geography is only a label (a list of countries with numbers, nobody asks where
they are), a bar chart is clearer: use the comparison shape. Use at most two shapes: the map plus one linked chart.

## Model
Pure functions keyed by region id (ISO3 for countries, the source's own codes for districts): values per region, plus
points (lon/lat) and flows. If the source gives points (stations, fires, clinics), aggregate them per region with
`IE.map.locate` and check the totals against the source's table. Spatial rules (distance decay, wind alignment) use
`IE.map.distance` / `bearing` (great circle, km) inside model.js, or a copy of them so Node can run it without the DOM.

## Main view and selection
- **Choropleth** (`values` + `scale`): 5 classes on `seq1…seq5`; **diverging** (`type: 'div'`) for signed change (warm s2
  below `mid`, cool s1 above, grey in between). Fix `breaks` when the reader compares scenarios, or colours drift with the data.
  Categorical fills (`fill: id => 's1'…`) use **at most 3 colours**: on a map every pair can touch.
- **Proportional symbols** (area ∝ value), **labelled points** (cities: small states such as Singapore are not polygons at
  110m), **flows** (great-circle arcs with arrowheads, width ∝ value), **vector field** (wind arrows on a screen grid).
- **Selection = picked region id.** Clicking a coloured region, a symbol or a bar sets it; ← → cycle regions in value
  order (`sel.stepBy` + `IE.map.cycle`); `IE.map.browse` adds a rank slider (marked `data-time`, so check.js tests the keys).
  Keep the selection a **non-numeric string** (ISO3, not "360"): the URL hash turns numeric strings into numbers.
- Linked views: a bar chart of the same values (`onPick` = same selection), a detail card (`IE.map.card`), and the
  step-up chart (the outcome across a parameter, e.g. every wind direction). Zoom buttons call `map.zoomTo(bounds)`.

## What-if and tour
What-if = switch a source off (no fires in X), change the driver (wind direction, a tax rate), or compare years.
Tour: the whole region and what is measured → **one concrete place** (zoom in, follow one cluster/route with its numbers)
→ each driver on its own → who contributes (bars, totals add up) → **step up** across the range near the end.

## Module API (`IE.map`)
```js
IE.map.world()                                   // vendored 110m countries: features with properties.name, .a3 (cached)
IE.map.decode(topology, 'objectName')            // TopoJSON -> GeoJSON FeatureCollection (quantized arcs ok)
IE.map.fit(name, [[w,s],[e,n]], W, H, pad)       // -> { project([lon,lat]) -> [x,y], invert, scale }; name: naturalEarth|mercator|equirect
IE.map.projections[name].fwd(λ, φ) / .inv(x, y)  // raw, radians
IE.map.distance(a, b) km · .bearing(a, b) deg · .gc(a, b, n) points · .area(feature) km² · .bbox(feature)
IE.map.contains(feature, [lon,lat]) · .locate(features, [lon,lat]) -> feature | null
IE.map.breaks(values, n, 'nice'|'quantile'|'equal') · .scale({ type:'seq'|'div', values, n, breaks, mid, fmt }) -> { color(v), classes }
IE.map.order(values) -> ids by value (desc) · .cycle(order, cur, dir) · .card(host, { title, rows: [[k, v]], note })
IE.map.browse(host, app, { order: () => ids, name: id => text, label })   // rank slider, data-time
const map = IE.map.view(host, {
  title, summary, projection: 'naturalEarth', bounds: [[89,-10],[125,24]] | 'world' | ['IDN','MYS'], height?, maxHeight: 560,
  values: { IDN: 171, MYS: 0 }, scale: IE.map.scale({ breaks: [5, 20, 50, 100] }), unit, names: { IDN: 'Indonesia' },
  labels: ['IDN', …], labelAt: { IDN: [114, -1] }, legend: { title, items: [{ circle|arrow|line|dot|swatch: 's2', label }] },
  symbols: [{ id, lon, lat, value, pick, aria }], symbolMax: 20, symbolRef,
  points: [{ id, lon, lat, label, color: 'ink', r }], flows: [{ from, to, value, color, bend: 0.18 }], flowMax: 8, flowRef,
  field: { at: (lon, lat) => [u, v] | null, spacing: 46, ref: 6 }, selected: 'IDN', onPick: (id, kind) => …,
});
map.set({ selected }) /* cheap: selection + labels */; map.set({ values, flows, field }) /* only those layers */
map.zoomTo(bounds) /* animated; instant under reduced motion */; map.feature(id), map.resolve(id|a3|name), map.name(id), map.project/invert
```
Values, labels and selection accept the feature id ("360"), the ISO3 code or the name. Picks report the feature id
(`kind` 'region'), or your `pick` value for symbols ('symbol'), points ('point') and flows ('flow').
Symbols and flow widths shrink on narrow maps; country labels are dropped where they would collide.

## Finer or other geography (vendored, offline)
World 110m is enough for countries. For 50m countries, provinces or a city's districts:
1. Download into a **new empty temp folder** (e.g. `world-atlas@2/countries-50m.json`, ~750 KB, or an open-data portal's
   GeoJSON/TopoJSON). Read its licence; inspect ids, names and the object name in Node (`-I`, script kept elsewhere).
2. Keep only what the page needs (drop far regions, round coordinates to 3–4 decimals, or simplify with mapshaper).
3. Write `districts.js` next to the page (or in the `--from` folder): a licence/attribution header, then
   `IE.geo = IE.geo || {}; IE.geo.districts = {…};`. Add `<script data-ie-file="districts.js"></script>` after the map
   module and build with `--from`; the page stays one offline file.
4. `features: IE.map.decode(IE.geo.districts, 'objectName')` for TopoJSON, or the FeatureCollection itself for GeoJSON
   (lon/lat, WGS84). Drop the geo-world110m block if the page does not need the world.

## Validation ideas
- Totals per region from point-in-polygon equal the source table (the demo's first row); shares add up to the total.
- Projections round-trip known points (`invert(project(p))`, < 1e-9°); the subject sits inside the fitted frame.
- Areas from the polygons within ~6% of a gazetteer (110m simplification: Indonesia −4%, Malaysia +3%, Australia −0.5%).
- Distances: a quarter of the equator = πR/2; the source's quoted distances within the stated rounding.
- Model rules in words ("wind from the NE: no Sumatran smoke arrives") as exact checks.

## Pitfalls seen building it
- **Never write a runtime block tag (`<script data-ie=…>`) inside an HTML comment**: build.js matches it and swallows the
  page up to the next `</script>`. Describe blocks in words in comments.
- Rings crossing ±180° (Russia, Fiji, Antarctica) draw a stripe across the map unless split; the module splits them.
  The central meridian is fixed at 0°: Pacific-centred views need re-cut data. Bounds from ids of countries that span the
  antimeridian (Russia, USA, Fiji) fall back to the world: give explicit bounds instead. Mercator is clamped at ±85°.
- Countries entirely outside the view are `display:none` (check.js counts off-screen shapes as empty space otherwise).
- 110m has no Singapore, Hong Kong, Bahrain…: draw them as points. Kosovo/N. Cyprus/Somaliland have no numeric id
  (keyed by name; Kosovo a3 = XKX). Natural Earth draws de facto borders: say so if a border matters to the reader.
- A wide validation table made the phone page scroll sideways (core.css `.tablewrap` lacks `position:relative`);
  map.css adds it.
- View options (show wind, show flows) do not trigger `recompute`: redraw those layers from `render` with a change key.
- Colour symbols and flows with the same hue only when they mean the same thing (here: smoke); never more than 3 hues.
