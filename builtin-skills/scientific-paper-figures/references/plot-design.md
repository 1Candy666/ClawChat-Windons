# Chart design

Read only the needed section; project style and explicit scope take precedence.

## Choose the representation

- Start from the reader's comparison. Show member identities when needed; otherwise use an appropriate summary and documented spread. For few members, raw points or median/min–max often communicate more honestly than boxes/violins. Show n when unequal groups matter.
- Dense crossed encodings: consider facets or aligned summaries before adding colours, shapes and legends.
- Overlapping curves: retain the full view and consider a marked zoom or difference panel. Preserve data, units and normalization; never distort values to separate lines.
- Discontinuous time: retain the gap or mark an axis break. Do not connect across missing periods; distinguish annual observations from period means.
- Continuous trajectories often suit translucent uncertainty bands; discrete comparisons often suit intervals. Preserve range/SD/SE/CI definitions; model spread is not automatically a CI. Keep guide bands distinct from uncertainty.
- Unrelated categories: bars, dots or lollipops, not lines implying order. Preserve category definitions and denominators; stronger forcing need not yield nested classes.

## Text and units

- Use the accepted sans-serif family and final-size hierarchy. Without a reference, 8–9 pt ticks/legend and 9–10 pt tags are starting values, not fixed rules. Control tags, coordinates, scale numbers, units and legends separately; never blindly resize every text artist.
- Write quantity + unit in familiar terms. Expand obscure abbreviations where practical; put calculation details in captions/Methods. Preserve distinctions between counts/density, percent/percentage points and relative score/probability. Keep qualifications that change interpretation; remove repeated defensive prose.
- Typeset units upright. Inspect superscripts, minus signs, degrees and Greek letters in exported PDF/PNG; use supported fonts or math text instead of missing glyphs.
- A log axis retains original units; transformed data need the transformation in the label, with its sign meaning defined. Categorical codes are not continuous measurements.
- Use parenthesized, normally regular-weight tags in a consistent corner, in axes coordinates. True single panels need no tag. Keep tags off marks; preserve intentional hierarchy between unequal panels.

## Layout and encoding

- Align rendered frames after aspect settles. Comparable panels share limits, transforms, ticks and dimensions where appropriate. Match limits/aspect when interpreting geometric distance from `y=x`.
- Compress whitespace without squeezing labels. Put shared legends near the panels they govern, preferably in available exterior space. Cluster each symbol with its text; distribute groups, not individual characters. Avoid redundant nested boxes.
- Preserve semantic colours and category order. Use sequential magnitude, diverging signed change and categorical groups. Redundant shapes/lines aid discrimination; inspect combined visual load, pale colours and grayscale readability.
- Thin outlines clarify pale marks but may overwhelm dense points. Calibrate apparent marker size across shapes. Keep outliers visible unless exclusion is documented; inspect bars and labels at final size.
- Arrows need visible shafts and heads. Adjust box gaps and endpoint shrink together. Recheck connector/label crossings after layout or coordinate changes.
- Choose open or enclosed Cartesian axes deliberately. Keep decorative grids off; retain meaningful zero/equality lines. Check enclosed log-axis corners for tick collisions. Prefer dark labels when group-coloured text is faint; avoid oversized titles.

## Special cases

- Depth profiles: depth increases downward; retain group and error meanings. Connecting depths shows profile order, not regression.
- Sensitivity plots: explain the zero/equality reference; use zooms/direct labels sparingly.
- Heatmaps: shared normalization for comparable panels; specify log scaling and class boundaries. Dividers are not extra ticks.
- Three-line tables: top rule, header rule, bottom rule; no vertical rules. Show the requested table with only essential nearby definitions. Keep detailed methods/provenance separately when requested. Model comparisons retain common evaluation support and the classification threshold in accompanying methods.

Read [style-recipes.md](style-recipes.md) only for a needed implementation pattern.
