# 编辑器视觉对照 QA（进行中）

- source visual truth path: `/tmp/pixlr-express-editor.png`
- implementation screenshot path: `/tmp/photo-studio-editor-shell.png`
- combined comparison path: `/tmp/photo-studio-editor-qa-compare.png`
- viewport: `1920 × 878`
- state: 参考为已打开的 3840×2880 栅格照片（26%）；实现为新建 1280×720 空画布（100%）。两者不是同一文档状态，不能对画布内容、缩放值和图层缩略图做像素级判定。

## Findings

- [P1] 视觉对照尚未使用相同的已加载图片状态。
  - Location: 中心画布、右侧图层轨、底部文档尺寸/缩放。
  - Evidence: 左侧参考显示照片、图层缩略图和 26% 缩放；右侧实现显示空白画布和棋盘缩略图。
  - Impact: 无法确认图片适配、缩略图渲染与状态栏信息是否与目标交互一致。
  - Fix: 增加固定本地样图的上传夹具；在同一图片、同一缩放状态下重新截图与对照。

- [P1] 图层轨缺少实际图层缩略图与锁定状态。
  - Location: `#layers_base` / `src/js/core/gui/gui-layers.js`。
  - Evidence: 当前实现提供添加、选择、显隐、删除的内核 UI，但没有将活动图像图层渲染成窄缩略图，也没有锁定入口。
  - Impact: 右侧区域的核心识别和图层操作路径未达到参考层级。
  - Fix: 为图像层绘制缩略图，加入锁定操作和对应撤销/状态测试。

- [P2] 底部操作区的信息密度和图标细节仍与参考有差距。
  - Location: `.studio-editor-statusbar`。
  - Evidence: 布局已经是“缩放—历史—关闭—保存/导出”结构，但参考中的图标、按钮数量和按钮文案更紧凑。
  - Impact: 不阻塞主要编辑流程，但会降低相似状态下的视觉贴合度。
  - Fix: 在固定样图状态下调整间距和按钮文案；保留应用自己的名称与文案，不复制 Pixlr 品牌内容。

## Open Questions

- 需要先完成固定样图上传和图层缩略图，才能判断工作台是否达到视觉验收。
- Adjust、Effect、Filter、Liquify、Retouch、Drawing、Text 的完整面板仍在功能矩阵中标为部分可用或缺失，不能以当前空壳作为完成验收。

## Implementation Checklist

- [ ] 固定样图进入编辑器后重跑组合视觉对照。
- [ ] 完成图层缩略图与锁定。
- [ ] 为工作台工具逐项补真实操作、撤销/重做和导出基准。
- [ ] 更新截图基准，并再次做相同 viewport/state 的组合比较。

## Comparison History

1. 2026-07-13：首次并排比较发现文档状态不一致、图层轨不完整、底栏细节不一致；尚未修复，保留阻断状态。

final result: blocked
