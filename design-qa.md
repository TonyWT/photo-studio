# 编辑器视觉对照 QA（进行中）

- 参考截图：`/tmp/pixlr-express-editor.png`
- 实现截图：`test/e2e/visual.spec.mjs-snapshots/editor-loaded-chromium-darwin.png`
- 同输入组合对照：`/tmp/photo-studio-editor-qa-comparison-v2.png`
- 视口：`1920 × 878`
- 对照状态：两侧均为已打开的 `3840 × 2880` 栅格照片，缩放均为 `26%`。实现侧使用仓库内固定测试图片；照片内容不作为视觉相似度判定对象。

## 已验证

- [通过] 中心画布在固定视口下以约 `1000 × 750` 的可见区域居中展示，尺寸、黑色工作台、左右留白与参考的结构一致。
- [通过] 右侧为窄图层轨，包含实际栅格缩略图、当前层选中态、锁定操作及可收起入口。
- [通过] 底栏展示文档尺寸、缩放、撤销/重做、关闭、保存项目及导出；控制均连接到实际编辑器状态，而不是静态视觉占位。
- [通过] 左侧只提供非 AI 的编辑工具入口；不存在 AI Tools 或 Element 入口。

## 仍需收敛的视觉差异

- [P2] 激活工具使用了较醒目的 3px 青色内嵌高亮；参考的激活态更克制。后续降低该高亮对比度。
- [P2] 图层锁定目前使用“锁定/解锁”文字按钮，以保证可访问性和真实交互；后续可替换为仓库内开源图标并保留无障碍标签。
- [P2] 底栏额外显示“保存项目”，这是本地优先产品的必要能力；后续将它与导出收束为更紧凑的保存组，减少与参考的密度差异。
- [P2] 各工具参数面板的深度和控件密度尚未完全对齐，优先继续补齐 Cutout、Adjust、Effect、Filter、Liquify、Retouch、Drawing、Text 的真实能力。

- 2026-07-15：Adjust 面板的 Cancel / Apply 已改为固定在编辑器底栏上方的双按钮区；Cancel 会关闭面板、丢弃尚未应用的滑杆值且不写历史，Apply 进入既有的本地 Compare / Reset / Confirm 预览流程。Chromium E2E 固定断言该操作区底边与状态栏相邻。截图级的图标密度仍属于上述 P2 项，未据此宣称完整视觉验收。

- 2026-07-15：Crop 面板的 Cancel / Apply 同样改为固定在编辑器底栏上方；取消会丢弃本次临时裁剪会话且不写历史，应用仍写入一条原子裁剪历史。Chromium E2E 断言该区域的几何位置与双按钮语义。其他裁剪控件的图标/间距仍需同状态截图逐项收敛。

## 功能验证证据

- 固定图片打开、图层缩略图、锁定并撤销、收起图层轨：`test/e2e/smoke.spec.mjs`。
- 图层不透明度、旋转及撤销：`test/e2e/smoke.spec.mjs`。
- 1:1 与 16:9 居中裁剪比例：`test/e2e/smoke.spec.mjs`。
- 固定尺寸视觉基准：`test/e2e/visual.spec.mjs`。

## Comparison History

