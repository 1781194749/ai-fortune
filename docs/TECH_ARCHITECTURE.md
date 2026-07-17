# 玄机 AI 技术架构

## 技术栈

```text
Next.js + TypeScript
Tailwind CSS
Framer Motion
lucide-react
PostgreSQL
Prisma
七牛云
OpenAI Responses API
支付宝 + 微信支付
```

## 架构

```text
用户浏览器
  ↓
Next.js App Router
  ↓
业务服务层
  ├─ Auth
  ├─ Membership
  ├─ Wallet
  ├─ AI Orchestrator
  ├─ Fortune Tools
  ├─ Report Builder
  ├─ Payment
  └─ Storage
  ↓
PostgreSQL + 七牛云 + OpenAI + 支付渠道
```

## 登录

第一版：

- 邮箱验证码登录

预留：

- 微信扫码登录
- Google 登录
- Apple 登录

数据模型使用 `AuthAccount` 统一管理多登录方式。

## 支付

第一版按真实订单系统设计：

- mock payment
- 支付宝
- 微信支付

开发期：

```text
PAYMENT_PROVIDER=mock
ALIPAY_ENABLED=false
WECHAT_PAY_ENABLED=false
```

正式上线：

```text
PAYMENT_PROVIDER=live
LIVE_PAYMENT_SMOKE_TEST_USER_IDS=内部测试账号 userId
ALIPAY_ENABLED=true
WECHAT_PAY_ENABLED=true
```

支付流程：

```text
创建订单
生成支付参数或二维码
用户支付
接收异步通知
校验签名
更新订单状态
发放会员或星力值
记录钱包流水
```

适配层：

- `/api/payments/live/orders` 统一创建支付宝或微信支付预下单，并先经过最终上线决策保护；`no_go` 或 `internal_gray` 时返回 `LIVE_PAYMENT_NOT_RELEASED`，`paid_smoke` 只允许 `LIVE_PAYMENT_SMOKE_TEST_USER_IDS` 或 `LIVE_PAYMENT_SMOKE_TEST_EMAILS` 中的内部账号创建小额真实订单，`release_ready` 才对所有登录用户开放真实支付。
- `/api/payments/alipay/notify` 接收支付宝异步通知，使用 RSA2 验签后校验本地订单渠道、`app_id` 和 `total_amount`，全部匹配才标记 PAID 并发放权益。
- `/api/payments/wechat/notify` 接收微信支付 API v3 通知，验签后使用 `WECHAT_PAY_API_V3_KEY` 解密 AES-256-GCM 资源，再校验本地订单渠道、`appid`、`mchid` 和 `amount.total`，全部匹配才标记 PAID 并发放权益；正式上线前仍需用平台真实通知留证。
- mock、支付宝、微信支付共用 `Order`、`WalletTransaction` 和会员发放逻辑。
- 真实支付参数未配置时，前端会明确提示未开启，不影响 mock payment 开发链路。
- `PAYMENT_CALLBACK_DEV_BYPASS=true` 仅允许本地联调模拟回调，生产环境不要开启。
- `/api/promotions/validate` 负责优惠码试算；`FIRST50` 面向首单，`XUANJI20` 为通用活动码，`SHARE15` 要求用户先从公开分享页回流。
- mock、支付宝、微信支付下单都会在服务端重新校验优惠码，并用折扣后的 `amountCents` 创建订单。
- 优惠码规则包含有效期、全局使用上限和单用户使用上限；服务端按 `promo_event` 中的唯一订单号计算占用次数，已支付订单永久计入，未支付订单只在创建后 30 分钟内占用额度。
- 优惠码使用写入 `UsageLog(feature=promo_event)`，metadata 保存优惠码、原价、优惠金额、实付金额、订单、商品和支付渠道。
- 后台优惠配置写入 `UsageLog(feature=promotion_config)`，以事件快照形式覆盖默认规则，可调整启用状态、有效期、总量上限和单用户限制；恢复默认会移除该码的运行时覆盖。
- 新用户首单实验使用 `new_user_first_offer_v1`，默认按 userId 稳定分流到 `FIRST50` 或 `XUANJI20`；后台可通过 `UsageLog(feature=experiment_config)` 固化胜出变体为默认新客券或恢复 A/B。会员购买页自动预填对应优惠码，并用 `UsageLog(feature=experiment_event)` 记录曝光、下单、支付和实收。

## AI 编排

核心原则：

```text
计算交给代码，表达交给 AI
```

工具：

- `intent_classifier`
- `birth_info_checker`
- `bazi_calculator`
- `wuxing_analyzer`
- `bagua_generator`
- `tarot_spread_generator`
- `palm_image_checker`
- `palm_reader`
- `report_builder`
- `usage_meter`

模型策略：

| 场景 | 模型 |
| --- | --- |
| 分类、标题、扣费、简单引导 | 低成本模型 |
| 日常聊天、塔罗、八卦、五行解释 | 中等模型 |
| 手相图片解读 | 支持视觉的中等模型 |
| 深度报告 | 高质量模型 |
| 八字、五行、起卦、抽牌 | 后端代码 |

运行策略：

- `/api/chat` 先做权益校验，再进入工具编排。
- `intent_classifier` 识别塔罗、八字、八卦、手相或通用问题。
- `profile_reader` 读取 `FortuneProfile`，把出生信息、长期关注和五行摘要带入对话。
- 后端先执行可确定工具，例如塔罗抽牌、八字五行排盘。
- 工具结果先归一为 `ReadingEvidencePackage`；模型只能引用其中的 evidenceId，用户可见原始事实由后端渲染。
- 配置 `OPENAI_API_KEY` 时调用 OpenAI Responses API 严格结构化输出；聊天使用 `FortuneAnswer`，付费报告使用独立 `DeepReportAnswer`。
- 输入先经过领域安全规则和可选 Moderation，输出再经过事实、安全、状态和服务档位校验；修复最多一次，仍失败进入确定性降级。
- Prompt Registry 实际选择稳定版或候选版，支持按 cohort 灰度和切回稳定版的真实回滚。
- `/api/fortune/palm` 会优先使用 `OPENAI_VISION_MODEL` 调用视觉模型分析手相图片。
- 未配置 OpenAI 或调用失败时使用本地降级回答，保证收费与演示链路不断。
- `chat:quality-check` 每次运行核心编排样本与 1000 条以上确定性回归；正式灰度必须额外通过 `chat:quality-gate` 的真实模型语义评分和人工复核。
- 每次调用写入 `UsageLog`，记录 provider、model、feature、tokens、估算 `costCents`、成本来源和工具元数据；生产可用 `OPENAI_DEFAULT_INPUT_CENTS_PER_1M_TOKENS` / `OPENAI_DEFAULT_OUTPUT_CENTS_PER_1M_TOKENS` 或模型级变量覆盖启动估算表。

