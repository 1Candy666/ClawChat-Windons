# Optional implementation recipes

Load only for a needed recipe. Values are starting points; preserve project style and inspect final-size exports. Choose ticks to suit each axis and its variable; these helpers do not define universal map rules.

## Matplotlib base and panel tags

```python
import matplotlib as mpl
mpl.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Liberation Sans", "DejaVu Sans"],
    "font.size": 9, "axes.labelsize": 9,
    "xtick.labelsize": 8, "ytick.labelsize": 8, "legend.fontsize": 8,
    "axes.linewidth": .8, "pdf.fonttype": 42, "ps.fonttype": 42,
    "svg.fonttype": "none", "mathtext.fontset": "dejavusans",
})

def panel_tag(ax, letter, corner="left", size=9):
    right = corner == "right"
    return ax.text(.965 if right else .035, .965, f"({letter})",
                   transform=ax.transAxes, ha="right" if right else "left",
                   va="top", fontsize=size, fontweight="normal",
                   color="black", zorder=20)
```

Omit tags for true single panels. Recheck glyphs and tag collisions after resizing.

## Enclosed Cartesian axes

```python
def enclosed(ax, inward=False, unlabelled_ticks=False):
    for spine in ax.spines.values():
        spine.set_visible(True)
        spine.set_color("black")
        spine.set_linewidth(.8)
    ax.tick_params(direction="in" if inward else "out", width=.7, length=3,
                   top=unlabelled_ticks, right=unlabelled_ticks,
                   labeltop=False, labelright=False)
```

For open axes hide top/right spines. If log minor ticks are needed, set them explicitly and inspect corners; do not use this helper on maps/colourbars.

## Palette and marker starting points

Preserve roles across panels; no automatic recolouring of an existing project.

```python
PALETTES = {
    "profile_pair": ["#7153A1", "#B55475"],  # adjacent reference / disturbed
    "three_sites": ["#94B5D8", "#ACD2C7", "#D57B70"],
    "five_positions": ["#94B5D8", "#ABC6E4", "#C39398", "#D0CADE", "#FCDABA"],  # top/left/upper/lower/bottom
    "four_variables": ["#015493", "#019092", "#999999", "#D9995B"],  # variables A/B/C/D; assign actual meanings per project
}
MARKER_AREAS = {"o": 30, "s": 28, "^": 40, "D": 24}
```

These are candidates, not accessibility guarantees. Equal numeric marker area need not look equal; diamonds often need less area and triangles more. Pale summary marks may need outlines; dense observations may not.

## Depth profiles and units

```python
q = data.sort_values("depth_cm")
ax.plot(q["value"], q["depth_cm"], color=group_color, lw=1.1)
ax.scatter(q["value"], q["depth_cm"], s=22, color=group_color,
           edgecolor="black", linewidth=.6)
ax.invert_yaxis()
ax.set_xscale("log")                 # original values, logarithmic axis
ax.set_xlabel("Total C (wt%)")       # original unit
# For transformed values instead: ax.set_xlabel("ln(disturbed / reference)")
```

Do not invert the same axis repeatedly in a group loop. Connecting depths describes profile order; define transformed ratios and sign meanings in captions/Methods.

## Outlined summary intervals

Only when pale summary marks need separation; `spread` retains its documented definition.

```python
for colour, width, capwidth, markerwidth, z in [
    ("#222222", 1.35, 1.35, 2.25, 4),
    (group_color, .85, .85, 1.70, 5),
]:
    ax.errorbar(x, mean, yerr=spread, fmt="_", markersize=9,
                color=colour, elinewidth=width, capsize=2.2,
                capthick=capwidth, markeredgewidth=markerwidth, zorder=z)
```

For continuous series, `fill_between(x, lower, upper, alpha=.12)` is an alternative when appropriate; never change the underlying statistic to obtain a preferred shape.

## Sign-reference bands

```python
ax.axvspan(xmin, 0, color="#DCEAF3", alpha=.02)
ax.axvspan(0, xmax, color="#F7E7DE", alpha=.02)
ax.axvline(0, color="#777777", lw=.75, ls="--")
```

Increase alpha only if invisible; guide bands must not imply uncertainty. Keep the sign cue only when it helps interpretation.
