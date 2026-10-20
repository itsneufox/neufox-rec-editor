# neufox's Rec Editor

Browser editor for SA-MP / open.mp NPC recordings (`.rec`). Open one or more recordings, see them on the San Andreas map, scrub and play them back, and edit them: cut, retime, hold, smooth, drag points, move, rotate, reverse, and join. Files never leave your browser.

Available in English and Português (Brasil): it follows your browser language, and the **EN / PT** picker in the top bar switches it.

Same stack and map as [neufox's Node Viewer](https://github.com/itsneufox/neufox-node-viewer): plain HTML/CSS/JS, Leaflet, `samap.png`. No build step.

## Running locally

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>. Drop `.rec` files anywhere on the page, or use **Open**. **Load samples** opens the files listed in `samples/index.json` (hidden when the list is empty). `#load=samples/a.rec,samples/b.rec` in the URL opens recordings served next to the page.

## What it does

**View**
- Path on the map, coloured by speed; other open recordings as dashed lines
- Timeline with a speed / height / frame-gap graph, wheel to zoom, Alt+drag to pan
- Playback at 0.25×–16×, optional follow camera, heading arrow on the current frame
- Frame inspector for every field (position, rotation and heading, velocity, keys, health, train speed, surfing, animation…), editable in place; `⇉ sel` copies a value to the whole selection

**Edit (selection: Set in / Set out, Shift+drag the timeline, Shift+click the path)**
- Trim to selection, delete, duplicate
- Hold: stand still on the current frame for N seconds
- Retime by a factor or to a target duration (velocity and train speed scale with it)
- Smooth the path, recompute velocity from positions
- Drag the orange handle to move a frame; neighbours within N metres along the path follow
- Set any field on every selected frame

**Tools (selection or whole recording)**
- Offset by dx/dy/dz, or move so the current frame lands on a point
- Rotate around the centre, the current frame or the first frame (headings and velocities turn too)
- Reverse playback, optionally turning around
- Resample to a fixed interval, fix timestamps (strictly increasing, optional new start)
- Append another open recording

**Files**
- Download as `.rec` (byte-identical when unchanged) or `.csv`; open `.csv` back in
- Layers: reorder, show/hide, rename, duplicate; join report (end of one → start of the next)
- Issues: non-increasing timestamps, NaNs, big jumps, bad rotations; click to jump

**Keys**: Space play · ←/→ step (Shift ×10) · Home/End · I/O set in/out · Esc clear · Delete · Ctrl+A select all · Ctrl+Z / Ctrl+Shift+Z · Ctrl+S download · F follow

## File format

8-byte header: `uint32 version` (1000), `int32 type` (1 = driver, 2 = on foot). Then frames, little-endian, packed:

| | Driver (67 bytes) | On foot (72 bytes) |
|---|---|---|
| | `u32 time` · `u16 vehicleid` · `i16 lr, ud` · `u16 keys` · `f32 quat w,x,y,z` · `f32 pos x,y,z` · `f32 vel x,y,z` · `f32 vehicle health` · `u8 health, armour, weapon+key, siren, gear` · `u16 trailer` · `u32 hydra angle / f32 train speed` | `u32 time` · `i16 lr, ud` · `u16 keys` · `f32 pos x,y,z` · `f32 quat w,x,y,z` · `u8 health, armour, weapon+key, special action` · `f32 vel x,y,z` · `f32 surf offset x,y,z` · `u16 surf id` · `u16 anim id, anim flags` |

Rotations are stored conjugated: heading = −2·atan2(z, w). Velocity is in GTA units per 1/50 s (× 180 = km/h).

## Tests

```bash
node tests/run.js [more/recordings/dirs]
```

Round-trips every `.rec` it finds byte for byte and checks the edit operations.