## 图片存储

使用七牛云：

```text
后端生成上传凭证
前端直传七牛云
保存 qiniuKey、url、contentType、sizeBytes
AI 分析图片
生成报告
用户可删除图片
```

运行策略：

- `/api/storage/qiniu/upload-token` 生成浏览器直传 token。
- 已配置七牛 AK/SK、bucket 和 public domain 时，前端直接上传到七牛。
- 本地未配置七牛时返回 mock token，仍保存图片 metadata 并跑通手相报告链路。
- `ImageUpload` 保存 `qiniuKey`、URL、contentType、sizeBytes 和上传元信息。
- 删除图片先标记 `deletedAt`，真实对象删除可在七牛管理适配层中补齐。
- `/api/fortune/palm` 使用已保存图片生成手相视觉简析报告；无 OpenAI Key、mock URL 或模型调用失败时会本地降级，并扣除星力。

## 数据模型

核心表：

- `User`
- `AuthAccount`
- `FortuneProfile`
- `Membership`
- `WalletTransaction`
- `Order`
- `AiSession`
- `Message`
- `Report`
- `ImageUpload`
- `UsageLog`

运行策略：

- 订单、钱包、会员状态和报告通过 Prisma 适配层优先写入 PostgreSQL。
- 本地开发未启动数据库时自动回退到内存 store，保证 mock payment 和推演流程仍可演示。
- 正式环境必须配置 `DATABASE_URL` 并完成 Prisma 迁移，不能依赖内存回退。
- 邮箱登录会恢复数据库中的会员档位和星力余额，避免服务重启后丢失付费权益。
- `/api/admin/persistence/probe` 提供后台落库自检，GET 返回当前存储模式、上线关键事件持久化覆盖和最近探针，POST 写入并读回 `UsageLog(feature=persistence_probe)`，用于验收真实 PostgreSQL 持久化是否可用；覆盖清单跟踪 `integration_probe`、`launch_external_readiness`、`launch_weekly_commitments`、`launch_daily_action_progress`、`launch_goal_progress`、`launch_acceptance_evidence`、`launch_payment_acceptance_evidence`、`launch_unit_economics_cost_sample`、`launch_ai_storage_acceptance_evidence`、`launch_database_acceptance_evidence`、`launch_deployment_acceptance_evidence`、`launch_evidence` 和后台审计记录。
- `/api/admin/launch/database-plan` 聚合生产变量核对、外部 PostgreSQL 事项、落库探针和数据库验收证据，输出 PostgreSQL 实例创建、DATABASE_URL 配置、`launch:db-check` 连接检查、Prisma Schema 同步、后台探针、上线事件覆盖、备份回滚、命令顺序和证据清单；`launch:db-check -- --base-url=...` 会运行时确认该 API 返回完整数据库落地步骤和命令组；`POST` 可保存连接、迁移、探针、事件覆盖、备份策略和恢复演练证据到 `UsageLog(feature=launch_database_acceptance_evidence)` 并写入后台审计，用于把生产数据库阻断拆成可执行、可归档的上线步骤。
- `/api/admin/launch/readiness` 聚合生产清单、生产变量核对、外部事项、落库探针和第三方诊断，输出收费上线 Go / No-Go 状态；变量缺失、占位、本地地址或弱密钥会作为 `env:*` 阻断项进入总闸。
- `/api/admin/launch/runbook` 基于 Go / No-Go 结果生成只读上线执行清单，包含负责人、动作、验收证据和相关阻断项；生产变量阻断会关联到对应步骤。
- `/api/admin/launch/production-gate` 聚合生产变量预检、PostgreSQL/Prisma、正式域名与关键路由、OpenAI/七牛、合规与主体一致性和真实支付签名门禁，返回 `releaseReady`、六个门禁步骤、细分检查摘要、优先处理项和可复制总门禁口径；该接口只读并返回 `no-store`，用于上线脚本、监控或交接自动化直接读取生产总门禁。
- `/api/admin/launch/evidence` 可将当前上线状态归档到 `UsageLog(feature=launch_evidence)`，保存 Go/No-Go、Runbook、生产上线总门禁、生产变量核对、落库、数据库验收证据、部署验收证据、第三方诊断、AI/图片验收证据、端到端验收证据、真实支付小额验收、AI 成本样本、今日动作执行记录、线下办理当前动作、30/60/90 目标推进摘要和阶段推进门槛 `transitionGate.canAdvance`；密钥和连接串仍只保存脱敏状态，旧归档缺少阶段门槛或线下办理动作时会提示刷新上线证据。
- `/api/admin/launch/external-readiness` 跟踪主体、域名、ICP备案、生产数据库、OpenAI、七牛、微信开放平台、微信支付、支付宝和法务审查进度，`PATCH` 支持单条更新或 `items` 数组批量更新，保存状态、目标日期、提交回执、证据链接、证据备注和推进备注到 `UsageLog(feature=launch_external_readiness)`；除已完成外，未开始、处理中、已提交和卡住都会作为收费上线阻断项。
- `/api/admin/launch/package` 聚合 Go/No-Go、Runbook、外部事项、端到端验收证据、数据库验收证据、部署验收证据、AI/图片验收证据、真实支付验收、AI 成本样本、目标推进记录、今日动作执行记录、线下办理当前动作、生产上线总门禁和最新证据归档，输出收费上线包状态、上线前必补事项、证据缺口和下一步动作；最新归档会同时比对 Go/No-Go 摘要、端到端验收证据、数据库验收证据、部署验收证据、AI/图片验收证据、支付验收摘要、成本样本摘要、目标推进记录、今日动作执行记录、线下办理当前动作和生产上线总门禁，任一变化都会提示刷新。该接口只读，不改变任何检查结果。
- `/api/admin/launch/materials` 基于外部事项生成办理资料包，列出每项要准备的材料、办理步骤、产出凭证、提交回执、证据链接、生产环境变量和验收方式；该接口只读，用于主体、备案、云服务和支付申请跟进。
- `/api/admin/launch/founder-dossier` 基于办理资料包生成创始人上线办理包，包含个体工商户/有限公司/海外预留路径建议、主体路径决策助手、关键办理顺序、材料产物、解锁变量和官方入口；该接口只读，用于线下同步推进主体、备案、支付和云服务申请。
- `/api/admin/launch/offline-action-pack` 聚合办理资料包、创始人办理包、平台申请材料和生产变量批次，输出当前先办事项、阶段状态、材料、平台填表字段、变量、回执证据、官方入口和可复制一页纸；`launch:offline-action-check -- --base-url=...` 会运行时确认行动包、主体路径决策、外部事项和后台线下办理区块完整；该接口只读，用于把线下资质办理压缩成当天可执行动作。
- `/api/admin/launch/offline-action-pack` 会复用上线排期风险中的建议目标日，未排期事项在后台快填时会自动预填建议日期。
- `/admin/health` 的线下办理行动包顶部复用 `/api/admin/launch/external-readiness` 的 `PATCH` 保存当前事项或优先动作队列的状态、目标日期、回执、证据链接和备注；批量保存会先校验所有事项再写入一次快照，保存后同一份外部事项快照会同步影响 Go/No-Go、排期风险、本周推进和平台申请材料状态。
- `/api/admin/launch/env-checklist` 读取当前服务端环境变量，按缺失、占位、本地值、强度不足、开关不符和等待开关分类；密钥和连接串只返回脱敏状态，用于上线前生产配置核对。
- `/api/admin/launch/env-draft` 基于生产变量核对、办理资料包和第三方回调清单生成安全的 `.env.production` 草案、优先填写变量和平台来源提示；该接口只读，密钥与连接串只输出占位符，避免泄露真实生产值。
- `/api/admin/launch/env-batch-plan` 聚合生产变量核对、变量草案、办理资料包和回调配置，按基础安全、主体域名、生产数据库、OpenAI、七牛、真实支付和微信登录输出分批填写顺序、变量缺口、验证动作和证据口径；真实支付批次会提示内部小额订单白名单变量；该接口只读，用于部署平台逐批填变量和逐批验收。
- `/api/admin/launch/deployment-plan` 聚合生产变量核对、变量草案、第三方回调、外部域名事项、生产健康检查和部署验收证据，输出域名/DNS、HTTPS APP_URL、`launch:url-check` 公网页面与回调验收、部署平台变量、后台访问保护、会话密钥、公网回调、预检脚本、页面烟测、重启回滚、命令顺序和证据清单；`launch:url-check -- --base-url=...` 会运行时确认该 API 返回完整域名/部署步骤和命令组；`POST` 可保存正式域名、生产变量、后台保护、公网回调、预检输出、页面烟测和回滚记录到 `UsageLog(feature=launch_deployment_acceptance_evidence)` 并写入后台审计，用于把正式站点部署从变量准备推进到可公网验收。
- `/api/admin/launch/handoff` 聚合收费上线包、生产上线总门禁、目标后续推进复盘、阶段推进门槛、`transitionGate.canAdvance`、线下办理当前动作、生产变量、外部办理资料和证据归档，生成可复制的上线交接摘要；该接口只读，用于把当前目标、生产总门禁结论、阶段放行判断、线下办理今日先办事项、目标推进缺口、目标补齐入口、阻断项和下一步动作交给执行人。
- `/api/admin/launch/decision` 聚合最终上线决策、生产总门禁和 30/60/90 目标规划阶段门槛，返回 `goalTransitionGate`、`goal_transition` gate、`transitionGate.canAdvance` 和可复制最终决策；阶段门槛未放行时会进入最终决策优先项，避免技术门禁通过但人工推进/证据备注未闭合时直接放量。
- `/api/admin/launch/workplan` 聚合外部办理、平台申请材料、生产变量、Runbook 验收、单位经济和证据归档，按工作线输出负责人、动作、依赖和验收证据；该接口只读，用于正式上线前分工推进。
- `/api/admin/launch/weekly-focus` 聚合执行工作计划、排期风险、创始人办理包、平台申请材料和灰度阶段，输出本周目标、负责人、截止日、建议承诺日、依赖、验收证据、承诺覆盖率、承诺状态、未承诺任务和可复制推进清单；后台本周推进区会同时展示 30/60/90 阶段推进门槛与 `transitionGate.canAdvance`，用于判断本周承诺是否足以推进下一阶段；`PATCH` 可保存任务目标日、负责人、证据备注和未开始/处理中/卡住/已完成状态并写入后台审计，后台表单支持批量保存当前显示任务，用于把 no_go 阻断拆成本周可分派任务。
- `/api/admin/launch/daily-brief` 聚合收费上线包、生产上线总门禁、上线阻断总控台、线下办理行动包、30/60/90 目标规划、本周推进看板和今日动作执行记录，`GET` 输出今日目标推进日报、生产门禁 `releaseReady`/阻断数字、线下办理当前动作、阶段推进门槛 `transitionGate.canAdvance`、当前先办动作、目标与证据快照、关键阻断数字、已保存执行状态和可复制日报文本；生产总门禁的阻断/警告项会以 `production_gate` 来源进入今日优先动作，线下办理当前事项会以 `offline_action` 来源进入今日优先动作，阶段推进门槛未放行时会以 `goal_transition` 来源进入今日优先动作，`PATCH` 可保存单个今日动作的处理状态、负责人、证据备注和推进备注到 `UsageLog(feature=launch_daily_action_progress)` 并写入后台审计。人工执行状态只作为每日推进留痕，不反向改变 Go/No-Go 闸门结果。
- `/api/admin/launch/goal-followup` 聚合 30/60/90 目标规划、今日目标推进日报、线下办理当前动作、今日动作执行记录、本周推进看板和证据行动中心，输出目标后续推进复盘、当前阶段、今日动作留痕、线下办理执行留痕、本周承诺分布、补证覆盖率、证据归档状态、阶段推进门槛、`transitionGate.canAdvance`、复盘检查项、结构化补齐入口和可复制复盘口径；补齐入口包含后台锚点、接口 method/path、payloadHint、payloadTemplate、curlCommand、UsageLog 持久化 feature/event/model 和证据来源，用于每天开工后判断目标推进缺的是线下办理、执行记录、周承诺、证据行动中心、证据归档还是阶段衔接，并直接跳到对应填写区或按命令补齐记录。
- `/api/admin/launch/rollout` 基于上线包和执行工作计划生成资质准备、生产配置、联调验收、小额订单和放量复盘五阶段计划，并把平台申请阻断和单位经济风险纳入对应阶段；该接口只读，用于控制真实收费上线节奏。
- `/api/admin/launch/schedule` 基于外部事项目标日期生成逾期、临期、未排期和已排期风险摘要；该接口只读，用于同步主体、备案、云服务和支付办理节奏。
- `/api/admin/launch/callbacks` 基于 `APP_URL` 生成支付宝、微信支付、七牛、协议材料和微信开放平台所需的回调、域名和协议链接清单；该接口只读，用于第三方平台申请和生产配置核对。
- `/api/admin/launch/application-pack` 聚合回调配置、办理资料包和创始人办理包，按 ICP、支付宝、微信支付、微信开放平台、七牛和 OpenAI 输出平台申请字段、官方入口、生产变量、提交回执、证据链接、证据备注和证据要求；该接口只读，用于真实提交平台开户和支付/存储/模型配置材料。
- `/api/admin/launch/payment-plan` 聚合真实支付小额验收、平台申请材料、回调配置、第三方诊断和外部事项，按支付宝/微信支付输出资质申请、生产参数、`launch:payment-check` 命令行检查、签名诊断、回调业务字段校验、微信支付 API v3 resource 解密烟测、回调地址、小额订单、PAID 回调、权益到账、对账留证、配置命令和证据清单；`launch:payment-check -- --base-url=...` 会运行时确认该 API 给每个支付渠道返回 `callback_guard` 步骤；该接口只读，用于把真实收费渠道从申请推进到小额订单闭环。
- `/api/admin/launch/ai-storage-plan` 聚合生产变量核对、OpenAI/七牛第三方诊断、平台申请材料、回调配置、验收矩阵、外部事项、单位经济和 AI/图片验收证据，输出 OpenAI 项目、模型变量、成本费率、`launch:ai-storage-check` 命令行检查、模型诊断、七牛 bucket、七牛变量、CORS、手相视觉、深度报告和成本样本步骤；`launch:ai-storage-check -- --base-url=...` 会运行时确认该 API 返回完整 OpenAI/七牛步骤和命令组；`POST` 可保存 OpenAI 项目、模型变量、成本费率、诊断输出、七牛 bucket/CORS、手相视觉、深度报告和成本样本证据到 `UsageLog(feature=launch_ai_storage_acceptance_evidence)` 并写入后台审计，用于把核心 AI 体验和图片上传从配置推进到真实收费可验收。
- `/api/admin/launch/integration-schedule` 聚合 AI 与图片能力落地计划和真实支付落地计划，按 OpenAI、七牛、支付宝、微信支付输出真实联调排程、当前可推进链路、诊断动作、端到端验收动作和证据口径；该接口只读，用于把第三方联调从多张面板合成一张执行顺序表。
- `/api/admin/launch/unit-economics` 聚合产品定价、星力发放、单次付费功能、AI UsageLog tokens/costCents、自动估算来源和成本记录缺口，输出单位经济与 AI 成本复盘检查；`POST` 可保存功能、模型、tokens、成本金额、账单/截图链接和备注到 `UsageLog(feature=launch_unit_economics_cost_sample)`，并写入后台审计，用于收费灰度前确认毛利可复盘。
- `/api/admin/launch/business-model` 聚合用户画像、收费商品、AI 成本样本、支付费、运营预留、建议获客成本上限和渠道 ROI，输出商业模型与收费回收护栏；该接口只读，用于判断哪些人会买单、哪些商品适合主推、投放前成本和毛利是否能闭合。
- `/api/admin/launch/compliance` 聚合协议四件套、主体名称、ICP备案号、协议链接、上传授权、免责声明、隐私供应商披露和法务复核状态，输出合规一致性阻断项和可复制核对清单；`launch:compliance-check -- --base-url=...` 会运行时确认该 API 返回完整核对项；该接口只读，用于正式收费前确认主体、备案、支付主体和协议材料一致。
- `/api/admin/launch/compliance-plan` 聚合合规核对、外部事项、平台申请材料和回调配置，输出主体路径、正式域名/ICP备案、协议主体、支付主体一致、隐私供应商、图片授权、退款客服口径、法务归档、办理顺序和证据清单；`launch:compliance-check -- --base-url=...` 会运行时确认该 API 返回完整合规落地步骤和命令组；该接口只读，用于把个人当前缺少主体的现实办理路径拆成收费上线前可执行步骤。
- `/api/admin/launch/acceptance` 基于 Go/No-Go 阻断项和已保存手测证据生成端到端上线验收用例矩阵，覆盖登录、会员档案、AI 对话、命理工具、手相、支付、深度报告、分享归因和后台证据；`POST` 可保存用例、验收结果、验收人、截图/记录链接、录屏链接和备注到 `UsageLog(feature=launch_acceptance_evidence)`，没有通过证据的非阻断用例会保持待复核。
- `/api/admin/launch/payment-acceptance` 聚合支付宝/微信支付配置、真实渠道订单、支付成功回调、平台交易号、钱包发放流水和后台验收证据记录，输出小额真实订单验收状态、渠道缺口和可复制支付验收清单；`POST` 可保存渠道、订单号、平台交易号、金额、交易/权益截图、对账凭证和备注到 `UsageLog(feature=launch_payment_acceptance_evidence)`，用于正式收费前核对收款、权益和对账凭证。
- `/api/admin/launch/evidence-gap` 聚合收费上线包、端到端验收矩阵、平台申请材料、单位经济、真实支付小额验收和最新证据归档，输出验收可执行率、证据归档状态、截图/录屏、平台回执、小额订单、成本样本、后台归档/记录分类、优先补证缺口和可复制补证清单；该接口只读，用于上线前判断还缺哪份截图、录屏、交易凭证、成本样本或后台记录。
- `/api/admin/launch/evidence-action-center` 基于证据缺口按截图/录屏、平台回执、小额订单、成本样本、后台归档和后台记录分组，输出每类证据负责人、目标、优先补证项、路径和可复制行动口径；该接口只读，用于把补证工作拆成每日可推进的证据类型清单。
- `/api/admin/launch/decision` 聚合收费上线包、生产上线总门禁、平台申请材料、生产变量、合规、真实支付、单位经济、证据缺口、灰度阶段、排期风险和执行计划，输出 `productionGate` 快照、`production_gate` gate、`no_go`、`internal_gray`、`paid_smoke` 或 `release_ready` 最终收费上线决策；生产总门禁未 ready 时不能进入公开收费放量，该接口只读，用于后台第一屏和上线会前复核。
- `/api/admin/launch/goal-plan` 聚合最终上线决策、本周推进、排期风险、灰度阶段、上线证据缺口和单位经济，输出 0-14、15-30、31-60、61-90 天目标规划、当前阶段指标、下一步动作和验收证据；`PATCH` 可保存阶段目标日、负责人、推进状态和证据备注到 `UsageLog(feature=launch_goal_progress)` 并写入后台审计。人工推进状态只作为项目管理留痕，不反向改变 Go/No-Go 闸门结果。
- `/api/admin/launch/blocker-dashboard` 聚合生产上线总门禁、域名与部署、合规与主体、生产数据库、AI 与图片、真实支付、上线证据行动中心和 30/60/90 天目标规划，输出生产门禁 `releaseReady`/细分阻断数字、当前先办工作线、跨工作线优先动作队列、工作线状态和可复制阻断口径；生产总门禁会作为 `production_gate` 第 0 条工作线进入优先队列，该接口只读，用于把多个上线面板合成“今天先办什么”的总控台。
- 会员购买页会读取真实支付放行状态：开发期继续展示并保留 mock payment，真实支付按钮在最终决策未进入 `paid_smoke` 前不可点击；进入 `paid_smoke` 后也只有内部白名单账号可点击，`release_ready` 才面向所有登录用户。

