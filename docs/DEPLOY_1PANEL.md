# 1Panel 部署说明

这个项目推荐在 1Panel 里使用容器编排部署，再用 1Panel 网站反向代理到容器端口。

## 1. 准备代码

在服务器上放置项目，例如：

```bash
mkdir -p /opt/apps
cd /opt/apps
git clone <your-repository-url> ai-fortune
cd ai-fortune
```

## 2. 准备生产环境变量

复制生产变量模板，填写真实值：

```bash
cp .env.production.example .env.production.local
```

至少需要填写：

```env
APP_URL="https://<your-domain>"
DATABASE_URL="postgresql://<user>:<password>@<postgres-host>:5432/<database>?schema=public"
AUTH_SESSION_SECRET="<strong-random-secret>"
ADMIN_ACCESS_TOKEN="<strong-random-admin-token>"
OPENAI_API_KEY="<openai-api-key>"
QINIU_ACCESS_KEY="<qiniu-access-key>"
QINIU_SECRET_KEY="<qiniu-secret-key>"
QINIU_BUCKET="<qiniu-bucket>"
QINIU_PUBLIC_DOMAIN="https://<qiniu-public-domain>"
```

可以在本机或服务器运行下面的命令生成强密钥：

```bash
npm run launch:secrets
```

## 3. 在 1Panel 创建编排

进入 1Panel：

```text
容器 -> 编排 -> 创建编排
```

编排文件选择项目里的 `docker-compose.prod.yml`。如果 1Panel 需要手动填写内容，直接复制该文件内容即可。

启动后，应用容器会监听服务器 `3000` 端口。腾讯云安全组不需要对公网开放 `3000`，只开放 `80`、`443` 和 1Panel 管理端口。

## 4. 初始化数据库

首次部署或 schema 变更后，在服务器项目目录运行：

```bash
docker compose -f docker-compose.prod.yml --profile tools run --rm ai-fortune-tools npm run prisma:push
docker compose -f docker-compose.prod.yml --profile tools run --rm ai-fortune-tools npm run launch:db-check
```

正式上线后建议逐步切换到 Prisma migration 流程，避免数据库结构变更缺少可审计记录。

## 5. 配置 1Panel 网站反向代理

进入：

```text
网站 -> 创建网站 -> 反向代理
```

填写：

```text
主域名: <your-domain>
代理地址: http://<server-internal-ip>:3000
```

如果 OpenResty 与应用容器在同一个 Docker 网络，也可以代理到：

```text
http://ai-fortune:3000
```

然后在 1Panel 网站设置里申请 SSL 证书，开启 HTTPS。

## 6. 上线检查

容器启动并绑定 HTTPS 域名后运行：

```bash
docker compose -f docker-compose.prod.yml --profile tools run --rm ai-fortune-tools npm run launch:url-check
docker compose -f docker-compose.prod.yml --profile tools run --rm ai-fortune-tools npm run launch:preflight
docker compose -f docker-compose.prod.yml --profile tools run --rm ai-fortune-tools npm run launch:production-gate
```

`launch:production-gate` 没有 blocking 后，再进入真实支付灰度和正式放量。
