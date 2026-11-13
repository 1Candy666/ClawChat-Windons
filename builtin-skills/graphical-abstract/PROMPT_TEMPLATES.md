# 提示词模板

助手先选模式并填完字段，再交付一个自包含英文代码块。花括号是内部填写标记，不能留在给用户的最终提示词中。删除无关条目和选择支路，避免让模型绘制“reserved for…”等说明文字。

完整模式适用于初次构图和新绘图会话；短模式适用于唯一母版已明确的局部编辑。两种模式都携带本轮必要的保护、色板和文字要求，不依赖未复制的通用前缀。

所有模式的 PALETTE 使用[本图配色记录](references/palette-and-encoding.md)，展开实际角色与 HEX。局部编辑和换会话沿用母版；整体换色明确替换旧映射；文字任务不改变底图。用户已授权直接执行时，不增加选色等待。

## A 初次构图或重新设计

先完成科学骨架及参考角色判断。新图的未来阶段留在助手计划里，不全部塞进本轮。

~~~text
MODE: New no-text scientific figure.
REFERENCE ROLES: {{none, or image identities and allowed roles}}.
PURPOSE: {{one visual question and conceptual/data status}}.
PALETTE: {{task-specific roles, HEX values, and allowed regions}}.
Use predominantly flat coherent fills and restrained outlines.
Allow subtle same-hue tonal transitions only for atmospheric background,
water depth, or visible cut faces where needed for spatial clarity.
These tones must not imply an unprovided quantitative field.
No decorative gradients, glow, grain, or unlisted hues.
Keep scientific distinctions readable.

COMPOSITION: {{canvas, orientation, primary geometry and annotation space}}.
DRAW THIS STAGE ONLY: {{specific objects, positions, proportions and connections}}.
{{supported process directions and connector grammar, if needed this stage}}
Do not import reference-image data or unrelated scientific objects.
{{two or three relevant exclusions}}

No text, no letters, no numbers, no labels, no legend text, no watermark, no pseudo-writing.
Acceptance: {{three observable outcomes}}.
~~~

## B 稳定绘图会话内的短局部编辑

适合加一个对象、修一处形态或边界；用坐标与相邻对象双重定位。坐标来自当前图，尺寸仅为示意布局目标。目标和保护区必须互斥。

~~~text
MODE: Local graphic edit. The attached no-text image is the sole master.
TARGET: {{region + neighboring object}}.
PALETTE: {{target material colors already visible or explicitly approved}}.
CHANGE ONLY: {{one concrete change, with geometry, connection and direction}}.
PRESERVE: {{three important non-target features}}, canvas, perspective,
and all non-target colors and geometry.
{{two relevant failure exclusions}}
No text, no letters, no numbers, no labels, no legend text, no watermark, no pseudo-writing.
Acceptance: {{target outcome; surrounding relationship; protected content}}.
~~~

## C 新绘图会话交接

配合 [会话策略](references/drawing-sessions.md)。上传的是上一个通过审核的母版，不是期待模型自行找到的历史图片。

~~~text
MODE: Continue editing an existing scientific figure in this new image session.
MASTER: The attached no-text image, {{visible identity}}, is the only editable base.
REFERENCE ROLES: {{none, or explicitly separate references}}.
PURPOSE: {{one sentence; schematic or verified-data status}}.
ALREADY APPROVED: {{geometry, existing objects and stage}}.
PALETTE: {{current role-to-color map and allowed regions}}.
TODAY'S SINGLE EDIT: {{target, position, size relationship, geometry and connection}}.
PRESERVE: {{three protected elements}}, crop, perspective and non-target color.
Use the existing fill treatment, permitted tonal transitions, and line hierarchy.
Add no unlisted detail or color.
{{up to three relevant failure exclusions}}
No text, no letters, no numbers, no labels, no legend text, no watermark, no pseudo-writing.
Acceptance: {{three visible checks against the attached master}}.
~~~

## D 删除对象组

删图标、圆框、错误箭头或重复输出时，先写目标明确不受保护。需要连接重排就一并说明局部端点。

~~~text
MODE: Delete one specified graphic group from the attached no-text master.
DELETE: {{object content, enclosing border and redundant connector fragments}}.
These elements are editable and are excluded from the protected region.
RESTORE: {{underlying fill}} using {{existing local palette}}.
CONNECTORS: {{remove, shorten, or reconnect only the named endpoints}}.
PRESERVE: {{all other named regions}}, canvas, geometry, color and line style.
Do not leave an empty frame or substitute another icon. Add no new scientific content.
No text, no letters, no numbers, no labels, no legend text, no watermark, no pseudo-writing.
Acceptance: {{deleted group absent; restored area clean; other objects retained}}.
~~~

