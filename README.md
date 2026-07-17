# 玄机 AI / Xuanji AI

看得见推演过程的 AI 命理顾问。

玄机 AI 融合 AI 聊天、塔罗占卜、八字五行、八卦问事、手相上传、深度报告和会员档案。第一版以中文 Web 响应式上线，英文结构预留。

## Docs

- [项目目标规划](docs/PROJECT_PLAN.md)
- [PRD](docs/PRD.md)
- [设计规范](docs/DESIGN.md)
- [技术架构](docs/TECH_ARCHITECTURE.md)
- [MVP 任务清单](docs/MVP_TASKS.md)
- [后续执行路线](docs/EXECUTION_ROADMAP.md)
- [Sprint 01 开工计划](docs/SPRINT_01.md)

## Getting Started

```bash
npm run infra:up
npm run prisma:generate
npm run prisma:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

The local app runs on the host while PostgreSQL and Redis run in Docker. Copy
`.env.example` to `.env` before the first start if `.env` does not exist. Data is
kept in the named Docker volumes `ai-fortune_postgres_data` and
`ai-fortune_redis_data`.

To inspect or stop the local infrastructure:

```bash
npm run infra:status
npm run infra:logs
npm run infra:down
```

Redis is provisioned for local cache/queue work through `REDIS_URL`, but the
current deep-report job runner still uses the Node.js process-local job set.

## Useful Commands

```bash
npm run lint
npm run typecheck
npm run build
npm run infra:up
npm run infra:down
npm run infra:status
npm run infra:logs
npm run db:up
npm run db:down
npm run db:status
npm run db:logs
npm run redis:up
npm run redis:down
npm run redis:status
npm run redis:logs
npm run launch:secrets
npm run launch:db-check
npm run launch:url-check
npm run launch:ai-storage-check
npm run launch:payment-check
npm run launch:qualification-check
npm run launch:compliance-check
npm run launch:production-gate
npm run launch:core-gate
npm run launch:production-gate:example
npm run launch:production-gate-check
npm run launch:goal-followup-check
npm run launch:offline-action-check
npm run launch:evidence-check
npm run launch:goal-plan-check
npm run launch:weekly-focus-check
npm run launch:daily-brief-check
npm run launch:handoff-check
npm run launch:preflight
npm run launch:preflight:example
npm run prisma:generate
npm run prisma:push
```

## Environment

Copy `.env.example` to `.env` for local development and fill secrets as needed.

For production, copy `.env.production.example` to `.env.production.local` or fill the same keys in the deployment platform. Before switching on real traffic, run:

```bash
npm run launch:secrets
npm run launch:url-check
npm run launch:compliance-check
npm run launch:qualification-check
npm run launch:offline-action-check
npm run launch:evidence-check
npm run launch:goal-plan-check
npm run launch:weekly-focus-check
npm run launch:daily-brief-check
npm run launch:handoff-check
npm run launch:goal-followup-check
npm run launch:preflight
npm run launch:production-gate
```

`launch:secrets` prints strong values for `AUTH_SESSION_SECRET` and `ADMIN_ACCESS_TOKEN` without writing them to disk. The preflight script checks production domain, session/admin secrets, PostgreSQL, login, OpenAI, Qiniu, payment mode, real payment channels and compliance fields. It exits with a non-zero code while blocking items remain.

`launch:production-gate` is the final paid-launch gate. It aggregates `launch:preflight`, `launch:db-check -- --schema`, `launch:url-check`, `launch:ai-storage-check`, `launch:compliance-check` and `launch:payment-check`, then prints one Go / No-Go style summary. Blocking items fail the command; warning items must be explained or resolved before wider release. Use `npm run launch:production-gate:example` to preview the gate against `.env.production.example` without calling network checks.

`launch:core-gate` runs the same gate with `--defer-live-payment --defer-qiniu`. Use it when真实支付渠道和七牛云暂缓，但生产域名、数据库、认证、后台保护、OpenAI、合规主体/ICP 和核心功能仍必须达到上线标准. It prints `coreReady=yes` only when those non-deferred checks have no blocking items. For local runtime verification, run `npm run launch:core-gate -- --env .env --allow-local`; local URL and local database checks become warnings, not production approval. It is not a paid-launch replacement; remove the defer flags and run `launch:production-gate` before收费放量或启用七牛图片链路.

Run `npm run launch:production-gate-check` to verify the CLI gate, server-side gate aggregation, launch evidence archive snapshot, `/api/admin/launch/production-gate`, the `production_gate` blocker-dashboard workstream, the final launch decision gate and `/admin/health` production gate panels stay wired together. With a running app, add `-- --base-url=http://localhost:3000` to verify the rendered admin page, production-gate JSON API, launch-decision JSON API, blocker-dashboard JSON API and a production-gate evidence archive write.

After `DATABASE_URL` is available, run `npm run launch:db-check` to verify the connection without printing the password. After `npm run prisma:push`, run `npm run launch:db-check -- --schema` to verify core Prisma tables. With a running app, add `-- --base-url=http://localhost:3000` to verify `/api/admin/launch/database-plan` returns the production database rollout steps and command groups.

After `APP_URL` is bound to the production domain, run `npm run launch:url-check` to verify public pages, legal links, member redirect protection and payment/Qiniu callback reachability. With a running app, add `-- --base-url=http://localhost:3000` to verify `/api/admin/launch/deployment-plan` returns the domain/deployment rollout steps and command groups.