## 报告中心

- `Report` 保存 `status`、`modelUsed`、`costTokens`、`shareSlug` 和可选 `orderId`。
- 生成报告默认进入 `COMPLETED` 状态，后续深度报告可先创建 `GENERATING` 状态再异步更新。
- `/reports/[reportId]` 为登录用户私有详情页，展示工具结果和成本元数据。
- `/share/[shareSlug]` 为公开分享页，只展示正文，不暴露原始输入、图片、工具 JSON 或账户信息。
- `/share/[shareSlug]` 支持复制链接、系统分享、跳转海报页和回流购买入口。
- `/share/[shareSlug]/poster` 使用浏览器 Canvas 生成公开报告长图，可下载 PNG；海报只包含标题、摘要、正文节选、公开链接和二维码。
- 二维码由前端 `qrcode` 生成，指向带 `source=poster_qr` 的公开分享页。
- 分享页、海报页和复制/系统分享/下载海报动作会写入 `UsageLog(feature=share_event)`，metadata 保存 `event`、`source`、`shareSlug`、`reportId` 和 `reportType`。
- 分享页会通过 `/api/attribution/share/[shareSlug]` 写入 30 天 httpOnly 归因 cookie，并记录 `UsageLog(feature=share_attribution)` 的 `landing` 事件。
- 分享落地来源统一走渠道命名治理，支持显式 `source`，也支持从 `utm_source`、`utm_medium`、`utm_campaign` 合并生成规范来源，例如 `paid_ad__cpc__new_user`。
- 邮箱登录、订单创建和 mock 支付成功会读取归因 cookie，分别写入 `login`、`order_created`、`paid` 转化事件，metadata 保存分享来源、报告、用户、订单、商品和金额。
- 报告详情页提供公开分享开关；关闭分享时后端清空 `shareSlug`，旧公开链接立即不可访问。
- `/reports/deep` 提供单次付费深度报告入口，mock 支付成功后调用生成接口并绑定 `orderId`。
- `/api/reports/deep/orders/[orderId]/generate` 校验订单归属、商品类型和支付状态后，先创建 `GENERATING` 报告并返回，再由后台任务补全正文、模型和 token 成本。
- `/api/reports/[reportId]` 返回当前用户的私有报告状态，深度报告页面用它轮询生成结果。
- 本地 Compose 已提供 Redis 7、AOF 持久化和 `REDIS_URL`；当前后台任务仍采用 Node 进程内 job set，后续接入 Redis 队列时保持现有 API 合约不变。
- `/reports/[reportId]/export` 为私有导出版，只允许报告所有者访问已完成报告；页面隐藏工具结果和原始输入，并提供浏览器打印 / 保存 PDF。

