# 编辑器视觉对照 QA（进行中）

- 参考截图：`/tmp/pixlr-express-editor.png`
- 实现截图：`test/e2e/visual.spec.mjs-snapshots/editor-loaded-chromium-darwin.png`
- 同输入组合对照：`/tmp/photo-studio-editor-qa-comparison-v2.png`
- 视口：`1920 × 878`
- 对照状态：两侧均为已打开的 `3840 × 2880` 栅格照片，缩放均为 `26%`。实现侧使用仓库内固定测试图片；照片内容不作为视觉相似度判定对象。

## 已验证

- [通过] 中心画布在固定视口下以约 `1000 × 750` 的可见区域居中展示，尺寸、黑色工作台、左右留白与参考的结构一致。
- [通过] 右侧为窄图层轨，包含实际栅格缩略图、当前层选中态、锁定操作及可收起入口。
- [通过] 底栏展示文档尺寸、带本地放大镜正负图标的缩放、撤销/重做、关闭和单一“保存”入口；保存菜单包含本地项目保存、图片导出与原生项目导出，控制均连接到实际编辑器状态，而不是静态视觉占位。
- [通过] 左侧只提供非 AI 的编辑工具入口；不存在 AI Tools 或 Element 入口。

## 仍需收敛的视觉差异

- [P2] 左侧工具轨及其工作区起点已统一为 56px；Home、Cutout、Adjust、Effect、Filter、Liquify、Retouch 已换成本地开源功能图标，Liquify 采用旋涡形图标而非阴阳符号。其余图标精确笔画、按钮分隔与工具间距仍需逐项收敛。
- [P2] 图层锁定已使用本地圆形锁定/解锁图标，并按同状态参考收敛为 32px 外圈、14px 图标；图层轨留白和外圈精细描边仍需继续对照。
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
20. 2026-07-15：以用户的 Crop 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-3241fff8-a541-45be-a1c1-fc1f40185d54.png` 与本地 `2048 × 960` 状态截图合并为 `/tmp/crop-reference-vs-local-icons.png`。Rotate & flip 的四项已从文字按钮改为本地 Font Awesome 图标工具格，保留中文无障碍名称、悬浮提示和既有本地旋转/翻转会话映射。工具格的图标、名称和 40px 最低高度由 Chromium E2E 锁定。中英文文案、图标形制、面板精细间距仍有 P2 差异，完整视觉验收继续保持 blocked。
21. 2026-07-15：以用户的 Cutout 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-c847fbaa-b8dc-408a-bbfa-ba4fe4a9b227.png` 与本地 `2048 × 960` 状态截图合并为 `/tmp/cutout-reference-vs-local-icons.png`。在明确移除 AI Cutout 的前提下，形状、魔术、画笔、自由套索四项保留手动工具已从文字改为仓库内本地图标格，保留中文无障碍名称、悬浮提示和既有的本地遮罩/像素编辑映射。参考与实现的图标形制、文案和深层参数密度仍有 P2 差异；本轮不改变完整视觉验收的 blocked 状态。

22. 2026-07-15：以用户的 Adjust 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-e0c8a20b-5d10-449a-a8f2-30d329a2c3c2.png` 与本地 `2048 × 960` 状态截图合并为 `/tmp/adjust-reference-vs-local-section-icons.png`。Color 的设置和 Light 的半明暗入口已从文字按钮收敛为同层级本地图标，并保留中文无障碍名称、提示和现有本地参数预览流程。高级 Details/Scene 的图标密度、分组间距与精细字重仍是 P2 差异；完整视觉验收继续保持 blocked。

23. 2026-07-15：以用户的 Crop 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-3241fff8-a541-45be-a1c1-fc1f40185d54.png` 与本地相同工具状态合并为 `/tmp/crop-reference-vs-local-after-structure.png`。本轮将宽/高从并列输入收敛为参考对应的纵向行，并将四个旋转/翻转工具与两个尺寸入口分别放入具名、分层的操作区；所有既有本地处理、固定确认区和自动化语义保持不变。字体、按钮尺寸、精确留白和参考中未实施的 Smart resize 仍存在差异，其中 Smart resize 按无 AI 范围明确排除；完整视觉验收继续保持 blocked。

