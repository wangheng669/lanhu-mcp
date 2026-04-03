# lanhu-viewer

`lanhu-viewer` 已并入 `lanhu-mcp` 仓库，作为一个可选的 Web 子应用存在于当前目录。

## 为什么这样合并

- 保留 `lanhu-mcp` 根目录的 `.git` 和 `origin`，不改上游仓库身份。
- 不把原 `lanhu-viewer` 的 `.git` 元数据带进来，避免出现嵌套仓库或 remote 混乱。
- 尽量不改 `lanhu-mcp` 现有 Python MCP 启动路径，降低后续 `git pull` 与上游冲突的概率。

这意味着：

- 在 `/Users/wangheng/Desktop/feature/lanhu-mcp` 下执行 `git pull`，仍然是拉取原 `lanhu-mcp` 上游。
- `lanhu-viewer` 现在只是仓库内的源码目录，不再是独立 git 仓库。

## 运行方式

```bash
cd /Users/wangheng/Desktop/feature/lanhu-mcp/apps/lanhu-viewer
npm install
npm start
```

默认访问地址：

```text
http://localhost:3000
```

## 目录说明

- `server.js`: Express 服务入口
- `services/lanhu.js`: 蓝湖登录、设计图、切图、图层接口封装
- `public/`: 前端页面和静态资源
- `scripts/macos/`: macOS 自启动脚本

## Git 约束

- 不要把 `apps/lanhu-viewer/.git` 单独初始化回来，否则会重新变成嵌套仓库。
- 如果未来还要从外部 `lanhu-viewer` 项目同步代码，优先用目录级复制或 `rsync`，不要改 `lanhu-mcp` 的 `origin`。
- 仍然不能绝对保证未来任何一次 `git pull` 都零冲突，但当前结构已经把冲突面压到最小，只新增了独立子目录和少量忽略配置。
