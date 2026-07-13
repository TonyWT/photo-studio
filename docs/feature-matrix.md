# 非 AI 功能矩阵（v1 冻结）

本矩阵是首版的验收边界，而不是对 Pixlr 品牌、素材、文案或 AI 能力的复制。测试样图统一使用透明背景、小尺寸 PNG 与人工照片；JPEG 导出只校验可解码和尺寸，PNG/WebP 可在后续增加像素基准图。

| 功能簇 | 操作路径 | 状态/复用 | 输入与预期输出 | 测试等级 |
| --- | --- | --- | --- | --- |
| 主页与新建 | `/` → 新建画布 | 保留；自研 | 空白画布 → `/editor/` | Playwright、RPA |
| 本地打开/拖放 | `/` → 打开图片或拖入 | 保留；自研交接 + miniPaint | PNG/JPG/WebP/GIF/BMP/TIFF → 活动图层 | Playwright、RPA |
| 最近项目 | `/` → 最近项目 | 保留；IndexedDB | 项目 JSON/缩略图 → 恢复图层 | Node 项目仓库测试、RPA |
| 图层与 Arrange | 编辑器 → Layer/右侧图层 | 保留；miniPaint | 双图层 → 新建、排序、显隐、合并、撤销/重做 | miniPaint 内核 + Chromium 冒烟 |
| Crop 与尺寸 | 左侧 Crop；Image 菜单 | 保留；miniPaint | 固定 PNG → 新边界/尺寸，撤销恢复 | 工具可用性单测、人工像素验收 |
| Adjust | Image → Color Corrections | 保留；miniPaint | 固定照片 → 色彩校正后的活动图层 | 工具可用性单测、人工像素验收 |
| Effect / Filter | Effects 菜单 | 保留；miniPaint | 固定照片 → 可撤销效果层/像素变化 | 工具可用性单测、人工像素验收 |
| Liquify | 左侧 Bulge/Pinch | 保留；miniPaint | 栅格图层 → WebGL2 变形；提交后可撤销 | WebGL2 策略单测、Chromium 人工验收 |
| Retouch / Drawing | 左侧 Brush、Eraser、Clone、Blur 等 | 保留；miniPaint | 栅格图层 → 本地笔刷修改，可撤销 | 工具可用性单测、人工像素验收 |
| Text | 左侧 Text | 保留；miniPaint | 文本输入 → 可编辑文字图层；仅系统字体 | 工具可用性单测、Chromium 冒烟 |
| 手动 Cutout | Selection + Magic Eraser + Eraser | 保留；miniPaint | 选区/擦除 → 透明像素或选区；可反选、羽化、撤销 | 策略单测、Playwright、RPA |
| 导出与原生项目 | File → Export/Save As；顶栏保存 | 保留；miniPaint + IndexedDB | 画布 → PNG/JPEG/WebP；项目 → 本地 JSON/最近项目 | Chromium 冒烟、RPA |
| AI Tools / Element / 在线素材 | 任意入口 | **移除** | 不出现入口；不请求模型、素材或在线字体 API | 源码策略单测 |

## 本地与安全边界

- 图片只存在浏览器内存、IndexedDB 和用户主动下载目录；应用没有账号、后端或模型端点。
- URL 参数远程打开、素材搜索、在线字体 API 已禁用；不是“隐藏入口”。
- Liquify 无 WebGL2 时明确提示不可用；不退化为远程服务或 AI。
- 所有第三方编辑内核代码保留 miniPaint 的 MIT 许可；不使用 Pixlr 品牌资产或素材。