24. 2026-07-15：以用户的 Adjust 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-e0c8a20b-5d10-449a-a8f2-30d329a2c3c2.png` 与本地同状态图合并为 `/tmp/adjust-reference-vs-local-after-top-level.png`。去除本地额外的顶端说明段落后，首屏从 Auto / B&W / Pop 快捷卡开始，Color 与 Light 的位置、分组层级和纵向密度更贴近参考；已有的本地预览、Apply/Cancel 和 Undo 语义不变。图标精确形制、字号与未露出的深层分组仍有 P2 差异，完整视觉验收继续保持 blocked。

25. 2026-07-15：以用户的 Filter 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-dec50823-2954-4405-9e59-a38a1f39699f.png` 与本地同状态图合并为 `/tmp/filter-reference-vs-local-after-top-level.png`。去除本地额外的顶部说明后，HDR 第一张本地滤镜卡紧接标题栏出现，避免把参考的卡片浏览区下推；六个确定性本地滤镜、预览、锁定保护与撤销不变。卡片内本地测试图不复制参考摄影素材，且精确卡高、字体及留白仍为 P2 差异，完整视觉验收继续保持 blocked。

26. 2026-07-15：以用户的工作台截图与本地 `1920 × 878` 已加载图片状态再次对照。底栏由“关闭、保存项目、格式、导出图片、导出项目”收敛为参考同层级的“关闭 + 保存”；保存菜单保留所有本地保存/导出能力，并有单独 E2E。Crop 与 Cutout 的底层原生属性盒在自定义面板中已隐藏，分别消除了重复裁剪卡与空白圆角盒。Darwin 视觉基准和同一 Linux runner 的实际产物均已更新，最终 Nightly `29387709046` 148/148 通过。各工具卡片的字体、间距、图标形制等 P2 差异仍存在，完整视觉验收继续保持 blocked。

27. 2026-07-15：Cutout 顶部关闭由单纯隐藏面板改为真正丢弃未应用会话：Keep/Remove、反选和 Hint removed 恢复默认，遮罩清理，且不产生 Undo 项；重新打开时回到默认 Keep。此项有先失败后通过的 Chromium E2E，CI `29389070942` 与 Pages `29389070918` 已成功。该改动不改变已应用的本地像素编辑；图标形制和间距仍为 P2，完整视觉验收继续保持 blocked。

23. 2026-07-15：以用户的 Draw 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-70d08cad-e759-49dd-8719-64ef55994f06.png` 与本地 `2048 × 960` 状态截图合并为 `/tmp/draw-reference-vs-local-final.png`。首轮对照确认项目的五个图标曾被压成一行、顶部“添加新图层”挤掉了参考的核心参数层级，且颜色仅显示为窄色块。修复后，首屏按参考变为 3 + 2 图标格、通栏白色颜色输入及 Size / Softness / Transparency；新建图层、调色板、笔刷模式、取色、渐变与形状快捷项仍保留在可滚动扩展区。Chromium E2E 固定了首项顺序、3 列网格、85px 图标格高度、默认白色及 315px 通栏输入；当前未提供参考的笔刷预览细节、图标线条、中文文案和纵向间距仍属 P2，完整视觉验收继续保持 blocked。

28. 2026-07-15：以用户的 Draw 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-70d08cad-e759-49dd-8719-64ef55994f06.png` 和本地同状态画面复核后，补上参考可见的棋盘格笔刷预览：它是随颜色、尺寸、柔化、透明度实时重绘的本地 Canvas，默认展示 40px 白色柔边笔刷，而非静态图片。Chromium E2E 覆盖预览状态变化；初轮 Linux Nightly 仅因旧 Draw 基准差异失败，更新实际基准后，CI `29390724440`、Pages `29390724444` 与 Nightly `29390735917` 全部通过，Nightly 为 150/150。调色板弧形布局、图标线条、中文文案和纵向间距仍属 P2，完整视觉验收继续保持 blocked。

29. 2026-07-15：九张用户参考图均体现工具轨悬停时会出现跨入参数面板的蓝色工具标签，而此前本地工具轨只提供浏览器原生 title，无法形成同样的可见反馈。本轮为十个保留非 AI 工具加入本地伪元素标签，保留中文 title/无障碍语义，同时以 ARRANGE、CROP、CUTOUT、ADJUST、EFFECT、FILTER、LIQUIFY、RETOUCH、DRAW、TEXT 对齐参考的视觉层级。Chromium E2E 同时验证十个标签及 hover 的内容、显示状态、色值；该状态默认不显示，不改变已建立的初始截图基准。图标具体形制和逐工具细部间距仍属 P2，完整视觉验收继续保持 blocked。