## 会员档案

- `/api/profile` 负责读取和保存会员命理档案。
- `FortuneProfile` 保存称呼、性别、出生日期、出生时间、出生地、关系状态、事业关注和长期关注主题。
- 公历出生信息完整时，后端会派生八字、五行强弱、生肖和 `memorySummary`。
- `/api/chat` 调用 `profile_reader`，让 AI 对话和八字工具可复用会员档案。
- 本地无数据库时使用内存降级，保证演示链路不断。

## 成本记录

每次 AI 调用写入 `UsageLog`：

- provider
- model
- feature
- tokensIn
- tokensOut
- imageCount
- costCents
- costCurrency / estimatedCost / costSource

目标是让 AI 成本控制在收入的 15%-25%。

后台健康页提供数据库验收证据快填，用于保存连接检查、Schema 同步、落库探针、上线事件覆盖、备份策略和恢复演练证据。数据库验收证据会进入生产数据库落地计划、上线证据归档、收费上线包刷新判断和 PostgreSQL 持久化覆盖清单。
后台健康页提供部署验收证据快填，用于保存正式域名、生产变量、后台保护、公网回调、预检、页面烟测和回滚记录。部署验收证据会进入域名与部署落地计划、上线证据归档、收费上线包刷新判断和 PostgreSQL 持久化覆盖清单。
后台健康页提供 AI/图片验收证据快填，用于保存 OpenAI 应用、模型环境变量、成本费率、诊断输出、七牛应用、七牛变量、CORS/回调、手相视觉、深度报告和成本样本证据。AI/图片验收证据会进入 AI 与图片能力落地计划、上线证据归档、收费上线包刷新判断和 PostgreSQL 持久化覆盖清单。
后台健康页提供 AI 成本样本快填，用于真实账单或手工回填阶段保存模型、tokens、成本金额和证据链接。成本样本会进入单位经济汇总、上线证据归档、收费上线包刷新判断和 PostgreSQL 持久化覆盖清单。
后台健康页提供目标推进快填，用于保存 0-14、15-30、31-60、61-90 天阶段目标日、负责人、推进状态、证据备注和推进备注。目标推进记录会进入 30/60/90 天目标规划、上线证据归档、收费上线包刷新判断和 PostgreSQL 持久化覆盖清单。

