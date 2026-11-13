# Maps and PyGMT

## Environment and geometry

Reuse the known interpreter. Check `import pygmt` and `gmt --version` separately; failure in one environment does not prove absence. Search known project environments before broad scans or installation. On Windows check GMT DLL discovery. Test a small map with the needed font, geometry and export; after errors consult the installed-version API instead of guessing signatures.

Use format-aware metadata readers, not text dumps of binary files. Verify CRS, bounds, coordinate convention, NoData, projected corners, datelines and required islands. Separate multipart polygons/rings correctly; verify renderer handling before using missing-value separators. Document candidate repairs without rewriting originals.

Cache needed relief with product/version, units, resolution and vertical datum where available. Bathymetry may include inferred relief. A filename or output spacing does not establish source support. Use nearest-neighbour for categories/masks and documented continuous interpolation. For Unicode NetCDF/Ghostscript failures, use a compatible backend or verified ASCII staging copy, not broader permissions.

## Projection and furniture

- Choose projection for extent/purpose; a rectangular locator may aid composition. Preserve aspect. Hillshade is not 3D; perspective requires viewpoint/exaggeration, height/occlusion checks and recognition of varying scale.
- Position coordinates at actual graticule/frame intersections. Never copy edge positions or evenly space geographic labels without inverse projection. GMT `W/S/E/N` annotate; `l/r/b/t` draw plain edges. Set annotation and tick intervals deliberately; plain unlabelled edges are an optional uncluttered style, not a universal requirement.
- Scale text by physical panel width: `new_pt = reference_pt × new_width/reference_width` is a starting estimate. Inspect inset/combined-figure scaling; scale numbers and `km` together and preserve tag hierarchy.
- Use a readable scale bar with clearly positioned values and distance units; segment count and style follow the project. Calibrate total length locally/geodesically before dividing; projected metres need not equal ground distance. Changing thickness must not falsify length. Dense map arrays may omit repeated bars when project rules allow.
- Keep insets/legends clear of data; use one frame unless another is needed. Connect corresponding locations for real zooms and record independent scales. Do not replace observations with arbitrary representative points.
- Identify boundary sources and roles. Use a restrained wash/outline preserving terrain and islands. Source added maritime/disputed lines; never invent their paths or treat them as analytical boundaries.
- Match colourbars to displayed land/bathymetry values, including negative elevations. Distinguish study-area highlights from elevation colours.

## Export

Keep vector text/lines where supported; identify raster layers. Recheck projection, glyphs, scale, labelled-edge ticks and insets after composition/resizing.

Official references, only for the needed operation:
- https://www.pygmt.org/latest/api/generated/pygmt.datasets.load_earth_relief.html
- https://www.pygmt.org/latest/api/generated/pygmt.grdgradient.html
- https://www.pygmt.org/latest/tutorials/advanced/3d_perspective_image.html
- https://www.generic-mapping-tools.org/remote-datasets/earth-relief.html