30. 2026-07-15：Draw 的功能清单不再只停留在入口可点。固定 270px 本地底图上，Plain、Parallel、Sketchy、Shaded、Furry、Trail、Crayon、Ink 八种笔刷模式均已逐项确认图层参数、实际像素变化及单步 Undo；Ellipse、Triangle、Star、Heart、Line 也与原有 Rectangle 一起具有像素/Undo 证据。该批没有修改首屏视觉，因此未重新跑夜间截图任务；调色板弧形布局、图标线条、中文文案和纵向间距继续作为 P2，完整视觉验收继续保持 blocked。

31. 2026-07-15：以用户的 Draw 参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-70d08cad-e759-49dd-8719-64ef55994f06.png` 和本地浏览器同状态截图 `/Users/messy/.config/browser-harness/tmp/shot.png` 合并为 `/tmp/draw-palette-reference-vs-local.png`。此前本地 11 个色样常驻在侧栏内，和参考的颜色输入右端下拉入口、画布边缘浮层不一致；现改为本地下拉按钮与浮层，打开/关闭和色样选择均为实际交互，选择后会同步画笔、形状、渐变并自动收起。对照确认首屏工具、输入、笔刷预览、滑杆和色样浮层的层级已对应；色样的精确弧形轨迹、图标线条、中文文案和纵向间距仍属 P2，完整视觉验收继续保持 blocked。

32. 2026-07-15：以用户的编辑器参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-4c219a47-27ec-4d7e-b429-edfc99354ca4.png` 与本地锁定图层状态截图合并为 `/tmp/layer-lock-reference-vs-local.png`。此前右侧图层卡只显示中文“锁定/解锁”胶囊，和参考的缩略图中央圆形锁定状态明显不一致；现使用仓库本地的 Font Awesome Free 锁定/解锁 SVG，锁定时以中置深色圆形白锁呈现，缩略图青色选中边仍独立保留。点击图标或按钮本身均保持同一可撤销锁定动作，并有 aria 标签和 E2E 验收。图片内容不同只来自本地空白画布，不作为视觉差异结论；图标精确大小和轨道边距仍属 P2，完整视觉验收继续保持 blocked。

33. 2026-07-15：以用户的编辑器参考图 `/var/folders/20/2p51l8s151x5vk1dyttm0_gc0000gn/T/codex-clipboard-4c219a47-27ec-4d7e-b429-edfc99354ca4.png` 与本地截图合并为 `/tmp/tool-rail-reference-vs-local.png`。本轮将 Home、Cutout、Adjust、Effect、Retouch 从底层编辑内核的无关图标收敛到本地开源的房屋、剪刀、滑杆、魔法棒和创可贴图标，保持原有工具路由与无 AI 范围。对照确认功能图标层级与参考一致；参考和本地的截图画布内容不同不作为判定，轨道的精确宽度、剩余五个图标笔画和按钮间距仍为 P2，完整视觉验收继续保持 blocked。

34. 2026-07-15：工具轨图标变更后，Darwin 基准在本地按视觉分组通过；Linux Nightly 首轮 144 条功能用例通过、9 条视觉用例仅因旧工具轨基准失败。已从 GitHub Ubuntu runner 的实际截图回写 9 张 Linux 基准，并移除 Nightly 诊断中的 trace zip，避免基准问题下载数百 MB 的无关产物。最终 CI `29400335816`、Pages `29400336162` 与 Nightly `29400356619` 全部成功；完整视觉验收仍因矩阵其他 P2 项保持 blocked。