## 八卦问事

第一版采用后端确定性起卦：

- 输入用户问题、观察时间和用户 ID。
- 按日粒度生成六爻，保证同一天同一问题可复现。
- 生成本卦、动爻、变卦、上下卦五行关系和行动建议。
- `/api/fortune/bagua` 扣除 `bagua_question` 星力并写入报告中心。
- AI 对话命中八卦意图时也会调用同一套起卦工具。

## 部署

第一版：

- Web 响应式
- 国内服务器优先
- 海外部署结构预留

正式收费前依赖：

- 域名
- ICP 备案
- 微信开放平台
- 微信支付商户号
- 支付宝开放平台应用
- 七牛云正式域名
- `.env.production.example` 已复制并替换为真实生产变量
- `npm run launch:preflight` 无 blocking
- `/admin/health` 落库探针通过
- `/admin/health` 第三方集成诊断通过
- `/admin/health` 上线总闸无阻断项
- `/admin/health` 上线 Runbook 无 blocking 步骤
- `/admin/health` 外部上线事项均已完成或留有明确证据
- `/admin/health` 已归档最终上线证据

## 合规页面

产品内置四个页面：

- `/legal/terms` 用户协议
- `/legal/privacy` 隐私政策
- `/legal/disclaimer` 免责声明
- `/legal/upload-consent` 图片上传授权

