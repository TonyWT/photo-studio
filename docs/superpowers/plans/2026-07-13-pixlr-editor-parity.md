# Pixlr 编辑器非 AI 还原 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 miniPaint 外壳替换为参考 Pixlr Express 的非 AI 桌面编辑工作台，并逐项验证保留功能。

**Architecture:** 保持 miniPaint 的 Canvas、图层和操作历史为唯一编辑内核。新增 `studio` 工作台控制器负责工具轨、参数面板、底栏、图层轨和工具到内核操作的映射；页面不加载 Pixlr 资源、模型服务或在线素材服务。

**Tech Stack:** 原生 ES Modules、Webpack、Canvas、IndexedDB、Node test runner、Playwright、browser-harness RPA。

## Global Constraints

- 目标截图为 `1920 × 878` 的桌面已打开图片状态；优先实现编辑器，首页仅保留打开/新建职责。
- 不复制 Pixlr 品牌、文本、图像、头像、图标或远程素材；使用项目已有开源图标资产或本地可授权图标库。
- AI Tools、AI Cutout、Element、远程图片与在线字体必须从 UI、快捷键和请求路径中消失。
- 任何 `A-*` 功能的完成证据必须同时包含可达入口、真实编辑结果和撤销/重做或取消语义。

---

### Task 1: 冻结需求矩阵与工作台视觉合同

**Files:**
- Create: `docs/pixlr-express-parity-matrix.md`, `test/editor-shell-contract.test.mjs`
- Modify: `editor/index.html`, `src/css/studio.css`

- [ ] 写失败测试，断言工作台存在 `editor-tool-rail`、`editor-workspace`、`editor-layer-rail`、`editor-statusbar`，且工具数组没有 `ai`、`element`。
- [ ] 用语义化 DOM 重新组织编辑器壳层；不触碰 `canvas_minipaint`、miniPaint 右侧原始组件的初始化 ID。
- [ ] 添加在 `1920×878` 下的 Playwright 视觉基准，覆盖空画布和已打开图片状态。
- [ ] 运行 `npm test` 和 `npm run test:e2e:nightly`。

### Task 2: 工具轨、底栏和图层轨

**Files:**
- Create: `src/js/studio/tool-registry.mjs`, `src/js/studio/workbench-controller.mjs`
- Modify: `src/js/studio/editor-shell.mjs`, `editor/index.html`, `src/css/studio.css`
- Test: `test/tool-registry.test.mjs`, `test/e2e/workbench.spec.mjs`

- [ ] 定义 `TOOL_REGISTRY`：`home/arrange/crop/cutout/adjust/effect/filter/liquify/retouch/drawing/text`，每项含 `id`、`label`、`icon`、`panel`、`miniPaintActions`。
- [ ] 渲染 56px 工具轨，点击后设置唯一 `data-active-tool` 并显示 280px 参数面板。
- [ ] 将缩放、撤销、重做、关闭、保存和导出放入底栏；将 miniPaint 图层数据渲染为右侧缩略图轨。
- [ ] 用 E2E 验证工具切换、缩放、撤销/重做、图层选择与项目保存。

### Task 3: Arrange、Crop 和手动 Cutout 面板

**Files:**
- Create: `src/js/studio/panels/arrange-panel.mjs`, `src/js/studio/panels/crop-panel.mjs`, `src/js/studio/panels/cutout-panel.mjs`
- Modify: `src/js/studio/workbench-controller.mjs`, `src/js/studio/editor-shell.mjs`
- Test: `test/panels.test.mjs`, `test/e2e/edit-core.spec.mjs`

- [ ] 为 Arrange 映射文字/形状添加、透明度、图层移动、删除、旋转和翻转。
- [ ] 为 Crop 映射裁剪工具、比例预设、尺寸、旋转/翻转与取消/应用；取消必须恢复进入面板前状态。
- [ ] 为 Cutout 映射手动选区、魔术橡皮、橡皮、Keep/Remove、容差、柔化、连续、反选、重置和应用；不出现 AI Cutout。
- [ ] 用固定 PNG 验证图层顺序、裁剪尺寸、透明像素和撤销/重做。

### Task 4: Adjust、Effect、Filter、Liquify 与 Retouch 面板

**Files:**
- Create: `src/js/studio/panels/adjust-panel.mjs`, `src/js/studio/panels/effects-panel.mjs`, `src/js/studio/panels/liquify-panel.mjs`, `src/js/studio/panels/retouch-panel.mjs`
- Modify: `src/js/tools/bulge_pinch.js`, `src/js/studio/workbench-controller.mjs`
- Test: `test/image-baselines.test.mjs`, `test/e2e/effects.spec.mjs`

- [ ] 将现有色彩校正、自动调整、模糊、锐化、去色和内核 Effects 映射到分组参数面板。
- [ ] 为每个参考 Filter 卡片标明真实本地实现；缺少算法时补本地 Canvas/WebGL 算法后才可标记完成。
- [ ] 将 Liquify 改为临时预览、应用、取消和完整撤销记录；无 WebGL2 时显示不可用而不请求远程服务。
- [ ] 将修复/克隆/模糊锐化/减淡加深映射到 Retouch 面板。
- [ ] 生成 PNG 结果与基准差异图，JPEG 仅检查可解码和尺寸。

### Task 5: Drawing、Text、Collage 与本地文件流

**Files:**
- Create: `src/js/studio/panels/drawing-panel.mjs`, `src/js/studio/panels/text-panel.mjs`, `src/js/studio/collage.mjs`
- Modify: `src/js/studio/home.mjs`, `src/js/studio/project-store.mjs`, `index.html`
- Test: `test/e2e/drawing-text-collage.spec.mjs`

- [ ] 将画笔、铅笔、填充、渐变、形状和颜色/大小/透明度映射到 Drawing。
- [ ] 将系统字体文字、填充、描边、阴影、对齐映射到 Text；没有本地实现的曲线/变形保持明确未完成状态，补齐后再勾选矩阵。
- [ ] 实现本地拼贴网格新建、图片放置、图层编辑和导出。
- [ ] 验证导入、项目恢复、导出 PNG/JPEG/WebP、项目 JSON 和拼贴导出。

### Task 6: 排除策略、逐项测试和发布

**Files:**
- Modify: `test/no-remote-features.test.mjs`, `test/e2e/smoke.spec.mjs`, `test/e2e/visual.spec.mjs`, `.github/workflows/*.yml`, `README.md`, `docs/pixlr-express-parity-matrix.md`
- Create: `design-qa.md`

- [ ] 扩展禁止项测试：AI Tools、AI Cutout、Element、远程请求、远程字体、隐藏快捷键均不可用。
- [ ] 为矩阵每个 `A-*` 行链接一个 Node/图像/E2E/RPA 用例；仅在证据存在时更新矩阵状态。
- [ ] 以参考和本地同尺寸截图进行设计 QA，修复所有 P0/P1/P2 差异并记录到 `design-qa.md`。
- [ ] 初始化 `main` 历史，创建或连接用户确认的 GitHub Pages 仓库，推送并验证 Pages URL 与 Actions 状态。