35. 2026-07-15：以用户的编辑器参考图与本地同状态截图合并为 `/tmp/tool-rail-reference-vs-local-v3.png`。工具轨、未打开工具时的工作区起点，以及 Crop/Adjust/Effect 固定底栏均已共用精确 56px 基准；Effect 改用参考同层级的半明暗图标，Filter 改用点阵图标，Liquify 改用本地阴阳旋涡图标。浏览器实测工具轨及工作区左边界均为 56px，单元、专项 E2E、Darwin 13 张视觉快照和生产构建通过。Linux Nightly `29403257122` 的 145 项功能回归通过，8 项失败仅为改动后的侧栏视觉基准；已由该 Ubuntu runner 实际截图刷新 Linux 基准，最终 CI `29404410709`、Pages `29404410756`、Nightly `29404430758` 均成功，Nightly 为 153/153。Liquify 的精确螺旋、按钮分隔线和图标笔画仍为 P2，完整视觉验收继续保持 blocked。

36. 2026-07-15：以用户编辑器参考图与同视口本地工作台再次合并复核，底栏 Close 由蓝色主操作收敛为参考的透明描边次操作；Save 仍是唯一青色主入口。专项 Chromium 状态栏断言、全量 `npm test` 及构建均已通过。首次 Linux Nightly `29410350702` 的 147 条功能用例通过，8 条侧栏截图仅因该全局底栏样式变化而与旧 Linux 基准不一致；已从同一 Ubuntu runner 下载其实际截图并刷新基准，最终 Nightly 复验待本轮提交后执行。此项不改变完整视觉验收的 blocked 状态。

37. 2026-07-15：以用户 Crop 参考图与当前 `1920 × 878` 本地 Crop 状态合并为 `/tmp/crop-reference-vs-local-primary-section.png`。此前本地把宽高、拉直和比例切成三个互不相连的卡片，拉直滑杆也未占满主卡宽度；参考将它们置于同一连续主卡。现已重组为单一主卡，并使拉直控件占完整可用宽度。所有侧栏标题同时补上参考可见的 6px 斜纹底缝，不改变 56px 标题节奏或实际控件坐标。Crop 结构专项、Darwin 视觉基准、`npm test` 与生产构建已通过；Linux 视觉基准需在本轮发布后的 Ubuntu runner 上刷新和复验。完整视觉验收继续保持 blocked。

38. 2026-07-15：以用户 Adjust 参考图与当前同状态截图合并为 `/tmp/adjust-reference-vs-current-after-shortcuts.png`。此前本地将 Auto、B&W、Pop 画成三个独立描边卡，参考则是在同一个连续快捷调整容器中排列三项，且 Color 区的起点更低。现已使用共享容器、80px 快捷项高度和无独立边框的真实按钮，使 Color 区首行与参考的垂直节奏对齐；原有三项本地效果映射、历史和撤销不变。快捷容器几何专项、Adjust Darwin 视觉基准、`npm test`、生产构建与 CI `29415965785` 均通过。首轮 Ubuntu Nightly `29416024093` 的 155 项功能/其余视觉用例通过，仅 Adjust 因旧 Linux 基准差异失败；已从同一 runner 的实际图刷新该平台基准，最终 CI `29416791232`、Pages `29416791306` 与 Ubuntu Nightly `29416791332` 均通过（156/156）。完整视觉验收继续保持 blocked。

39. 2026-07-15：以用户 Filter 参考图与当前同状态截图合并为 `/tmp/filter-reference-vs-current-padded-cards.png`。此前本地六个可点击滤镜卡是全宽、紧凑的通用按钮，图片贴边、说明区高度不足；参考以边距明确的浏览卡呈现图片、标题、说明和分类图标。现已给每张真实本地滤镜卡增加 16px/18px 内边距、132px 预览、80px 说明区和 18px 卡间距，仍使用用户当前本地图片而不复制参考摄影素材。六卡几何专项、Filter Darwin 视觉基准、`npm test` 与生产构建已通过；首轮 Ubuntu Nightly `29418557819` 为 155/156，仅 Filter 因旧 Linux 快照失败。已从该 runner 产物刷新 Linux 基准，CI `29419228637`、Pages `29419228168` 与最终 Ubuntu Nightly `29419238796` 均成功（156/156）。完整视觉验收继续保持 blocked。

40. 2026-07-15：以用户编辑器参考图与本地已加载图片状态合并为 `/tmp/main-reference-vs-current-lock-32.png`。参考截图先剥离浏览器 Chrome 区域，再与 1920×878 本地工作台对齐，避免把浏览器框架误判成编辑器差异。右侧缩略图中央锁定圆标从 34px/15px 收敛为 32px/14px，以贴近参考的圆标尺度；锁定、解锁和单步撤销行为不变，并由 Chromium E2E 固定。工具轨细笔画、图层轨留白和外圈描边仍是 P2，完整视觉验收继续保持 blocked。

