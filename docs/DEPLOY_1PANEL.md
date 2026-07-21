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
ICP_RECORD_NO="京ICP备2026044070号"
DATABASE_URL="postgresql://<user>:<password>@<postgres-host>:5432/<database>?schema=public"
AUTH_SESSION_SECRET="<strong-random-secret>"
ADMIN_ACCESS_TOKEN="<strong-random-admin-token>"
ADMIN_EMAIL="a1781194749@gmail.com"
OPENAI_API_KEY="<openai-api-key>"
QINIU_ACCESS_KEY="<qiniu-access-key>"
QINIU_SECRET_KEY="<qiniu-secret-key>"
QINIU_BUCKET="<qiniu-bucket>"
QINIU_PUBLIC_DOMAIN="https://<qiniu-public-domain>"
```

Google 邮箱登录上线时，还需要在 Google Cloud Console 的 Web OAuth Client 里添加线上配置：

```text
Authorized JavaScript origin: https://<your-domain>
Authorized redirect URI: https://<your-domain>/api/auth/google/callback
```

当前线上域名分工：

```text
xuanji.click -> 120.53.234.90
www.xuanji.click -> www-xuanji-click-idvrsqm.qiniudns.com
```

因此应用站点使用 `APP_URL="https://xuanji.click"`，七牛公开域名使用 `QINIU_PUBLIC_DOMAIN="https://www.xuanji.click"`。七牛侧还需要先给 `www.xuanji.click` 绑定 SSL 证书；证书完成前不要在 HTTPS 生产页面启用七牛图片链路。

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

启动后，应用容器会监听服务器 `3000` 端口，并在同一编排里运行 PostgreSQL 与 Redis。腾讯云安全组不需要对公网开放 `3000`、`5432` 或 `6379`，只开放 `80`、`443` 和 1Panel 管理端口。

如果想在生产环境变量里覆盖端口（例如 `AI_FORTUNE_PORT=3001`），启动命令需要带上 `--env-file .env.production.local`，否则 Docker Compose 只会用默认的 `3000`：

```bash
docker compose --env-file .env.production.local -f docker-compose.prod.yml up -d --build --remove-orphans
```

如果使用编排自带 PostgreSQL，环境变量示例：

```env
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="<strong-postgres-password>"
POSTGRES_DB="xuanji_ai"
DATABASE_URL="postgresql://postgres:<strong-postgres-password>@postgres:5432/xuanji_ai?schema=public"
```

## 4. 初始化数据库

生产环境使用 Prisma migration 管理表结构。首次部署或 schema 变更后，在服务器项目目录运行：

```bash
docker compose --env-file .env.production.local -f docker-compose.prod.yml --profile tools run -T --interactive=false --rm ai-fortune-tools npm run prisma:migrate:deploy
docker compose --env-file .env.production.local -f docker-compose.prod.yml --profile tools run -T --interactive=false --rm ai-fortune-tools npm run db:seed
docker compose --env-file .env.production.local -f docker-compose.prod.yml --profile tools run -T --interactive=false --rm ai-fortune-tools npm run launch:db-check
```

本地新增字段时先修改 `prisma/schema.prisma`，然后执行：

```bash
npm run prisma:migrate -- --name <change-name>
```

提交 `prisma/schema.prisma` 和新生成的 `prisma/migrations/<timestamp>_<change-name>/migration.sql`。线上自动部署会先备份 PostgreSQL，再执行 `npm run prisma:migrate:deploy`。

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

本项目当前主域名填写：

```text
主域名: xuanji.click
代理地址: http://ai-fortune:3000
```

如果 OpenResty 与应用容器在同一个 Docker 网络，也可以代理到：

```text
http://ai-fortune:3000
```

然后在 1Panel 网站设置里申请 SSL 证书，开启 HTTPS。

## 6. 上线检查

容器启动并绑定 HTTPS 域名后运行：

```bash
docker compose --env-file .env.production.local -f docker-compose.prod.yml --profile tools run -T --interactive=false --rm ai-fortune-tools npm run launch:url-check
docker compose --env-file .env.production.local -f docker-compose.prod.yml --profile tools run -T --interactive=false --rm ai-fortune-tools npm run launch:preflight
docker compose --env-file .env.production.local -f docker-compose.prod.yml --profile tools run -T --interactive=false --rm ai-fortune-tools npm run launch:production-gate
```

`launch:production-gate` 没有 blocking 后，再进入真实支付灰度和正式放量。

## 7. GitHub Actions 自动部署

仓库已经包含 `.github/workflows/deploy.yml` 和 `scripts/deploy-1panel.sh`。配置完成后，每次推送 `main` 都会自动 SSH 到服务器，拉取最新代码并执行：

```bash
docker compose --env-file .env.production.local -f docker-compose.prod.yml --profile tools build ai-fortune ai-fortune-tools
docker compose --env-file .env.production.local -f docker-compose.prod.yml --profile tools run -T --interactive=false --rm ai-fortune-tools npm run prisma:migrate:deploy
docker compose --env-file .env.production.local -f docker-compose.prod.yml --profile tools run -T --interactive=false --rm ai-fortune-tools npm run db:seed
docker compose --env-file .env.production.local -f docker-compose.prod.yml up -d --remove-orphans
```

需要在 GitHub 仓库配置以下 Secrets：

```text
SERVER_HOST=120.53.234.90
SERVER_USER=<ssh-user>
SSH_PRIVATE_KEY=<private-key-with-access-to-server>
SERVER_PORT=22
```

可选配置 GitHub Variables：

```text
APP_DIR=/opt/apps/ai-fortune
HEALTHCHECK_URL=https://xuanji.click/
RUN_PRISMA_MIGRATE=true
RUN_DB_SEED=true
```

`RUN_PRISMA_MIGRATE` 默认为 `true`，部署时会在启动容器前执行 `npm run prisma:migrate:deploy`。`RUN_DB_SEED` 默认为 `true`，会用 `ADMIN_EMAIL`/`ADMIN_EMAILS` 幂等初始化管理员角色。迁移前会自动备份 PostgreSQL 到 `/opt/backups/ai-fortune/postgres`。

服务器上需要提前准备好 `${APP_DIR}/.env.production.local`。首次部署时，如果 `${APP_DIR}` 不存在，脚本会自动从 `https://github.com/1781194749/ai-fortune.git` 克隆 `main` 分支。