接入点：

- 首页 footer 展示所有合规入口。
- 登录页提示用户阅读用户协议与隐私政策。
- 手相上传前要求用户确认图片上传授权。
- 命理报告持续保留娱乐、文化参考和非专业建议提示。

当前文本是产品合规模板，正式上线前应结合主体资质、上线地区、支付渠道、云服务和模型供应商做律师审查。

## 轻后台

`/admin` 提供轻量运营视图：

- 用户与会员状态
- 订单列表和支付渠道
- 钱包流水
- 报告列表
- AI 调用日志和 token 用量
- 失败/生成中的深度报告重试
- 报告异常补发星力
- 分享访问、海报访问、二维码来源和分享动作概览
- 分享带来的登录、下单、支付和收入归因
- 优惠码下单、优惠码支付、让利金额和优惠后收入
- 优惠码规则状态、占用量、支付量、剩余额度、单用户限用规则和运行配置表单
- 分享 ROI 报表按 `source` 聚合归因漏斗，并通过订单号关联优惠码支付事件，计算折前金额、实收收入、让利成本、支付转化率和收入/让利倍数。
- 渠道投放看板将分享来源归类为自然传播、海报回流、私域社群、达人/投放和未标记来源，并按分层汇总落地、登录、下单、支付、实收、让利、预算动作、优惠动作和内容动作。
- `/api/admin/exports/channel-roi` 导出渠道投放复盘 CSV，包含渠道汇总、来源明细、复盘归档、支付转化、折前金额、实收、让利、收入/让利倍数、优惠码和分享报告线索，并支持 `reviewDecision` 与 `source` 筛选。
- 渠道命名治理看板按注册表检查 `source` 前缀，提示未知来源、大小写/空格/别名归一问题，并在 CSV 来源明细中附带命名状态和建议 source。
- `/api/admin/channels/budget` 保存或清除渠道预算配置，写入 `UsageLog(feature=channel_budget_config)`；后台按 source 生成分享页投放链接模板，并将投放成本与预算周期纳入来源 ROI、渠道分层和 CSV 导出，计算净回收、收入/投放倍数和综合回收倍数。
- 预算预警会按 source 检查周期是否结束、是否即将结束、有成本无支付、综合回收倍数低于 1 或低于 2.5，并给出暂停放量、控制预算或继续观察建议。
- `/api/admin/channels/budget-alerts/config` 保存预算预警阈值，写入 `UsageLog(feature=channel_budget_alert_config)`；后台可配置收支平衡倍数、健康回收倍数、临期天数、无支付落地阈值和高成本阈值。
- `/api/admin/channels/reviews` 将渠道预算周期归档为加码、暂停、复测或结案，写入 `UsageLog(feature=channel_budget_review)`；归档时服务端快照当前 source 的预算、实收、让利、净回收、落地、支付和回收倍数，并在后台和 CSV 中支持按最近复盘结论筛选。
- 增长策略面板根据分享 ROI、优惠码规则、最近订单状态生成来源加码/优化建议，以及优惠码额度、支付率和未支付占用风险提醒。
- 首单实验报表按变体展示曝光用户、下单、支付、曝光到支付转化率、下单支付率和实收金额，并给出继续采样、暂不固化或建议固化的运营判断。
- 运营配置持久化状态会检查 `UsageLog` 当前使用 PostgreSQL、数据库回退内存或纯内存模式，并展示优惠码配置快照、首单实验配置快照、渠道预算配置快照、预算预警阈值快照和后台审计数量。
- `/api/admin/integrations/probe` 提供第三方联调诊断，GET 返回最近诊断，POST 运行 OpenAI 模型读取、七牛上传 token/上传域名、支付宝签名和微信支付签名烟测，并写入 `UsageLog(feature=integration_probe)`。
- `/api/admin/launch/readiness` 聚合生产环境清单、外部事项、PostgreSQL 落库验收和第三方诊断，输出收费上线 Go / No-Go 状态、阻断项、警告项和优先处理动作。
- `/api/admin/launch/runbook` 将上线阻断项映射成基础安全、生产数据、AI/图片、支付、账号和合规操作步骤，便于收集联调证据。
- `/api/admin/launch/evidence` 支持归档当前上线证据，记录备注、阻断项、Runbook 优先项、落库状态、第三方诊断摘要、今日动作执行记录和目标推进记录。
- `/api/admin/launch/external-readiness` 支持单条或批量更新外部办理事项状态、目标日期、证据和备注，并写入后台审计。
- `/api/admin/launch/compliance` 提供合规与协议主体一致性核对，检查主体、备案、协议入口、命理免责声明、隐私披露和图片上传授权。
- `/api/admin/launch/env-draft` 提供生产环境变量草案生成助手，把变量值、办理来源和第三方平台回调配置集中成可复制清单。
- `/api/admin/launch/env-batch-plan` 提供生产变量批次清单，把部署平台变量填写拆成可验证批次，基础安全批次会提示先运行 `npm run launch:secrets` 生成强密钥，避免密钥、域名、数据库、AI、七牛和支付混在一起处理。
- `/api/admin/launch/payment-acceptance` 提供真实支付小额订单验收清单和证据快填，核对订单、PAID 回调、平台交易号、权益到账、截图链接和对账凭证。
- `/api/admin/launch/integration-schedule` 提供真实联调排程，把 OpenAI、七牛、支付宝和微信支付的诊断、配置、端到端验收和证据口径排成优先队列。
- `/api/admin/launch/decision` 提供最终上线决策，并把生产上线总门禁作为 `production_gate` 硬约束，明确当前只能停留在不可收费、内部灰度、小额真实订单或可放量哪一档。
- `/api/admin/launch/weekly-focus` 提供本周推进看板，把负责人、截止日、依赖和验收证据合并成可复制的周任务清单；后台页面会并列展示阶段推进门槛 `transitionGate.canAdvance`，并支持保存任务承诺。
- `/api/admin/launch/daily-brief` 提供今日目标推进日报，把上线阻断、阶段推进门槛、目标规划、本周承诺、今日动作执行记录和证据归档状态合成当天执行口径，并支持保存今日动作执行留痕。
- `/api/admin/launch/goal-followup` 提供目标后续推进复盘，把当前阶段、阶段推进门槛、线下办理当前动作、今日动作执行、本周承诺、证据行动中心和证据归档合成“后续还缺什么”的只读检查口径，并返回可跳转的补齐入口用于补目标、补线下办理动作、补日报、补周承诺、补证据行动中心、补阶段衔接或刷新上线证据。
- `/api/admin/launch/goal-plan` 提供 30/60/90 天目标规划，返回 `transitionGate` 阶段推进门槛、`canAdvance`、下一阶段入口检查项，并支持保存阶段目标日、负责人、推进状态和证据备注。
- `/api/admin/launch/handoff` 提供上线交接摘要，把收费上线包、生产总门禁、目标后续推进、线下办理当前动作、生产变量、外部办理和证据归档压缩成可复制交接口径；`launch:handoff-check -- --base-url=...` 会运行时复核该 API、`/api/admin/launch/workplan` 和后台交接区块。
- `/api/admin/launch/workplan` 提供上线执行工作计划，按外部办理、平台申请、生产变量、联调验收、单位经济和证据放量六条工作线输出 activeLane、workingSet 和可复制执行计划。
- `/api/admin/launch/founder-dossier` 提供面向创始人的线下办理摘要，把主体路径决策、关键办理项、产物、变量和官方入口集中成一份可复制清单。
- `/api/admin/launch/offline-action-pack` 提供线下办理行动包，把今天先办、材料、填表字段、生产变量、回执、建议目标日和证据缺口集中成可复制的一页纸；后台顶部快填使用外部事项更新接口保存当前事项和优先动作队列进度。
- `/api/admin/launch/application-pack` 提供平台申请填表材料，把官网、协议链接、支付通知地址、七牛 CORS、密钥变量、提交回执、证据链接和官方入口按平台分组。
- ICP/支付资质接入前置验收由 `launch:qualification-check` 覆盖，静态复核外部事项、平台申请材料、合规主体、支付落地和真实支付入口保护；传入 `--base-url` 后会请求 `/api/admin/launch/external-readiness`、`/api/admin/launch/application-pack`、`/api/admin/launch/compliance-plan`、`/api/admin/launch/payment-plan`、`/api/admin/launch/decision` 和 `/admin/health`，确认系统已经能承接 ICP、支付宝和微信支付资质证据。
- `/api/admin/launch/unit-economics` 提供单位经济检查，提示产品星力折算、年度会员发放节奏和 OpenAI 成本金额记录缺口。
- `/api/admin/launch/business-model` 提供用户画像、主推商品、AI 成本占比、贡献毛利、建议 CAC 上限和渠道回收护栏。
- 后台重试、补偿等关键操作审计