41. 2026-07-15：继续使用同状态工作台合图 `/tmp/main-reference-vs-current-zoom-icons.png`。参考的缩放区为放大镜减号、百分比、放大镜加号；项目原先只显示减号和加号文本。现替换为仓库内 Font Awesome Free 的本地 SVG，缩放动作、无障碍标签和状态值不变；定向 E2E、Darwin 工作台快照、单元测试和生产构建已通过。其余工具轨笔画、图层轨留白仍是 P2，完整视觉验收继续保持 blocked。

42. 2026-07-15：图层锁定圆标与缩放图标作为同一工作台视觉批次提交。Linux CI `29422688570`、Pages `29422688662` 与最终 Ubuntu Nightly `29422747371` 均成功，Nightly 156/156；因此确认新图标的本地资源、锁定语义、工作台布局及跨平台截图没有回退。工具轨细笔画、图层轨留白仍是 P2，完整视觉验收继续保持 blocked。

43. 2026-07-15：以用户编辑器参考图剥离浏览器框架后的同视口状态，与本地工作台合并为 `/tmp/main-reference-vs-current-liquify-hurricane.png`。此前 Liquify 在工具轨中使用阴阳符号，和参考的旋涡变形语义不对应；现改为仓库内 Font Awesome Free 6.7.2 的 Hurricane 图标，保持既有本地 Liquify 路由、无障碍标签和无 AI 边界。先见证工具轨资产断言失败，再通过专项 Chromium E2E、Darwin 工作台视觉快照、`npm test` 13/13 和生产构建。Linux CI `29424078297`、Pages `29424078122` 与 Ubuntu Nightly `29424662244` 已通过，Nightly 为 156/156；图标精细笔画、按钮分隔和图层轨留白继续是 P2，完整视觉验收保持 blocked。

44. 2026-07-15：以用户 Adjust 参考图和本地非悬停打开态合并为 `/tmp/adjust-reference-vs-current-open-panel.png`。十个工具的可见面板标题从本地化描述收敛为参考同层级的 Arrange、Crop、Cutout、Adjust、Effect、Filter、Liquify、Retouch、Draw、Text；工具按钮仍保留中文 `title` 和无障碍语义。截图测试在点击后将指针移回画布，避免把蓝色悬停标签误冻结为面板常态，同时保留专门的 hover 交互断言。先见证 Adjust 旧基准失败，再更新 Darwin 9 张侧栏快照；Ubuntu Nightly `29427267592` 的 148 项非基准检查通过，9 项旧 Linux 快照如预期失败。下载实际图并逐项与旧图对照后，仅回写这 9 张同 runner 基准；最终 CI `29428152228`、Pages `29428150216` 与 Ubuntu Nightly `29428195889` 均通过，Nightly 157/157。图标精细笔画、按钮分隔和图层轨留白继续是 P2，完整视觉验收保持 blocked。

45. 2026-07-15：以用户编辑器参考图与本地工作台合并为 `/tmp/main-reference-vs-current-footer-copy.png`。参考底栏使用放大镜缩放、百分比、UNDO、REDO、Close 与 Save；项目已使用本地放大镜 SVG，本轮将剩余可见文案从中文收敛为 UNDO、REDO、Close、Save，并同步保存菜单的可见英文工作流名称。按钮保留中文无障碍标签，实际本地保存、PNG/JPEG/WebP 导出、原生项目导出和最近项目恢复不变。先见证 Close/Save 文案断言失败，再通过保存/恢复定向 Chromium E2E；Darwin 快照以强制更新方式写入当前稳定状态。`npm test` 13/13、生产构建、CI `29429658191`、Pages `29429658418` 与 Ubuntu Nightly `29429753536` 均成功，Nightly 157/157。工具图标精细笔画、按钮分隔和图层轨留白仍为 P2，完整视觉验收保持 blocked。

