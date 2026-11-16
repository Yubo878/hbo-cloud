# HBO CLOUD

一个轻量级、单服务的 Railway 私人云面板。包含网站导航、私人笔记、短链接和面板自身健康状态。

## 部署前提醒

- 该项目不会更改或接管你现有的 VPN。
- 面板使用 HTTP Basic Auth 保护；请务必设置强密码，并通过 Railway 提供的 HTTPS 域名访问。
- 短链接是公开跳转地址：任何拿到短链接的人都能访问目标网址。
- 私人笔记不适合保存密码、银行卡、VPN 私钥等敏感信息。
- Railway Hobby 的 $5 是每月资源额度，不是额外赠送的余额。现有 VPN 和新面板共享额度；请在 Railway Usage 中监控实际消耗。
- 为持久化数据，需要给这个服务挂载一个 Railway Volume，挂载路径填写 `/data`。本项目建议先使用 1GB。Volume 会按实际存储用量计费。
- 此项目为单实例 JSON 文件存储，不要开启多个 replicas。

## Railway 环境变量

在新服务的 Variables 中添加：

- `ADMIN_USER`：例如 `owner`
- `ADMIN_PASSWORD`：至少 16 位随机密码，建议 24 位以上
- `DATA_DIR`：`/data`（若已挂载 Volume）

Railway 会自动提供 `PORT`。

## 部署方式

1. 在 GitHub 创建一个新仓库，例如 `hbo-cloud`。
2. 将本项目全部文件上传到仓库，保留 `public` 文件夹结构。
3. 在 Railway 现有 Project 中点击 New → GitHub Repo，选择 `hbo-cloud`。
4. 在新服务 Settings → Networking 中生成一个 Railway 域名。
5. 在 Variables 添加上述环境变量。
6. 在 Volumes 新建 1GB Volume，Mount Path 填 `/data`。
7. 确认 Start Command 为 `npm start`（通常会自动识别）。
8. 部署成功后访问 Railway 域名，浏览器会弹出登录框。输入 `ADMIN_USER` 和 `ADMIN_PASSWORD`。

## 更新

修改 GitHub 仓库中的文件并提交，Railway 会自动重新部署。

## 数据位置

数据保存在 `/data/store.json`。删除 Volume 会删除保存的笔记、导航和短链接。建议定期备份。


## 本次升级功能
- 总览页显示本 Node.js 进程的内存、CPU 采样、运行时间和数据文件大小。
- 服务状态页增加手动检查按钮；默认只检查 HBO CLOUD 自身。
- 可选配置 `VPN_HEALTH_URL` 为你自己的 VPN 服务只读 HTTP/HTTPS 健康检查地址。不要填写私钥、密码或管理令牌。未配置时会明确显示“未配置”，不会假装检测 VPN 隧道。
- 不使用后台高频轮询，也不会刻意制造资源消耗。

升级部署：把本压缩包中的 `server.js`、`public/` 和 `README.md` 覆盖上传到 GitHub 仓库根目录，保留现有 Railway Variables 和 Volume 设置，然后重新部署。原有数据保存在 Volume 的 `/data/store.json`，不要删除 Volume。

## HBO CLOUD 2.0 新界面（`/hbo2/`）

`public/hbo2/` 是 Phase 1 设计稿的落地版本，挂在同一个服务的 `/hbo2/` 路径下，和根路径的经典面板共用同一份 `store.json`：

- `/` 仍是原来的经典面板，数据入口不变。
- `/hbo2/` 是新首页（导航、笔记、任务、短链接、实时云状态）。
- 两边的增删改立即互相同步，不存在两套数据。

新界面用到的接口（都需要登录）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/workspace` | 一次取回 profile / tasks / links / notes / shortlinks |
| GET | `/api/cloud` | 容器内存、CPU 采样、运行时间、数据文件大小、数据条数与 VPN 探测结果 |
| POST/PATCH/DELETE | `/api/tasks`、`/api/tasks/:id` | 任务 |
| POST/DELETE | `/api/notes`、`/api/notes/:id` | 笔记 |
| PUT | `/api/profile` | 显示名称与简介 |

### VPN / Xray 状态检测

在 Variables 里给 `VPN_HEALTH_URL` 填节点地址即可，多个节点用英文逗号分隔：

- `https://你的面板地址` —— 返回 2xx 显示 ONLINE 和延迟；非 2xx 显示 CHECK。
- `tcp://节点IP:端口` —— 直接探测 Xray / V2Ray 监听端口是否可连（5 秒超时），适合没有 HTTP 面板的节点。
- 想给节点起名字就写成 `香港|tcp://1.2.3.4:443`。

未配置时 `/hbo2/` 的 VPN 卡片会明确显示 “NO VPN NODE CONFIGURED”，不会假装在线。

