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