46. 2026-07-15：对九张用户侧栏参考图的逐项清单进行了状态审计。Crop、Cutout、Adjust、Effect、Filter、Liquify、Retouch、Draw、Text 的控件级范围保持 C/K/J/E/F/L/R/D/T 编号；保留项均有真实本地行为和测试证据，AI Cutout、Smart Resize、Object Healing、AI Tools 与 Element 均保持明确排除。新增 `test/requirements-audit.test.mjs`，会校验高层需求/矩阵使用“功能可用；视觉 P2”双维状态、覆盖九个侧栏范围，并保护 AI/Element 排除约束；`npm test` 为 16/16。此批仅修正验收语义，不刷新视觉截图。图标笔画、轨道留白、面板密度等 P2 仍阻止完整视觉还原结论。

47. 2026-07-16：以用户提供的主工作台参考图与本地同视口工作台合并复核为 `/tmp/reference-vs-local-rail-before.png`。本地非激活工具此前继承 miniPaint 按钮的圆角和双层阴影，视觉上被切成十个独立卡片；参考为连续深色工具轨，仅以激活态和悬停标签区分工具。现将工具轨入口强制为无圆角、无阴影，保留 56px 几何、激活态、悬停标签、无障碍名称和真实工具路由。新增 `test/workbench-visual-contract.test.mjs` 保护这一视觉契约；浏览器实测 `borderRadius=0px`、`boxShadow=none`，`npm test` 17/17、生产构建通过。图层轨留白、图标精确笔画和各参数面板密度仍为 P2。

48. 2026-07-16：以用户的 Crop 参考图与本地同状态面板合并为 `/tmp/crop-reference-vs-local-four-grid.png`。参考在 Rotate & flip 区域将四个变换动作横向排成一行，本地此前仍是 2×2 格，造成显著的首屏结构差异。现将真实旋转/翻转按钮改为四列单行网格，动作、悬停说明和撤销行为不变；Chromium 断言网格实际计算为四列。`npm test` 17/17 与生产构建通过。面板的字体、图标笔画、细节间距仍为 P2，完整视觉验收继续保持 blocked。

49. 2026-07-16：以用户 Cutout 参考图和本地同状态面板合并为 `/tmp/cutout-reference-vs-local-card.png`。在明确删除 AI Cutout 后，参考剩余的手动工作流仍有三段清晰卡片：工具/模式、形状/羽化、操作；原本本地以分散横线分组，首屏层级较弱。现将手动工具、形状与操作收敛为三张有描边的本地卡片，保留 Shape/Magic/Draw/Lasso、Keep/Remove、羽化、反选、重置、应用、加减选及本地撤销；可见操作文案收敛为通用英文，中文无障碍标签不变。浏览器实测三卡均为 `7px` 圆角且有边框；`npm test` 17/17、生产构建通过。未复制 AI 入口、Pixlr 品牌或外部素材；其余图标笔画、字体及画布图片载入差异仍为 P2。

50. 2026-07-16：以用户 Retouch 参考图和本地加载实图后的同状态工作台合并为 `/tmp/retouch-reference-vs-local-injected-method-card.png`。参考把 Method 与 Size 放在同一张次级卡片；本地此前将 Size 游离在卡片之外，且“修复方法”中文文案破坏了英文工作流层级。现将保留的 Spot 修复与 Size 收进同一张 Method 卡，Spot 在 Object（明确排除的 AI 依赖能力）不存在时占完整可用宽度；Repair/Clone/Detail/Toning 四个本地工具、笔刷像素处理、锁定保护和撤销均不变。浏览器实测 Method 卡的 Spot、Size 与无 Object 条件；`npm test` 17/17、生产构建通过。图标笔画、细微尺寸与其余面板密度仍为 P2。

51. 2026-07-16：Liquify 参考图在正式可用态直接以六个变形入口、Size、Strength、Density 与 High quality preview 组织首屏；本地此前在 WebGL2 可用但尚未开始会话时仍显示一条状态文案，且滑杆标题为中文，压低了工具首屏。现将可用且无预览会话的状态行隐藏（不可用或预览进行中仍明确显示本地状态），并将四个首屏参数文案收敛为英文。六个纯本地 WebGL2 模式、预览、取消、应用、锁定保护和回退提示均不变；Chromium 断言参数标签和原有可用/不可用分支仍存在，`npm test` 17/17、生产构建通过。图标笔画与细微密度继续为 P2。