## E 纯换色

只写变化的颜色角色；其余颜色从母版保留。“统一配色”时逐项列出旧角色与新颜色；不预设材料语义。不把换色与重画轮廓、改变对象规模或调亮全图混做。

~~~text
MODE: Material-specific recoloring of the attached no-text master only.
TARGET MATERIALS: {{regions and their visual identities}}.
REPLACE: {{old role/color}} with {{new role/color}}.
This replaces the previous color rule for these materials.
PALETTE: {{allowed colors for the edited materials and their distinct meanings}}.
Preserve every material boundary, object shape, arrow, line width, crop and perspective.
Preserve all colors outside the listed material fills.
Replace the specified fill colors; retain any existing subtle within-material
tonal structure using the new hue family. Add no new gradients.
No global filter, relighting, texture enhancement or unlisted hues.
No text, no letters, no numbers, no labels, no legend text, no watermark, no pseudo-writing.
Acceptance: {{new palette; material separation; unchanged non-target areas}}.
~~~

## F 局部过程与符号

套用 B 或 C，将 CHANGE 中的核心写为以下结构；只保留本轮真正需要的边。

~~~text
Add {{one supported process}} within {{region}} using {{approved palette}}.
Start at {{origin}}, pass through {{path}}, and end at {{destination}}.
Use {{line type and direction}} to mean {{physical process or data operation}}.
Keep annotation leaders and scale links visually different from this process arrow.
{{For an associative relation, specify a line without a causal arrowhead instead.}}
~~~

此片段不是独立交付；助手必须合入 B/C，并移除内部选择说明。

## G 文字与引线参考

先读 [文字交接](references/typography-and-handoff.md)。透明覆盖层仅在目标工具支持时要求；棋盘格画面不等于透明通道。若用户只需带底图参考，可做独立 mockup，不能覆盖无字母版。

~~~text
MODE: Annotation layout reference on a separate transparent overlay.
CANVAS: {{width and height}}, matching the reference.
REFERENCE: The scientific image is for placement only; do not reproduce its background.
ADD ONLY: {{exact author-approved wording, positions, font settings and leader endpoints}}.
Use thin annotation leaders with no process meaning.
Retain the supplied distinctions between labels, motion arrows and scale connectors.
Background must be transparent. Add no scientific objects or invented text/data.
No extra wording, watermark, pseudo-writing, texture or shadow.
Acceptance: exact supplied wording; readable placement; correct endpoints;
transparent background; no reconstructed background.
~~~

## H 非生成式排版交接

~~~text
Use {{clean master}} as a locked background in the editing application.
Add editable text and leaders from {{verified annotation manifest}}.
Preserve the original background without resampling, recoloring or repainting it.
Use {{font, size and label hierarchy}}.
Verify each label, unit, process direction and leader endpoint.
Save the editable source and the requested publication exports.
~~~

## I 用户明确要求的直接加字参考

只在用户选择此路线且工具具备必要编辑能力时用。先说明这是需核查的参考输出，提示词本身不能保证像素锁定。

~~~text
PIXEL-LOCKED TYPOGRAPHY-ONLY reference edit of the attached approved clean master.
Add only {{exact text, positions, leader endpoints and typography}}.
Keep the original background pixels outside the new annotation masks unchanged.
Do not recolor, relight, sharpen, denoise, resample, crop, or redraw the background.
Add no new scientific objects, data or extra wording.
Acceptance: supplied text only; correct endpoints; unchanged non-annotation regions.
~~~

输出漂移时弃用该合成结果，保留无字母版，采用 H 或独立覆盖层；不要宣称生成请求已经技术性锁定像素。

## J 回滚和分辨率

回滚是选择一个现存的获批文件作为新母版，不是让模型在失败图上“回忆恢复”。选择后使用 B 或 C 重试本轮目标，默认不携带失败图；需要展示错误时注明它不是编辑目标。

分辨率处理优先使用非生成式工具。如用户选择生成式高清化，明确目标尺寸、原比例和保护项，并标为待验证重采样；不承诺恢复原图不存在的真实细节。
