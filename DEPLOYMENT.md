# GitHub Pages 部署

这个项目是纯静态站点，可以直接部署到 GitHub Pages。

## 推荐方式

1. 把整个项目推送到 GitHub 仓库。
2. 确保仓库根目录保留 `index.html`。
3. 在 GitHub 仓库的 `Settings` 里打开 `Pages`。
4. 在 `Build and deployment` 里选择 `Deploy from a branch`。
5. 分支选 `main`，目录选 `/root`。
6. 保存后等待几分钟，GitHub 会生成访问地址。

## 这个项目的注意点

- 资源引用已经使用相对路径，适合 GitHub Pages。
- 已添加 `.nojekyll`，避免 Pages 走 Jekyll 处理。
- `manifest.webmanifest`、`sw.js`、`api-modal.html` 都是同目录相对引用。

## 如果页面打不开

- 先确认仓库根目录存在 `index.html`。
- 如果你把项目放在仓库子目录里，页面路径要对应调整。
- 如果有样式或脚本没加载，优先检查是否写成了以 `/` 开头的绝对路径。