访问策略：

- 开发环境直接可访问，便于验证数据链路。
- 生产环境需要 `ADMIN_DASHBOARD_ENABLED=true`，并通过 `ADMIN_ACCESS_TOKEN` 进行访问控制。
- 后台不提供人工改订单或删除报告；星力补偿通过 `WalletTransaction` 的 `ADJUST` 流水记录，便于对账。
- `/api/admin/reports/[reportId]/retry` 可重试失败或卡住的深度报告生成任务。
- `/api/admin/reports/[reportId]/compensate` 可给报告所属用户补发星力，并同步会员余额。
- 重试报告、补发星力、优惠配置更新、渠道预算更新、预算预警阈值更新、渠道预算复盘归档、渠道复盘导出和外部上线事项更新会写入 `UsageLog(feature=admin_action)`，metadata 保存动作、状态、报告、订单、优惠码、目标用户、金额、原因、导出范围和脱敏来源信息。
- `getSession()` 会读取持久化会员状态，后台补偿后用户下一次请求即可使用新余额。

## 上线自检

`/admin/health` 提供生产环境检查：

- `APP_URL` 是否为正式域名
- `AUTH_SESSION_SECRET` 是否配置
- `DATABASE_URL` 是否配置
- OpenAI、视觉模型、七牛、支付宝、微信支付是否完整
- 后台访问 token 是否配置
- 微信登录、主体名称、ICP备案号是否就绪

