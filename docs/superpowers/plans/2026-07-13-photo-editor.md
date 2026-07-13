# 无 AI 网页图片编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 miniPaint 做一个桌面端、本地优先、无 AI/Element 的网页图片编辑器，并接入可重复执行的质量门。

**Architecture:** 将 miniPaint 作为栅格编辑内核，新增独立主页和本地项目仓库；编辑器继续使用其图层、滤镜、文字和手动选区能力。首页通过 IndexedDB 暂存文件/项目，将用户带入 `/editor/`；无任何后端或模型端点。

**Tech Stack:** 原生 JavaScript、Webpack、Canvas、IndexedDB、Node test runner、Playwright、GitHub Actions。

## Global Constraints

- 桌面 Chromium 为自动化验收浏览器；不引入账号、云端存储、AI 或 Element。
- 保留 miniPaint 的 MIT 许可，保留其现有编辑能力，只替换品牌和工作流壳层。
- 每个自研交互必须有 `data-testid`；日常 RPA 不使用 LLM 或云端 Browser Use Agent。

---

### Task 1: 导入编辑内核并删除外部功能

**Files:**
- Create: `src/`、`images/`、`MIT-LICENSE.txt`
- Modify: `index.html`、`src/js/config.js`、`src/js/config-menu.js`、`package.json`
- Test: `test/no-remote-features.test.mjs`

- [x] 导入 miniPaint 源码和许可文件，保留可构建的 Webpack 入口。
- [x] 编写失败测试，断言源代码中没有 Pixabay、Google Webfonts、Open URL、Search Images 或模型端点。
- [x] 禁用相关配置和菜单入口，并改为本地系统字体列表。
- [x] 运行 `node --test test/no-remote-features.test.mjs` 与 `npm run build`。

### Task 2: 主页、文件交接和本地项目

**Files:**
- Create: `src/js/studio/project-store.js`、`src/js/studio/home.js`、`src/css/studio.css`、`editor/index.html`
- Modify: `index.html`、`src/js/main.js`
- Test: `test/project-store.test.mjs`

- [x] 编写失败测试，覆盖受支持图片类型、项目名称清理和项目排序。
- [x] 实现 IndexedDB 项目仓库：暂存打开文件、存储项目 JSON/缩略图、列出与删除最近项目。
- [x] 实现主页的新建、打开、拖放、最近项目及 `/editor/` 交接；编辑器自动打开暂存文件或项目。
- [x] 运行 `node --test test/project-store.test.mjs`。

### Task 3: 编辑器壳层与手动 Cutout

**Files:**
- Create: `src/js/studio/editor-shell.js`
- Modify: `editor/index.html`、`src/js/config.js`、`src/js/main.js`
- Test: `test/editor-policy.test.mjs`

- [x] 编写失败测试，断言工具策略保留 selection/magic_erase/erase，且不存在 AI/Element 工具标记。
- [x] 添加顶栏返回主页、保存本地项目、导出按钮和稳定测试标识。
- [x] 暴露手动 Cutout 组合：选区、魔棒/魔术橡皮、羽化、反选和蒙版相关操作；不新增远程请求。
- [x] 运行策略测试和构建。

### Task 4: 质量门与交付

**Files:**
- Create: `.github/workflows/ci.yml`、`.github/workflows/pages.yml`、`playwright.config.mjs`、`test/e2e/smoke.spec.mjs`、`scripts/rpa/smoke.py`、`docs/feature-matrix.md`
- Modify: `package.json`、`README.md`
- Test: `test/e2e/smoke.spec.mjs`

- [x] 编写功能矩阵，固定保留/排除边界和预期测试类型。
- [x] 添加 Node 单元测试、Chromium 5 条 Playwright 冒烟流程及无 LLM 的本地 harness RPA 脚本。
- [x] 添加 GitHub Actions PR 质量门、main 分支 Pages 部署和失败 artifact。
- [x] 执行 `npm test`、`npm run build`、`npm run test:e2e`；本地有 Chrome 时执行 `npm run test:rpa`。