52. 2026-07-16：Effect 与 Filter 的参考首屏均为英文浏览流；本地卡片几何已对齐，但类别数量、预设说明、后退/操作和滤镜描述仍是中文，形成明显的跨语言视觉差异。现将这些可见、通用的工作流文案收敛为独立英文描述：Effect 卡显示效果数、Local preview & apply、Back、All effects/Contrast/Blur/Cancel/Apply；Filter 六卡使用自主英文描述而非复制 Pixlr 文案。所有效果和滤镜仍是本地图片像素操作，无远程素材或模型请求。Filter 首卡描述新增 E2E 断言；`npm test` 17/17、生产构建通过。卡片图片、图标精度和纵向密度仍为 P2。

53. 2026-07-16：以用户 Draw 与 Text 参考图分别和本地实图同状态画面合并为 `/tmp/draw-reference-vs-local-english.png`、`/tmp/text-reference-vs-local-english.png`。Draw 原本已具备参考的 3+2 图标格、颜色输入、棋盘格笔刷预览及三条滑杆，Text 原本已具备新增文字入口、双列 76 个原创本地预设；但可见辅助文案仍以中文混入参考的英文工作流。现将 Draw 的 Tool/Color/Brush/Size/Softness/Transparency 和扩展项、Text 的 Add new text/New default text/Editable 及样式表单收敛为英文，Adjust 固定底栏同步为 Cancel/Apply。中文无障碍名称、所有本地绘制/文字行为、原创模板和撤销均不变。浏览器实测 Draw 三条标签和 Text 入口/预设；新增 E2E 标签断言，`npm test` 17/17、生产构建通过。模板字形、图标笔画和精细间距继续为 P2。

54. 2026-07-16：以用户的主工作台参考图剥离浏览器 Chrome 后，与 browser-harness 的同视口本地工作台合并为 `/tmp/main-reference-vs-local-app-latest.png`。采样对照确认左工具轨均为约 `rgb(40,40,40)`、中心工作台为约 `rgb(24,24,24)`，但本地右图层轨和底栏分别为 `rgb(34,34,34)`、`rgb(36,36,36)`，比参考的 `rgb(40,40,40)` 明显偏暗。现将右图层轨与底栏统一为 `#282828`；浏览器实测两处均为 `rgb(40, 40, 40)`，并增加静态视觉契约。`npm test` 18/18、`npm run build` 通过。图层轨的精细留白、图标笔画与各参数面板的 P2 仍未全部消除。

55. 2026-07-16：以用户 Crop 参考图和 browser-harness 的同视口、同文件打开状态合并为 `/tmp/crop-reference-vs-local-latest.png`。对照发现本地 Crop 仍混入中文 Width/Height/Straighten/比例、旋转和尺寸文案，且拉直轨道为青色；参考首屏使用英文工作流与中性灰拉直滑杆。现仅替换可见的通用工作流文字为 Width、Height、Straighten、Select aspect、Rotate & flip、Resize、Image size、Canvas size、Cancel、Apply，保持中文 aria 标签；拉直轨道改为 `#777`。browser-harness 实测可见文案和 `accent-color=rgb(119,119,119)`，更新后合图为 `/tmp/crop-reference-vs-local-english-current.png`。`npm test` 18/18、`npm run build` 通过。Smart Resize 仍按明确无 AI 范围排除；精细字体、图标笔画和间距仍为 P2。

56. 2026-07-16：以用户 Cutout 参考图和 browser-harness 的同视口实图打开状态合并为 `/tmp/cutout-reference-vs-local-english-current.png`。AI Cutout 按范围继续不渲染，但手动工作流的 Tool、Mode、Shape 标题仍显示中文，与参考的英文层级不一致。现将这三个可见标题改为 Tool、Mode、Shape；图标的中文 aria/title、Shape/Magic/Draw/Lasso、Keep/Remove、羽化、Hint、反选、重置、应用和本地撤销均不变。browser-harness 实测 Tool/Mode/Shape/Softness、Keep、Apply cutout 均正确可见；`npm test` 18/18、`npm run build` 通过。AI Cutout 的缺位为既定范围，不计为待复制项；细微图标笔画、字体与卡片间距仍为 P2。

final result: blocked — 所有保留的非 AI 功能已具备逐项清单和自动化证据；固定视口下的工作台与面板 P2 视觉差异仍未全部消除。
