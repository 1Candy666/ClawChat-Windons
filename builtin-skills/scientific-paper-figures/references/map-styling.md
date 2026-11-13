# Map colour and relief

Use for terrain/palette changes, not unrelated edits. Start from the accepted reference and variable's role. Physical-map greens, ochres, browns, pale summits and ocean blues are choices, not mandatory saturation or a fixed palette.

- Match DEM resolution to source quality, visible landforms and final size. Do not prescribe one resolution or shading strength. Opacity and gradient-normalization amplitude differ.
- Tune relief without competing with study regions, classes or labels. Opaque thematic rasters hide terrain; use contours, blending or a separate panel when both matter. Avoid muddy washes and halos merging islands.
- Use sequential magnitude, diverging signed change and categorical groups. Swatches match verified thresholds/inclusivity; never invent bins for appearance. Avoid rainbow/jet quantitative defaults.
- Comparable panels share units, transforms, limits and mapping. Independent locators may use their own stretch. Set limits from data; robust clipping excludes NoData, identifies clipped ends and leaves analytical values unchanged.
- Separate categorical highlighting from elevation/bathymetry. Use a consistent sea/land legend or distinguish separate scales. Inland negative elevations are not automatically ocean.
- References guide hue, lightness and shading separately, not dataset attribution. Reuse a liked palette but recalibrate elevation breaks for the new region.

Optional starting sequences, to inspect at final size:

| Role | Low to high |
|---|---|
| Neutral context | `#F0EFEB #C4C2BC #77756F` |
| Physical relief | `#187832 #83B85E #D7D17C #EFBF67 #B57530 #805331 #89847B #FFFFFF` |
| Five ordered classes | `#FFF4C2 #FDD985 #F4A259 #DF6548 #A8323E` |

These are starting colours, not colour-vision or print guarantees.