After OpenAI and Qiniu variables are available, run `npm run launch:ai-storage-check` to verify model access, Qiniu upload token generation, upload host reachability and public image domain reachability without printing secrets. With a running app, add `-- --base-url=http://localhost:3000` to verify `/api/admin/launch/ai-storage-plan` returns the OpenAI/Qiniu rollout steps and command groups. OpenAI chat, palm vision and deep reports write estimated `costCents` to `UsageLog`; set `OPENAI_DEFAULT_INPUT_CENTS_PER_1M_TOKENS` and `OPENAI_DEFAULT_OUTPUT_CENTS_PER_1M_TOKENS` from the current billing rate before paid gray release.

After Alipay or WeChat Pay merchant variables are available, run `npm run launch:payment-check` to verify callback URLs, required fields, key parsing, local signing ability, WeChat Pay API v3 resource decryptability and callback business guards for provider, app/merchant id and amount matching. With a running app, add `-- --base-url=http://localhost:3000` to verify `/api/admin/launch/payment-plan` returns the callback guard step for every payment channel. It does not create live orders or charge money.

Run `npm run launch:qualification-check` for the ICP/支付资质接入前置验收: it verifies external readiness tracking, `/api/admin/launch/external-readiness`, `/api/admin/launch/application-pack`, `/api/admin/launch/compliance-plan`, `/api/admin/launch/payment-plan`, the final decision payment gate and 真实支付入口保护. With a running app, add `-- --base-url=http://localhost:3000 --timeout-ms=120000` to verify the APIs and `/admin/health` qualification sections. This check proves the system can receive ICP, Alipay and WeChat Pay evidence; it does not replace the real platform approvals.

Before real paid launch, run `npm run launch:compliance-check` to verify the legal document set, agreement keywords, `COMPANY_NAME`, `ICP_RECORD_NO`, compliance API wiring and the compliance rollout plan. With a running app, add `-- --base-url=http://localhost:3000` to verify the four legal pages plus `/api/admin/launch/compliance` and `/api/admin/launch/compliance-plan`.

Run `npm run launch:offline-action-check` to verify the offline action pack for founder tasks: entity path, domain, ICP, PostgreSQL, OpenAI, Qiniu, WeChat, Alipay, legal review, target dates and evidence fields. With a running app, add `-- --base-url=http://localhost:3000 --timeout-ms=120000` to verify `/api/admin/launch/offline-action-pack`, `/api/admin/launch/founder-dossier`, `/api/admin/launch/external-readiness` and the `/admin/health` offline-action section.

Run `npm run launch:evidence-check` to verify the launch evidence chain: evidence action center, evidence gap, evidence archive metadata, API auth/no-store wiring, the archive button and docs. With a running app, add `-- --base-url=http://localhost:3000 --timeout-ms=120000` to verify `/api/admin/launch/evidence-action-center`, `/api/admin/launch/evidence-gap`, `/api/admin/launch/evidence`, archive POST behavior and the `/admin/health` evidence sections.

Run `npm run launch:goal-plan-check` to verify the 30/60/90 goal plan: four milestone windows, current milestone, transition gate, goal progress persistence, the PATCH API and docs. With a running app, add `-- --base-url=http://localhost:3000 --timeout-ms=120000` to verify `/api/admin/launch/goal-plan`, PATCH progress writeback and the `/admin/health` goal plan section.

Run `npm run launch:weekly-focus-check` to verify the weekly focus board: workplan aggregation, commitment coverage, owner grouping, commitment persistence, the PATCH API and docs. With a running app, add `-- --base-url=http://localhost:3000 --timeout-ms=120000` to verify `/api/admin/launch/weekly-focus`, PATCH commitment writeback and the `/admin/health` weekly focus section.

Run `npm run launch:daily-brief-check` to verify the daily startup brief: production gate summary, offline action, stage transition gate, today action queue, action progress persistence, the PATCH API and docs. With a running app, add `-- --base-url=http://localhost:3000 --timeout-ms=120000` to verify `/api/admin/launch/daily-brief`, PATCH progress writeback and the `/admin/health` daily brief section.

Run `npm run launch:handoff-check` for the 上线交接与执行计划验收: it verifies the handoff summary, six-lane workplan, `/api/admin/launch/handoff`, `/api/admin/launch/workplan`, production-gate handoff, offline-action handoff, goal-followup handoff and 可复制交接口径. With a running app, add `-- --base-url=http://localhost:3000 --timeout-ms=120000` to verify both APIs and the `/admin/health` handoff/workplan sections.

Run `npm run launch:goal-followup-check` to verify the goal follow-up loop: structured fill-in entries, request body templates, executable curl commands, UsageLog persistence evidence mapping, the `transitionGate.canAdvance` stage gate, final-decision stage-gate snapshot, launch-evidence stage-gate archive metadata, offline-action daily brief, goal-followup fill-in, evidence-action-center fill-in, handoff snapshot and archive metadata, weekly stage-gate display, daily-brief `goal_transition` actions, admin anchors, handoff copy with the stage gate and docs. With a running app, use `npm run launch:goal-followup-check -- --base-url=http://localhost:3000` to also check the API responses and `/admin/health` HTML.

Development payment mode should stay on mock until merchant credentials are ready.

```text
PAYMENT_PROVIDER=mock
ALIPAY_ENABLED=false
WECHAT_PAY_ENABLED=false
```

Runtime data is database-first: orders, wallet transactions, memberships and reports use Prisma/PostgreSQL when `DATABASE_URL` is available. Local development falls back to in-memory storage if the database is not reachable.

Alipay and WeChat Pay routes are scaffolded but stay disabled until merchant credentials and signing keys are configured.

## Product Direction

Core MVP:

- AI 命理聊天
- OpenAI Responses API 编排
- 塔罗三牌阵
- 八字五行简析
- 八卦问事
- 手相上传
- 七牛上传凭证与图片 metadata
- 深度报告
- 会员与星力值
- mock payment
- 轻后台
- 合规页面
- 上线自检