部署前也可以在命令行运行：

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
```

`launch:secrets` 只输出强随机 `AUTH_SESSION_SECRET` 和 `ADMIN_ACCESS_TOKEN` 等基础安全变量，不写入文件，避免真实密钥进入代码仓库。
`launch:url-check` 会读取 `APP_URL`，验证正式 HTTPS、公网页面、协议链接、会员页登录保护，以及支付宝/微信支付/七牛回调路径的公网可达性；它不会模拟真实支付回调。
`launch:compliance-check` 会读取 `.env.production.local` 或 `.env.production`，静态验证协议四件套、主体/备案变量、合规核对、合规落地计划和后台展示；传入 `--base-url` 后会额外请求四个协议页、`/api/admin/launch/compliance` 和 `/api/admin/launch/compliance-plan`。
`launch:qualification-check` 会静态验证 ICP/支付资质接入前置验收、外部事项 GET/PATCH、平台申请材料、合规主体计划、支付落地计划、真实支付入口保护和文档口径；传入 `--base-url` 后会额外请求 `/api/admin/launch/external-readiness`、`/api/admin/launch/application-pack`、`/api/admin/launch/compliance-plan`、`/api/admin/launch/payment-plan`、`/api/admin/launch/decision` 和 `/admin/health`，并原样写回 ICP/支付宝/微信支付当前状态以确认批量保存通路。
`launch:offline-action-check` 会静态验证线下办理材料模板、创始人办理包、行动包、外部事项 API、后台快填表单和文档口径；传入 `--base-url` 后会额外请求 `/api/admin/launch/offline-action-pack`、`/api/admin/launch/founder-dossier`、`/api/admin/launch/external-readiness` 和 `/admin/health` 的线下办理区块。
`launch:evidence-check` 会静态验证上线证据行动中心、上线证据缺口、上线证据归档 metadata、API 鉴权/no-store、后台归档按钮和文档口径；传入 `--base-url` 后会额外请求 `/api/admin/launch/evidence-action-center`、`/api/admin/launch/evidence-gap`、`/api/admin/launch/evidence`，写入一次测试归档，并确认 `/admin/health` 的证据行动中心、证据缺口和上线证据归档区块可用。
`launch:goal-plan-check` 会静态验证 30/60/90 天目标规划、四阶段目标、阶段推进门槛、目标推进持久化、GET/PATCH API、后台目标推进快填和文档口径；传入 `--base-url` 后会额外请求 `/api/admin/launch/goal-plan`，保存一次当前阶段推进记录，并确认 `/admin/health` 的开工目标、阶段推进门槛、目标推进快填和可复制目标规划可用。
`launch:weekly-focus-check` 会静态验证本周推进看板、承诺覆盖率、负责人分组、本周承诺持久化、GET/PATCH API、后台承诺表单和文档口径；传入 `--base-url` 后会额外请求 `/api/admin/launch/weekly-focus`，保存一次本周任务承诺，并确认 `/admin/health` 的本周推进、本周承诺、阶段门槛和可复制本周看板可用。
`launch:daily-brief-check` 会静态验证今日目标推进日报、今日优先动作来源、今日动作执行持久化、日报 GET/PATCH API、后台快填和文档口径；传入 `--base-url` 后会额外请求 `/api/admin/launch/daily-brief`，保存一次今日动作执行留痕，并确认 `/admin/health` 的今日目标推进日报、今日优先动作、今日动作执行快填和可复制推进日报可用。
`launch:handoff-check` 会静态验证上线交接与执行计划验收、上线交接摘要聚合、六条执行工作线、交接/执行计划 API、后台交接区块和文档口径；传入 `--base-url` 后会额外请求 `/api/admin/launch/handoff`、`/api/admin/launch/workplan` 和 `/admin/health`，确认生产总门禁交接、线下办理交接、目标后续推进和可复制交接口径可用。
`launch:goal-followup-check` 会静态验证目标后续推进复盘、结构化补齐入口、请求体模板、执行命令、UsageLog 持久化证据映射、阶段推进门槛、最终决策阶段门槛、上线证据阶段门槛 metadata、线下办理 `offline_action` 日报动作、目标复盘线下办理补齐入口、目标复盘证据行动中心补齐入口、上线交接线下办理当前动作、上线证据线下办理 metadata、后台锚点、带生产总门禁和阶段推进门槛的上线交接摘要、带生产门禁优先项和 `goal_transition` 阶段门槛动作的今日目标推进日报和文档口径；传入 `--base-url` 后会额外请求 `/api/admin/launch/goal-plan`、`/api/admin/launch/goal-followup`、`/api/admin/launch/handoff`、`/api/admin/launch/daily-brief`、`/api/admin/launch/decision` 和 `/admin/health`，确认运行时入口结构、payloadTemplate、curlCommand、persistence、`transitionGate.canAdvance`、goalFollowup.evidenceActionCenter、handoff.goalFollowup.transitionGate、handoff.offlineAction、dailyBrief.transitionGate、dailyBrief.productionGate、dailyBrief.offlineAction、decision.goalTransitionGate 与页面锚点仍可用。`launch:production-gate-check` 会额外覆盖最终上线决策中的 `productionGate` 快照、`production_gate` gate 和后台最终决策卡片，避免真实支付保护绕开生产总门禁。

该脚本读取 `.env.production.local` 或 `.env.production`，检查生产域名、会话密钥、后台 token、PostgreSQL、登录入口、OpenAI、七牛、`PAYMENT_PROVIDER=live`、真实支付渠道和主体备案字段。只要存在 blocking 项，脚本会以非 0 退出码结束，适合接入部署流水线。

检查状态分为：

- `ready`：配置完整
- `warning`：开发期可用，但商业化或真实能力受限
- `blocking`：生产上线前必须修复
