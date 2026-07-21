# 线上数据访问说明

生产 PostgreSQL 和 Redis 不对公网开放，只绑定服务器本机 `127.0.0.1`。本地需要排查线上数据时，通过 SSH tunnel 转发。

## 1. 打开 SSH tunnel

在本地项目目录运行：

```bash
npm run prod:tunnel
```

默认转发：

```text
localhost:15432 -> 120.53.234.90:127.0.0.1:5432
localhost:16379 -> 120.53.234.90:127.0.0.1:6379
```

保持这个终端不要关闭。

## 2. 本地连接线上 PostgreSQL / Redis

另开一个终端，把本地环境变量切到 tunnel 端口：

```env
DATABASE_URL="postgresql://postgres:<production-postgres-password>@localhost:15432/xuanji_ai?schema=public"
REDIS_URL="redis://localhost:16379/0"
```

生产数据库密码在服务器 `/opt/apps/ai-fortune/.env.production.local` 的 `POSTGRES_PASSWORD` 或 `DATABASE_URL` 里。不要提交到 Git。

## 3. 常用检查

```bash
DATABASE_URL="postgresql://postgres:<production-postgres-password>@localhost:15432/xuanji_ai?schema=public" npm run prisma:migrate:deploy
DATABASE_URL="postgresql://postgres:<production-postgres-password>@localhost:15432/xuanji_ai?schema=public" npm run db:seed
```

日常开发仍然使用本地 Docker 数据库。只有线上问题排查、数据核对或紧急维护时才连接线上数据。
