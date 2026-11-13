# Scientific support and provenance

Use for new statistics, scope/filter/mask changes or provenance questions; skip for cosmetic edits with unchanged inputs.

## Define support

For nonspatial work define population, observation unit, independent replicate, grouping, exclusions and missing values before summarizing. Distinguish participants from repeated measurements, specimens from technical repeats, and documents from coded excerpts. Never count repeated or nested observations as independent without an appropriate analysis. Do not fabricate numerical scores from qualitative labels. The spatial checks below apply only when spatial data are involved.

Separate study boundary, model-valid support, supplied records and display extent/resolution. Check inclusion code and mask values: nonzero NoData such as 255 makes `mask > 0` unsafe. Missing output is not zero or absence. A display rectangle cannot silently become the statistical denominator; mapped records do not prove inventory completeness.

Trace geometry and disputed counts to sources, metadata or extraction code. Hash identity proves matching files, not completeness or scientific validity. Separate verified origin, inferred intent and unresolved questions; correct earlier misstatements. Never construct missing observations.

## Statistics and comparisons

- Compute areas on native support using an appropriate equal-area CRS or geodesic cell areas; check sample cells. Resampling adds no information.
- State fixed/common versus scenario-specific support, units, weighting, denominator and class-edge rules. Distinguish records, unique geometries and occupied cells; counts per grid are not area-normalized density.
- Preserve aggregation order: classifying mean/median scores differs from averaging member class areas; pixel SD differs from SD of regional percentages. Do not select summaries for a preferred trend.
- Name uncertainty from its actual statistic, units and replication basis. Do not manufacture intervals or call model range a CI. Retain source samples when replacing displayed points with summaries.
- Reproduce archived transforms, preprocessing, regional assignments, masks, weights and seeds. Verify reconstructed summaries against archived outputs. Do not extend regional shortcuts beyond their support.

## Record changed dependencies

For scientific changes, record source identities, CRS, support counts/area, filters, thresholds, uncertainty and a focused old/new comparison. Cache keys reflect these dependencies. Preserve unaffected records and identify affected captions/figures. For visual edits, numerical identity and target-render inspection suffice; do not rerun models.

Reuse project definitions, including population, observation units and missingness. Do not duplicate contracts or load a full paper workflow for a small figure task. Export completion, computational checks and author acceptance remain separate.
