# Photo Studio

本地优先、无 AI、无 Element 的桌面网页图片编辑器。编辑内核来自 [miniPaint](https://github.com/viliusle/miniPaint)，其 MIT 许可见 [MIT-LICENSE.txt](MIT-LICENSE.txt)。

## 能力边界

- 保留图层、裁剪、调整、特效、滤镜、Bulge/Pinch、修复、绘制、文字、手动 Cutout 和本地导出。
- 手动 Cutout 由选区、魔术橡皮和橡皮组成；不连接一键 AI 抠图。
- 已移除 AI Tools、Element、远程图片搜索、远程图片打开与网页字体服务。
- 项目仅写入此浏览器的 IndexedDB；不需要账号或后端。

## 本地运行

```bash
npm ci
npm run server -- --port 4173 --no-open
```

打开 `http://127.0.0.1:4173/`。编辑器位于 `/editor/`。

## 验证

```bash
npm test                 # 纯 Node 策略与项目仓库测试
npm run build            # 生产构建
npm run test:e2e         # 5 条 Chromium 冒烟路径
npm run test:rpa         # 已启动开发服务器和 Chrome 后的无 LLM 本地 RPA
```

CI 使用 GitHub Actions；`main` 分支通过测试与构建后自动部署 GitHub Pages。
