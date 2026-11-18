# Perseverance: 3D Mars Rover Simulation

## Goal

Build a 3D simulation of NASA's Perseverance rover exploring the surface of Mars, running in the browser. The scene should look **cinematic**: dunes, red rocks, dusty atmosphere, warm afternoon sun with soft shadows, and Mars's two moons. The user can drive the rover around the procedurally generated terrain and switch between camera views.

## Stack

- HTML + JavaScript (ES modules)
- [Three.js](https://threejs.org/) for 3D rendering
- [Vite](https://vitejs.dev/) as dev server and bundler (`npm run dev`)
- `simplex-noise` for terrain, rocks and moons
- `playwright-core` (dev) for `npm run check`, using the system Chrome (never download browsers)
- No other frameworks unless clearly needed

## Prerequisites

- Node.js (LTS) via **fnm** (installed in `~/.local/share/fnm`, set up in `~/.zshrc`). In a non-interactive shell: `export PATH="$HOME/.local/share/fnm:$PATH" && eval "$(fnm env --shell bash)"`.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start dev server (http://localhost:5173)
- `npm run build` — production build into `dist/`
- `npm run preview` — serve the production build
- `npm run check` — opens the page in headless system Chrome (playwright-core, `channel: 'chrome'`, no browser download), waits for `window.__ready`, drives with `CHECK_KEYS` (default `KeyW:5000,KeyW+KeyA:3000,KeyW:2000`), saves `screenshots/check.png`, prints `[…]` page logs + `window.__checkInfo()` (fps, distance, position) and console errors/warnings (exit 1 if any). Run after every big change and look at the screenshot.

## Project structure

```
perseverance/
├── index.html          # Canvas container, vignette overlay, empty favicon (avoids 404)
├── package.json        # scripts: dev, build, preview, check
├── scripts/
│   └── check.mjs       # Headless Chrome check: screenshot + console errors     ✅
├── screenshots/        # check.png output (git-ignored)
├── src/
│   ├── main.js         # Renderer, scene, camera, lights, shadows, render loop   ✅
│   ├── terrain.js      # Heightmap mesh, vertex colors, heightAt(x, z), mulberry32 ✅
│   ├── sky.js          # Sky dome shader (gradient, sun disc + halo), Phobos & Deimos ✅
│   ├── rocks.js        # Instanced rocks and boulders                            ✅
│   ├── dust.js         # Floating dust particles + low dust clouds               ✅
│   ├── style.css       # Fullscreen canvas + cinematic vignette                  ✅
│   ├── rover.js        # NASA GLB rover: load, mast deploy, driving, terrain fit, camera list ✅
│   ├── controls.js     # Keyboard input (WASD / arrows) → throttle/steer          ✅
│   ├── tracks.js       # Tire-mark ribbons with tread texture                     ✅
│   ├── panel.js        # Mission control panel (view): 4 real data points, T to hide ✅
│   ├── cameraCards.js  # 4 camera cards: hover = spotlight + glow + guide line on the rover part ✅
│   ├── photoViewer.js  # Shutter → flash → gradual reveal of real NASA photos, ‹ › and ✕   ✅
│   ├── data/photos.json # Curated real photos per camera (metadata from NASA raw_images API)
│   ├── telemetry/      # Open MCT-style telemetry                                ✅
│   │   ├── telemetryApi.js   # addProvider / getMetadata / request / subscribe
│   │   ├── nasaWaypoints.js  # Provider: NASA M20 waypoints (distance, elevation, slope)
│   │   ├── lightTime.js      # Provider: Earth–Mars light time, computed live (JPL elements)
│   │   └── mission.js        # Sol ↔ Earth date (sol 0 = landing day 2021-02-18)
│   ├── cameras.js      # Orbit, follow and mast camera modes                      ⏳
│   └── hud.js          # Speed / position / heading overlay                       ⏳
└── public/
    ├── models/perseverance.glb  # Official NASA model (NASA-3D-Resources), Draco-compressed, meters
    ├── draco/                   # Draco decoder copied from three/examples/jsm/libs/draco/gltf
    └── data/M20_waypoints.json  # Offline copy (554 final waypoints, no images) used if NASA is unreachable
```

## Conventions

- One module per responsibility (see structure above). Each module exports a `createX(...)` factory; modules that animate return an `update(dt)`.
- Units are **meters**, time in **seconds**. Use `dt` from `THREE.Timer` (clamped to 0.1 s) for all motion so it's frame-rate independent.
- Deterministic randomness: use `mulberry32(seed)` from `terrain.js` (never `Math.random`) so the landscape is identical on every load and screenshots are comparable.
- Real rover dimensions for reference: ~3.0 m long, ~2.7 m wide, ~2.2 m tall (to top of mast), wheels ~0.53 m diameter. Max real speed is ~0.042 m/s; the sim can use a faster, playable speed (~2–5 m/s) with a constant to tweak.
- Coordinate system: Y is up, rover forward is -Z in its local space. The default view looks toward -Z (sun and moons are in that direction).
- Keep magic numbers as named constants at the top of each module.
- Code comments in Spanish, identifiers in English.
- **Verification loop:** after every big change run `npm run check`, look at `screenshots/check.png`, fix; max 3 rounds per feature. Done = no console errors/warnings and the screenshot shows what was asked.

## Work plan

### Phase 1 — Project base ✅
Done by hand (no `create-vite` template): `package.json`, `index.html`, `src/main.js`.
- Deps: `three`, `simplex-noise`; dev: `vite`, `playwright-core`.
- `WebGLRenderer` with ACES filmic tone mapping (exposure 1.05), `PCFShadowMap`, resize handling.
- `OrbitControls` with damping, `maxPolarAngle` ≈ 0.53π, and a clamp that keeps the camera ≥ 1 m above `heightAt`.
- Render loop via `renderer.setAnimationLoop` + `THREE.Timer`.
- `npm run check` (`scripts/check.mjs`): playwright-core with `channel: 'chrome'` (system Chrome, headless, SwiftShader WebGL), 1600×900, waits `CHECK_WAIT` ms (default 4000), saves `screenshots/check.png`, prints console errors/warnings, page errors and failed requests; exits 1 if any.

### Phase 2 — Cinematic Mars landscape ✅
Goal shifted from "basic terrain" to a movie-like scene. Implemented:
1. **Terrain** (`terrain.js`): 900×900 m plane, 512×512 segments. Height = domain-warped *ridged* noise for transverse dunes (~4.5 m) + small dunes + hills growing with distance (from 60 m) + crater rim at 260–420 m (35–60 m high) for a dramatic horizon. Exposes `heightAt(x, z)` (analytic, evaluates the noise directly).
2. **Ground colors**: vertex colors mixing sand `#c0612f`, crests `#d98a4e`, troughs `#7c3218`, rocky slopes `#5a2615` by local height and slope, plus noise variation. Terrain casts and receives shadows.
3. **Sky** (`sky.js`): 1500 m back-side sphere with a shader: butterscotch horizon `#dba57a` → brown zenith `#8f5a40`, wide sun halo + warm corona + sun disc, dusty haze band near the horizon. `FogExp2(horizon color, 0.0042)`.
4. **Sun**: afternoon light, low and in front-left of the camera (`SUN_DIR = (-0.42, 0.16, -0.89)`), color `#ffb36b`, intensity 3.6; soft shadows (4096² map, `radius 5`, ±70 m box centered at (0, y, -10)). `HemisphereLight` `#f2b787` / `#7a3a1e`, 1.1.
5. **Phobos & Deimos**: irregular cratered meshes (displaced icosahedrons, `mergeVertices` for smooth normals), oversized for the shot, hazy emissive tint, `fog: false`.
6. **Rocks** (`rocks.js`): 3 noise-displaced rock shapes × `InstancedMesh`, ~1,400 small rocks + 60 boulders within 220 m, denser near the center, per-instance color tints, cast/receive shadows, kept ≥ 6 m from the start camera.
7. **Dust** (`dust.js`): 4,000 points drifting with `WIND` in a 160×25×160 m box that wraps around, plus 60 large low dust-cloud sprites.
8. CSS vignette overlay.
9. **Checked:** 3 check rounds, no console errors; screenshot shows dunes, rocks, haze, dust, sun, soft shadows and both moons.

Known leftovers (polish, optional):
- Rocks look slightly beige next to the dunes, so tint them redder.
- Slight jagged stair-stepping on far dune crests (mesh resolution), which a normal map or higher-res center patch would fix.

### Phase 3 — Rover model ✅ (official NASA GLB instead of primitives)
- Source: `https://github.com/nasa/NASA-3D-Resources/raw/master/3D Models/Mars 2020 Perseverance Rover/Mars 2020 Perseverance Rover.glb` → `public/models/perseverance.glb` (5 MB, Draco → `DRACOLoader` with local `/draco/`).
- Model is already in **meters**, +Z forward, +X left. Centered on the `Wheels_objs` bbox and placed with wheels at y = 0 inside a `Perseverance` root group. Measured size: 2.70 W × 2.23 H × 3.11 L m (real: 2.7 × 2.2 × 3.0).
- Mast comes **stowed**. The GLB animations `CylinderAction`, `bottomAction`, `Empty.001Action.003`, `topAction`, `Cylinder.002Action` deploy it between t = 1.25–13.75 s (then stow again), so we freeze the mixer at `MAST_POSE_TIME = 7` (Mastcam-Z ≈ 2.03 m high). Arm stays stowed.
- All six wheels are **one mesh** (`Wheels_objs`), so wheels can't spin individually without splitting the geometry.
- **Rover cameras** are logged to the console at load (name, description, local position) and kept in `window.roverCameras` (`{ name: { node, description } }`) for Phase 5: `Mastcam_Z_cams`, `NavCams`, `lens` (SuperCam RMI), `hazcams_front`, `hazcams_rear`, `Up_Look_Camera`, `Down_Look_Camera`, `WATSON`, `PIXL`.

### Phase 4 — Movement ✅
- WASD / arrows (`controls.js`). Speed with inertia (`MAX_SPEED` 2.5 m/s, reverse at half), turns at `TURN_RATE` 0.7 rad/s, also in place.
- Terrain fit: samples the ground under the 4 corner wheels (±1.15 m lateral, ±1.25 m longitudinal), builds the body basis from them, smoothed by slerp.
- `terrain.heightAt` is now **mesh-exact** (interpolates the same triangle that is drawn), so rover and tracks don't float or sink between vertices.
- Physics runs in fixed `SIM_STEP` = 1/60 s substeps (up to 1 s per frame), so movement doesn't depend on fps. This was needed because headless SwiftShader renders at ~1 fps.
- **Tire marks** (`tracks.js`): two ribbons (one per wheel line, 0.42 m wide) added every 0.2 m, 0.025 m above ground + polygon offset, chevron tread canvas texture, ring buffer of 6,000 segments per side.
- **Follow camera**: the camera moves with the rover (you can still orbit with the mouse when stopped); while driving it eases back to 9 m behind, 3.2 m above (`CHASE_*`).
- Sun shadow box (±45 m) and the dust volume follow the rover. Rocks keep 8 m clear around the start camera and the rover start (2, 16), heading π (toward the sun and moons).
- Pending: collision with boulders, keeping the rover inside the dune field (~250 m radius).

### Mission control panel ✅ (Open MCT pattern, see `../openmct`)
- Each data point is an object `{ identifier: { namespace, key } }`; providers say what they support; metadata gives `domain` (sol, utc) and `range` (value + unit). Panel = the view.
- **Real data:** `https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json` (the old `mars.nasa.gov/gmms/...` URL is **404**). Fields used: `dist_total_m` (km), `elev_geoid` (m vs. areoid), `tilt` (°). Use **only `final === "y"`** waypoints; mid-drive ones (`m`/`i`) have distance 0.
- NASA sends no CORS headers → browser reads it through the Vite proxy `/nasa` (`vite.config.js`). The proxy sets its own User-Agent because NASA's CDN answers **403 to HeadlessChrome**. Without the proxy (e.g. `vite build`), it falls back to `public/data/M20_waypoints.json`; the footer shows "live feed" vs "saved copy".
- **Light time:** JPL approximate Keplerian elements (1800–2050) for Earth and Mars; checked: landing 2021-02-18 → 11 min 22 s, closest approach 2025-01-12 → 96.1 Mkm. History = one point per day since sol 0; live update every second.
- Charts cover the whole mission (sol 0 → current sol). **T** hides/shows the panel (a small tab remains).
- `npm run check` waits for all 4 points (`window.__telemetry`), prints value/unit/sol/source, fails on any missing point, and tests T (hide → `screenshots/check-panel-hidden.png` → show).

### Rover photos ✅ (Act 3)
- API: `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&ver=1.2&num=100&page=0&order=sol+desc` (CORS `*`, works directly). Filter with `&search=<INSTRUMENT>`: `MCZ_LEFT`, `NAVCAM_LEFT`, `FRONT_HAZCAM_LEFT_A`, `SHERLOC_WATSON`. The `NCAM LEFT|` syntax returns an HTML error.
- Selection rules (from inspecting contact sheets): `sample_type === 'Full'`; Mastcam-Z only `ZCAM_L0_RGB` **and** saturation > 0.2 (half of the L0 frames are gray; `L7_RGB_ND6` is the solar filter); NavCam `NLF_*` / HazCam `FLF_*` = color, full frame (≥ 960 px tall; skip 1280×256 strips); WATSON `SIF_*`, but **not** the blue UV-lit frames, the lens/cover shots or the deck calibration target. No sun, empty sky or thumbnails.
- Curated list lives in `src/data/photos.json` (id, instrument, sol, takenUtc, 1200 px image, NASA page, title). "Days ago" is computed at runtime from `takenUtc`. Images load straight from mars.nasa.gov (not blocked for headless).
- Hover a card → `SpotLight` + additive glow sprite + emissive pulse on the GLB part (materials cloned per part) + SVG guide line + name tag. Click → iris shutter (8 blades) closes → flash → photo "downlinks" top to bottom (clip-path + blur→sharp). ‹ › / ←→ browse that camera, ✕ / Esc returns. While open, `keyboard.paused` stops the rover.
- `npm run check` hovers CAM 01 (`screenshots/check-camera-hover.png`), clicks all 4 cards, waits for the reveal, verifies a real mars.nasa.gov image loaded, saves `screenshots/check-photo-<camera>.png`, presses → and checks photo 2, then closes.

### Phase 5 — Cameras (`cameras.js`)
1. **Orbit/Follow**: done in Phase 4 (OrbitControls + chase).
2. **Rover cameras**: attach `PerspectiveCamera`s to the nodes in `window.roverCameras` (Mastcam-Z, NavCams, Hazcams front/rear, WATSON…) with the real fields of view, and switch between them.
3. Optional: picture-in-picture view of the active rover camera.
4. Keep the existing ground clamp for all modes.
5. Switch with `C` (cycle) or keys `1`/`2`/`3`; show the active mode on screen.
6. **Check:** all three modes work while driving.

### Phase 6 — Extras
Already done in Phase 2: ~~shadows~~, ~~rocks~~, ~~dust (ambient)~~, ~~sky & atmosphere~~, ~~Phobos & Deimos~~.
- [ ] **Wheel dust**: particles kicked up by the wheels when moving, fading out.
- [ ] **HUD** (`hud.js`): speed (m/s), position (x, z), heading, sol/time.
- [ ] Day/night cycle (move `SUN_DIR`, update sky uniform and light colors; blue sunset halo).
- [ ] Ingenuity helicopter flying nearby.
- [ ] Post-processing: bloom on the sun, subtle film grain.

## Status

- [x] Phase 1 — Project base + `npm run check`
- [x] Phase 2 — Cinematic Mars landscape (dunes, crater rim, sky, sun, Phobos & Deimos, rocks, dust, soft shadows)
- [x] Phase 3 — Rover model (NASA GLB, real scale, mast deployed, cameras listed)
- [x] Phase 4 — Movement (WASD, terrain fit, tire marks, follow camera)
- [x] Mission control panel (4 real data points, T to hide)
- [x] Rover photos: 4 camera cards, real NASA photos (Act 3)
- [ ] Phase 5 — Cameras (rover's own cameras) ← next
- [ ] Phase 6 — Extras

Update this checklist (and the notes below) as phases are completed.

## Notes / decisions log

- Three.js r18x: `PCFSoftShadowMap` and `THREE.Clock` are deprecated → use `PCFShadowMap` + `shadow.radius`, and `THREE.Timer`.
- Non-indexed geometries (Icosahedron) must go through `mergeVertices` before displacement, or normals come out faceted.
- Moons are deliberately oversized for a cinematic shot (`src/sky.js`).