1. 2026-07-13：首次对照的文档状态不一致，无法判断画布与图层轨。
2. 2026-07-13：已改为同视口、同尺寸、同缩放的已加载图片状态；原先的 P1 状态差异已消除，遗留项目均为 P2 细节或未完成功能。
3. 2026-07-14：以用户提供的 Crop 侧栏截图裁去浏览器栏后，与 `1914 × 744` 本地 Crop 打开状态合并对照：`/tmp/photo-studio-crop-panel-comparison-current.png`。两边均为已加载的 3840 × 2880 图片和 Crop 状态；不同测试图片不作为判定对象。当前确认工具轨、深色工作台、右侧图层轨和底栏结构均已存在，且本地 Image size / Canvas size 入口可用。仍有 P1 差异：项目 Crop 面板的控件排列、标题栏密度和底部确认区与参考不一致；这些仅能在对应功能均可用后按同状态继续收敛，不能标记为完成。
4. 2026-07-14：以用户提供的 Adjust 侧栏截图裁去浏览器栏后，与 `1914 × 744` 更新后的本地 Adjust 打开状态合并对照：`/tmp/photo-studio-adjust-panel-comparison-after.png`。Color/Light 分组、八条滑杆、三项快捷调整和重置/预览应用入口均已进入面板；色相、色温、色调等色彩轨道使用对应色谱，改善了上一版“七个入口按钮”的 P1 差异。仍有 P1 差异：参考中图标化快捷入口、设置图标、底部固定 Cancel/Apply 以及更窄的面板比例尚未对齐；同时测试图内容不同，不作为图片视觉相似度结论。
5. 2026-07-14：以用户提供的 Filter 侧栏截图裁去浏览器栏后，与 `1914 × 744` 更新后的本地 Filter 打开状态合并对照：`/tmp/photo-studio-filter-panel-comparison-after.png`。项目侧以当前用户图片作为六张实时卡片缩略图，因此不依赖 Pixlr 的图片素材；卡片与实际 HDR、Focus/Bokeh、Reflect、Dispersion、Glitch、Colorize 本地流程相连。仍有 P1 差异：参考中卡片使用不同的摄影样图和更大的垂直留白，项目侧按许可证与本地优先要求不复制这些素材；卡片尺寸、文字密度与操作区仍待继续收敛。
6. 2026-07-14：以用户提供的 Text 侧栏截图裁去浏览器栏后，与 `1914 × 876` 更新后的本地 Text 打开状态合并对照：`/tmp/photo-studio-text-panel-comparison-expanded.png`。项目侧在“添加文字”下方提供八张原创文字样式卡；卡片只写入字体、字号、颜色、描边和阴影等实际工具属性，创建后仍为可编辑文本，不使用 Pixlr 的装饰字图片。原先 Text 激活时的 `warp` 属性类型提示已消失。仍有 P1 差异：参考可见的卡片具有独立插画字效；项目侧在原创和本地可编辑约束下继续保持文字预设密度，并仍需收敛卡片尺寸与固定操作区。
7. 2026-07-14：以用户提供的 Effect 侧栏截图缩放至同一 `1914 × 876` 视口后，与本地 Effect 分类初始态合并对照：`/tmp/photo-studio-effect-panel-comparison-final.png`。项目侧将工具轨、侧栏和右层轨收敛至参考的窄轨比例，五张分类卡均以当前活动的本地图片生成预览；进入分类后每个预设会真实打开 miniPaint 的本地效果参数流程，保留取消、确认和撤销。仍有 P1 差异：参考拥有更高密度的分类卡、不同摄影样图和固定底部 Apply/Cancel；项目侧不复制 Pixlr 的图片、分类品牌或文案，且仍需逐项为全部预设补充像素基准。
8. 2026-07-14：以用户提供的 Liquify 侧栏截图缩放至同一 `1914 × 876` 视口后，与本地 Liquify 初始态合并对照：`/tmp/photo-studio-liquify-panel-comparison-final.png`。项目侧已有与截图相同的六格工具层级、半径/强度/密度和高质量预览开关；六格分别实际连接推移、膨胀、收缩、左旋、右旋和恢复的本地临时会话，Apply 恒提交全分辨率临时画布。仍有 P1 差异：参考用单色图标而当前以文字表达工具名称，状态说明区和底部固定操作区的密度也未完全对齐。
9. 2026-07-14：以用户提供的 Retouch 截图缩放至同一 `2048 × 960` 视口后，与本地 Retouch 初始态合并对照：`/tmp/photo-studio-retouch-panel-comparison-final.png`。项目侧已将工具轨、左侧工作面板、右侧图层轨与底栏尺寸收敛到参考的工作台比例；打开面板时工作区会让出其宽度，画布不再被面板覆盖而拒绝指针起点。默认进入 Spot 修复，提供真实本地修复、克隆、柔化、去色与笔刷大小，扩展区保留三档确定性质量和其他本地工具。参考中的 Object 为 Pixlr 的 AI 辅助对象修复，因此按项目范围明确排除而非伪造入口。仍有 P1 差异：参考的四个工具为纯图标、当前使用可读文字；Object 的位置被刻意省略；底部固定 Close/Save 与参考的 Cancel/Apply 语义不同。
10. 2026-07-14：Effect 初始态以用户截图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-d3bdd00a-1a74-4114-911a-b9eec988885c.png` 和本地 `2048 × 960` 截图 `/tmp/photo-studio-effect-app-v2.png` 规范化后合并为 `/tmp/photo-studio-effect-normalized-side-by-side-v2.png`。首轮发现 P1：项目侧把分类排成两列、图文上下堆叠的短卡，参考为一列、左文字右预览的高卡，导致上方信息层级和滚动密度明显不一致。修复：`src/css/studio.css` 改为单列 `150px` 高的左右两栏卡，且仅以当前本地图片作为预览，不复制参考的摄影素材。后续 E2E 以计算后的单列、同一行左右区域和 `150px` 高度锁定该行为。字体和文字层级已接近参考；间距、卡片圆角、深色画布和右侧图层轨结构一致；本地预览图的主体不同是有意的本地优先限制。仍有 P1：可见分类的完整预设数量、下滚动分类与固定底部 Cancel/Apply 尚未逐项补齐，因此本轮不能通过完整视觉验收。
11. 2026-07-14：Effect 分类改为 11 组、108 个原创本地配方后，更新同视口实现截图为 `/tmp/photo-studio-effect-app-v3.png`，合并对照为 `/tmp/photo-studio-effect-normalized-side-by-side-v3.png`。前五组按参考首屏的 11 / 20 / 12 / 10 / 5 密度和顺序展示，后六组可继续滚动；每项均为可编辑强度的本地像素配方。前轮“分类数量和下滚动分类缺失”的 P1 已解除。仍有 P1：参考 Effect 初始态的固定 Cancel/Apply 直接对应其自身预设会话；本地实现仍让每个预设在参数对话框内确认或取消，功能等价但视觉操作区不同。图片主体、字体文案与参考不同是刻意避开其素材和品牌资产的本地实现，不计为待修复的资产替换问题。
12. 2026-07-15：使用用户的同一张 Effect 参考图与当前本地 `2048 × 960` 截图，生成 `/tmp/effect-categories-reference-vs-local.png` 并人工检查。分类卡仍保持一列、左文字右当前本地图片，图层轨和画布空间均可见。Effect 现有固定 Cancel / Apply：配方先选中，Cancel 清空会话且不写历史，Apply 进入既有本地强度预览。前轮“无固定操作区”的 P1 已解除；仍有 P2：未选预设时 Apply 为可见禁用态，而参考初始截图呈蓝色可操作态。因项目不能在没有有效预设时产生伪操作，保留可见禁用语义；这不是完整视觉验收。
13. 2026-07-15：以用户的 Filter 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-dec50823-2954-4405-9e59-a38a1f39699f.png` 与本地 `1909 × 874` Filter 状态截图 `/tmp/photo-studio-filter-local-heading.png` 规范化后合并为 `/tmp/filter-reference-vs-local-heading.png`。本轮发现并修复跨侧栏 P1：本地标题栏原先左对齐、距顶部 16px，而参考为贴顶的 56px 居中标题栏；现已统一为贴顶、56px、标题居中、右侧关闭按钮，并由 Chromium 的几何 E2E 锁定。Filter 六张卡继续以当前本地图片生成预览，避免复制参考摄影素材；与参考的不同卡图和文案是有意的本地/原创限制。卡片的精细字重、图标和留白仍是 P2，需在各面板同状态对照中继续收敛。
14. 2026-07-15：以用户的 Text 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-92cb57c3-2689-40a3-b658-468110ab41af.png` 与本地 `1919 × 900` Text 状态截图合并为 `/tmp/text-reference-vs-local-density.png`。比较首轮显示项目侧预设卡为 86px 高、8px 间距，且创建入口与卡片区仅 21px，明显比参考首屏更拥挤；已收敛为 118px、14px、49px，并用 Chromium 几何 E2E 固定。参考中的成品艺术字卡是 Pixlr 素材，项目继续只提供原创可编辑文字配方，不将这项资产差异伪装为完成。Text 深层控件和固定操作区的细节仍属于后续视觉收敛，不能据此通过完整视觉验收。
15. 2026-07-15：以用户的 Liquify 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-b2bccdbf-be15-4ac8-b562-7e1158f803f8.png` 与本地 `2048 × 960` 状态截图合并为 `/tmp/liquify-reference-vs-local-icons-clean.png`。本轮移除了项目侧原先的六个文字格，改用 Font Awesome Free 6.7.2 的本地 SVG 图标并保留中文无障碍名称、悬浮提示和真实模式映射；工具格高度收敛为 40px。原生 miniPaint 属性框在自定义面板中隐藏，消除了 Size/Strength/Density 的重复控件。图标形制、状态信息和中文文案与参考仍不完全相同，属于后续 P2 细节；本轮不改变完整视觉验收的 blocked 状态。
16. 2026-07-15：夜间 Linux 视觉任务 `29363358966` 的唯一失败是 Draw 侧栏快照仍保留旧版文字工具按钮；下载诊断产物后，`/tmp/nightly-draw-expected-vs-actual.png` 与本地 `/tmp/local-nightly-draw-expected-vs-actual.png` 均确认实际图为已验收的图标工具格，非功能回退。已按同一状态刷新 Darwin 与 Linux 的 Draw 基准，并在本地 Chromium 视觉套件验证 5/5 通过；仍需在 Actions 的 Linux runner 复验，完整视觉验收继续保持 blocked。
17. 2026-07-15：以用户的 Retouch 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-3d247e0d-a7f9-4143-a11a-5def2a0c35e2.png` 与本地 `2048 × 960` 状态截图合并为 `/tmp/retouch-reference-vs-local-icons-clean.png`。本轮将 Repair、Clone、Detail、Toning 四类本地工作流由文字改为本地 Font Awesome 图标格，保留中文无障碍名称、悬浮提示和原有真实工具映射；并隐藏原生 miniPaint 属性框，移除与本地 Size 控件重复的第二组参数。参考中 Object 是 AI 辅助修复，按范围继续排除。图标形制、具体文字、间距和高级设置密度仍存在 P2 差异，本轮不改变完整视觉验收的 blocked 状态。
18. 2026-07-15：以用户的 Adjust 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-e0c8a20b-5d10-449a-a8f2-30d329a2c3c2.png` 与本地 `2048 × 960` 状态截图合并为 `/tmp/adjust-reference-vs-local-icons.png`。本轮将 Auto、B&W、Pop 从普通文本按钮收敛为参考同层级的图标加名称快捷卡；图标来自 Font Awesome Free，本地三项真实映射、历史和撤销保持不变。参考中的精细字重、提示文本、滑杆竖向密度及深层分组仍有 P2 差异，完整视觉验收继续保持 blocked。
19. 2026-07-15：以用户的 Filter 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-dec50823-2954-4405-9e59-a38a1f39699f.png` 与本地 `2048 × 960` 状态截图合并为 `/tmp/filter-reference-vs-local-icons.png`。六张滤镜卡继续只使用当前本地图片作为缩略图，不复制 Pixlr 摄影素材；本轮新增类别图标，收敛每卡标题、描述与右下图标的信息层级。卡片不同的预览主体和原创中文描述是本地/原创限制；精细字重、内边距及滤镜深层参数仍属 P2，完整视觉验收继续保持 blocked。

final result: blocked — 视觉工作台已具备同状态验收基准，但非 AI 工具矩阵尚未全部完成。
