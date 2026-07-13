# 玄机 AI 后续执行路线

## 当前状态

已完成第一轮可演示商业闭环：

- Next.js 项目骨架
- 黑金风格首页、会员中心、工具入口和响应式页面
- 首屏视觉资产
- PRD、设计规范、技术架构、MVP 任务清单
- Prisma 核心数据模型
- 环境变量样例
- 邮箱验证码登录、会员中心、mock payment、星力钱包
- 塔罗推演、八字五行简析、八卦问事、手相上传、AI 对话和报告详情页
- 深度报告付费生成、报告导出、公开分享、海报二维码和分享归因
- 优惠码、首单优惠 A/B、渠道 ROI、渠道复盘 CSV、渠道命名治理、渠道预算录入、预算预警、预警阈值配置、预算复盘归档、复盘结论筛选和增长策略后台
- 运营配置持久化状态看板、生产数据落库探针、生产数据库落地计划、数据库验收证据快填、域名与部署落地计划、真实支付落地计划、AI 与图片能力落地计划、AI/图片验收证据快填、AI 成本样本快填、商业模型与收费回收护栏、第三方联调诊断、真实联调排程、上线 Go/No-Go 总闸、上线 Runbook、上线证据归档、外部事项跟踪、收费上线包、办理资料包、主体路径决策助手、线下办理行动包、生产变量核对、生产变量草案、生产变量批次清单、第三方回调配置清单、合规主体一致性核对、合规与主体落地计划、端到端验收矩阵、真实支付小额订单验收、上线证据行动中心、上线证据缺口、最终上线决策、上线阻断总控台、今日目标推进日报、今日动作执行快填、目标后续推进复盘、30/60/90 天目标规划、目标推进快填、上线交接摘要、上线执行工作计划、分阶段灰度放量计划、上线排期风险、变量证据归档、上线预检脚本、上线自检和后台审计

下一步重点是把生产环境真正跑稳：正式 PostgreSQL 配置与迁移、真实投放参数治理、真实 OpenAI/七牛/支付联调，以及主体资质完成后的上线检查。

## 里程碑 1：账号与会员底座

目标：用户能登录，并看到自己的会员和星力状态。

交付物：

- 邮箱验证码登录
- 用户 session
- 登录态导航
- 会员套餐配置
- 星力余额展示
- 星力消耗规则

验收标准：

- 新用户可以用邮箱进入系统。
- 登录后自动拥有免费权益。
- 页面能展示当前会员档位、星力余额和可用功能。
- 微信扫码登录入口存在，但可以通过开关关闭。

## 里程碑 2：mock payment 收费闭环

目标：不等支付资质，也能完整验证收费产品。

交付物：

- 订单创建
- mock payment 支付成功页
- 会员发放
- 星力值到账
- 订单列表
- 钱包流水

验收标准：

- 用户点击套餐能生成订单。
- mock 支付成功后订单变为已支付。
- 对应会员或星力值到账。
- 后台能查看订单和发放记录。

## 里程碑 3：AI 对话与塔罗 MVP

目标：跑通第一次真实体验。

交付物：

- AI 对话页
- 推演步骤展示
- 塔罗三牌阵
- 今日单牌
- 星力扣费
- 报告保存

验收标准：

- 用户可以完成一次今日塔罗。
- 三牌阵会按步骤展示洗牌、抽牌、翻牌、解读。
- 生成结果保存到报告中心。
- 使用付费牌阵会扣星力。

## 里程碑 4：八字五行与报告中心

目标：建立专业感和报告沉淀。

交付物：

- 出生信息表单
- 八字/五行基础计算工具
- 五行比例展示
- 简版报告
- 深度报告生成流程
- 报告详情页

验收标准：

- 用户填写出生信息后保存到会员档案。
- 系统生成八字五行简析。
- 深度报告可以通过星力或订单解锁。
- 报告详情可反复查看。

## 里程碑 5：手相上传与七牛云

目标：完成强转化入口。

交付物：

- 七牛上传凭证接口
- 手相图片上传
- 图片 metadata 保存
- 图片删除
- 手相 AI 视觉分析入口与本地降级
- 手相报告

验收标准：

- 用户可以上传图片到七牛云。
- 系统保存图片记录。
- 用户可以删除自己的图片。
- 手相报告进入报告中心。

## 里程碑 6：真实支付预留接入

目标：你资质完成后可切换真实收款。

交付物：

- 支付宝支付适配层
- 微信支付适配层
- 支付回调签名校验占位
- 支付渠道开关
- 对账字段

验收标准：

- mock、支付宝、微信支付走同一套订单状态机。
- 真实支付参数缺失时不会影响本地开发。
- 开关开启后能进入真实支付流程。

## 里程碑 7：增长与运营后台

目标：让收费产品可复盘、可调整、可控制风险。

交付物：

- 优惠码有效期、总量上限、单用户上限
- 首单优惠 A/B 实验和胜出变体固化
- 分享归因 ROI 和渠道分层看板
- 渠道投放复盘 CSV 导出
- 投放链接模板和渠道预算/成本录入
- 渠道预算周期和风险预警
- 预算预警阈值后台配置
- 渠道预算复盘归档
- 渠道复盘结论筛选和筛选导出
- 增长动作建议和优惠码风险提醒
- 运营配置持久化状态看板

验收标准：

- 后台能看到来源落地、登录、下单、支付、实收和让利。
- 运营可暂停/恢复优惠码并审计操作。
- 首单券可在 A/B 和固定默认券之间切换。
- 渠道复盘 CSV 可直接用于投放复盘。
- 后台能提示当前配置是数据库持久化、数据库回退内存还是纯内存。
- 后台健康页能运行落库探针，确认 UsageLog 已在 PostgreSQL 写入并读回，并显示外部事项、本周承诺、今日动作执行记录、目标推进记录、第三方诊断、AI/图片验收证据、数据库验收证据、部署验收证据和上线证据的持久化覆盖。
- 分享落地链接支持 `source` 和 UTM 参数，并能在后台识别未知或非规范来源。
- 渠道 ROI 能展示投放成本、让利成本、净回收和收入/投放倍数。
- 渠道预算能按周期预警，提醒周期结束、低回收或有成本无支付。
- 预算预警阈值可在后台调整，并留下审计记录。
- 预算周期能归档复盘结论，CSV 能带出最近复盘结论和备注。
- 运营能按加码、暂停、复测、结案筛选复盘档案，并导出当前筛选 CSV。

## 里程碑 8：生产上线验收

目标：从演示环境进入可收费上线环境。

交付物：

- PostgreSQL 正式库和迁移记录
- `/admin/health` 生产数据库落地计划显示 PostgreSQL 实例、DATABASE_URL、`launch:db-check` 连接检查、Prisma Schema、落库探针、上线事件覆盖、备份回滚步骤和数据库验收证据均无 blocking
- 已运行 `npm run launch:secrets` 生成基础安全变量，`.env.production.example` 对应生产变量已填入，并通过 `npm run launch:preflight`
- `/admin/health` 生产变量草案已用于部署平台填写，优先变量、办理来源和第三方平台配置提示均已核对
- `/admin/health` 生产变量批次清单显示基础安全、主体域名、生产数据库、OpenAI、七牛、真实支付和微信登录各批次无 blocking，并有对应验证和证据；基础安全批次使用 `npm run launch:secrets` 生成强密钥；`launch:db-check -- --base-url=<APP_URL>` 可运行时验收数据库落地计划 API 步骤和命令组完整
- `/admin/health` 域名与部署落地计划显示域名/DNS、HTTPS APP_URL、`launch:url-check` 公网 URL 验收、`launch:url-check -- --base-url=...` 的域名/部署计划 API 运行时验收、部署平台变量、后台访问保护、会话密钥、公网回调、预检脚本、页面烟测、重启回滚和部署验收证据均无 blocking
- `/admin/health` 生产变量核对台无 blocking，且密钥、连接串和支付参数均已脱敏确认配置状态
- 外部事项跟踪中主体、域名、备案、生产数据库、OpenAI、七牛、微信、支付宝和法务审查均有状态、目标日期、提交回执、证据链接和证据备注
- 办理资料包中的准备材料、产出凭证、生产变量和验收方式已逐项对齐
- 创始人办理包中的主体路径决策、关键办理顺序、官方入口和生产变量解锁关系已用于线下推进
- 线下办理行动包显示无 blocking，今天先办、材料、平台填表字段、生产变量、回执证据、建议目标日和官方入口均能对应到外部事项或第三方平台记录，并且顶部当前事项快填或优先动作服务端批量保存的目标日期、回执、证据链接和备注能同步反映到外部事项表单；保留 `npm run launch:offline-action-check` 输出
- 生产落库探针通过记录
- `npm run launch:db-check` 和 `npm run launch:db-check -- --schema` 输出通过记录
- `npm run launch:url-check` 输出通过记录
- `npm run launch:goal-followup-check` 输出通过记录；上线前可追加 `-- --base-url=<APP_URL>` 验证目标补齐入口、交接摘要、最终上线决策、今日线下办理动作、上线证据 metadata 中的阶段推进门槛与线下办理当前动作、`transitionGate.canAdvance` 和后台锚点运行时可用
- 真实 OpenAI Key、视觉模型和预算上限
- 七牛正式 bucket、公开域名和跨域配置
- 支付宝/微信支付商户参数和沙箱联调
- 第三方联调诊断通过记录
- 真实联调排程中 OpenAI、七牛、支付宝和微信支付链路无 blocking，优先动作和证据口径均已闭合或留证
- 上线 Go/No-Go 总闸无阻断项记录
- 上线 Runbook 中基础安全、生产数据、AI/图片、支付、账号和合规步骤的验收证据
- 生产变量核对中的 `env:*` 阻断项已清零，并在 Go/No-Go、Runbook 和上线包中同步通过
- 上线交接摘要可复制给执行人，且其中的阻断项、目标后续推进、阶段推进门槛、`transitionGate.canAdvance`、线下办理当前动作、目标补齐入口、变量优先项、外部办理项和证据归档状态都已清零或闭合
- 上线执行工作计划按外部办理、平台申请、生产变量、联调验收、单位经济和证据放量六条工作线闭合，负责人、依赖和验收证据均明确
- `npm run launch:handoff-check -- --base-url=<APP_URL>` 通过，能复核 `/api/admin/launch/handoff`、`/api/admin/launch/workplan`、上线交接与执行计划验收、六条工作线、生产总门禁交接、线下办理交接、目标后续推进和可复制交接口径
- 本周推进看板显示无逾期任务，负责人、截止日、建议承诺日、依赖和验收证据均明确，任务承诺覆盖率达到 100%，并展示本周阶段门槛 `transitionGate.canAdvance`，复制口径可直接用于本周推进
- `npm run launch:weekly-focus-check -- --base-url=<APP_URL>` 通过，能复核 `/api/admin/launch/weekly-focus`、本周任务承诺覆盖率、负责人分组、本周承诺 PATCH 写回、后台本周承诺表单、阶段门槛和可复制本周看板。
- 分阶段灰度放量计划显示资质准备、生产配置、联调验收、小额订单和放量复盘五阶段均无阻断，平台申请材料与单位经济风险均已清零或闭合
- 上线排期风险无逾期项，关键外部事项都有目标日期或已完成证据
- 第三方回调配置清单中的支付宝 notify_url、微信支付 notify_url、七牛 CORS 来源、协议链接和 APP_URL 均为正式 HTTPS 地址
- 平台申请材料包中的 ICP、支付宝、微信支付、微信开放平台、七牛和 OpenAI 字段已可复制，并对应到生产变量、提交回执、证据链接和证据要求
- `npm run launch:qualification-check -- --base-url=<APP_URL>` 通过，能复核 ICP/支付资质接入前置验收、`/api/admin/launch/external-readiness`、`/api/admin/launch/application-pack`、`/api/admin/launch/compliance-plan`、`/api/admin/launch/payment-plan`、`/api/admin/launch/decision`、真实支付入口保护和后台资质区块；该命令只证明系统能承接资质证据，真实 ICP、支付宝和微信支付审批仍需平台回执闭合
- 合规主体一致性核对无 blocking，主体名称、ICP备案、支付主体、协议入口、隐私披露、图片授权和法务复核证据均已闭合，并保留 `npm run launch:compliance-check` 输出
- 合规与主体落地计划无 blocking，主体路径、域名/ICP备案、协议主体、支付主体一致、退款客服口径、图片授权和法务归档均有证据，并保留 `launch:compliance-check -- --base-url=...` 运行时验收输出
- 端到端验收矩阵中的登录、会员档案、AI 对话、命理工具、手相、支付、深度报告、分享归因和后台证据用例均已手测留证，且每条用例都有验收人、截图/录屏或后台记录链接
- 真实支付小额订单验收显示至少一个支付渠道完成 PAID 回调、平台交易号、金额与商户字段一致性校验、权益到账、后台验收证据快照和对账凭证；双渠道上线前支付宝和微信支付均需闭合
- 真实支付落地计划显示至少一个渠道从资质申请、商户参数、签名诊断、回调业务字段校验、微信支付 API v3 resource 解密烟测、回调地址、小额订单、PAID 回调、权益到账到对账留证均无 blocking
- 单位经济检查能看到会员/单次付费的星力折算，OpenAI 调用或后台成本样本能记录 tokens、估算 costCents、成本来源与账单证据，年度会员发放节奏与页面承诺一致
- 商业模型能看到用户画像、入口商品、升级路径、AI 成本占比、贡献毛利、建议 CAC 上限和渠道回收样本
- 上线证据缺口清单显示无 blocking，验收可执行率已达到 100%，截图/录屏、平台回执、小额订单、成本样本、后台归档/记录分类均无缺口，平台申请材料、单位经济和最新证据归档与当前状态一致
- 上线证据行动中心显示无 blocking，截图/录屏、平台回执、小额订单、成本样本、后台归档和后台记录六类补证清单都已闭合或有可追溯记录
- 最终上线决策显示 `release_ready`；进入真实支付灰度前至少应显示 `paid_smoke`，且生产门禁 `releaseReady`、平台申请材料、单位经济无 blocking，阻断项只剩小额订单验证类证据
- 上线阻断总控台显示无 blocking，生产门禁 `releaseReady`、细分阻断数字、当前先办工作线、优先动作队列和可复制阻断口径均与生产上线总门禁和各细分面板状态一致
- 今日目标推进日报显示无 blocking，生产门禁 `releaseReady`、门禁阻断数字、线下办理当前动作、阶段推进门槛 `transitionGate.canAdvance`、今日先办动作、执行状态、目标快照、证据状态、关键阻断数字和可复制日报文本均与生产上线总门禁、线下办理行动包、上线包、阻断总控、本周推进和目标规划一致；线下办理未闭合时今日动作中必须出现 `offline_action`，阶段门槛未放行时今日动作中必须出现 `goal_transition`，今日动作执行快填记录了状态、负责人、证据备注和推进备注
- `npm run launch:daily-brief-check -- --base-url=<APP_URL>` 通过，能复核 `/api/admin/launch/daily-brief`、生产门禁摘要、线下办理当前动作、阶段推进门槛、今日优先动作、今日动作 PATCH 写回、今日动作执行快填和可复制推进日报。
- 目标后续推进复盘显示无 blocking，当前阶段、阶段推进门槛、`transitionGate.canAdvance`、线下办理当前动作、今日动作留痕、本周承诺分布、证据行动中心、证据归档、后续优先补齐项和结构化补齐入口均与今日目标推进日报、30/60/90 目标规划、本周推进看板、上线证据行动中心和上线证据归档一致
- 30/60/90 天目标规划显示当前阶段无 blocking，0-14 天开工闭环、15-30 天小额真实订单、31-60 天复购会员档案和 61-90 天海外结构预留均有目标日、负责人、指标、阶段推进门槛、下一阶段入口、下一步和验收证据，并已保存阶段推进状态和证据备注
- `npm run launch:goal-plan-check -- --base-url=<APP_URL>` 通过，能复核 `/api/admin/launch/goal-plan`、四阶段目标、当前阶段、阶段推进门槛、当前阶段 PATCH 写回、目标推进快填和可复制目标规划。
- 最终上线证据归档记录，包含生产变量核对摘要、分组状态、优先变量项、数据库验收证据、部署验收证据、AI/图片验收证据、端到端验收留证、支付验收状态、最近支付证据、AI 成本样本、今日动作执行记录、线下办理当前动作、目标推进摘要和阶段推进门槛 `transitionGate.canAdvance`
- 收费上线包显示无阻断项，且最新证据归档与当前 Go/No-Go、AI/图片验收、支付验收、成本样本、今日动作执行记录和目标推进记录一致
- 域名、主体、ICP备案和协议页主体信息
- 生产后台访问 token 和上线自检全部通过

验收标准：

- 服务重启后订单、会员、钱包、报告、配置和审计仍可恢复，后台落库探针显示通过，数据库验收证据已保存，且上线关键事件持久化覆盖无必要缺口。
- `/api/admin/launch/database-plan` 返回无 blocking，命令顺序、连接检查、核心表检查、证据清单、备份策略和恢复演练记录均能对应到后台或云数据库证据。
- `npm run launch:preflight` 无 blocking，且 `PAYMENT_PROVIDER=live`。
- `/admin/health` 生产变量核对台不再显示缺失、占位、本地 URL 或强度不足的 blocking 项，且这些变量项不会再出现在 Go/No-Go 阻断列表。
- `/api/admin/launch/env-draft` 返回的草案不包含真实密钥原文，且可复制内容覆盖正式域名、主体、生产库、OpenAI、支付、七牛和回调配置提示。
- `/api/admin/launch/env-batch-plan` 返回无 blocking，生产变量批次、验证动作和证据口径能对应部署平台、第三方后台或上线证据归档；真实支付批次已配置内部小额订单白名单变量。
- `/api/admin/launch/deployment-plan` 返回无 blocking，APP_URL 为正式 HTTPS，部署变量、后台 token、会话密钥、公网回调、`launch:url-check`、`launch:url-check -- --base-url=...` 运行时验收、页面烟测、回滚恢复和部署验收证据均能对应部署平台或后台记录。
- `/admin/health` 外部事项跟踪全部为已完成，并留有提交回执、证据链接或证据备注；处理中或已提交只表示办理进度，仍会进入 Go/No-Go 阻断。
- `/api/admin/launch/compliance` 返回无 blocking，协议主体、备案号、协议链接、免责声明、隐私供应商披露和图片上传授权均有可追溯证据，且 `launch:compliance-check -- --base-url=...` 能确认核对项完整。
- `/api/admin/launch/compliance-plan` 返回无 blocking，主体路径、ICP备案、支付主体一致、协议版本、退款客服口径、图片授权和法务归档均能对应外部事项或协议页面证据，且 `launch:compliance-check -- --base-url=...` 能确认 9 个步骤和命令组完整。
- `/admin/health` 办理资料包中的变量已写入生产环境，产出凭证能对应到外部事项提交回执、证据链接或证据备注。
- `/api/admin/launch/founder-dossier` 能输出主体路径决策、当前未完成主体、备案、支付、云服务事项的关键路径和可复制办理摘要。
- `/api/admin/launch/offline-action-pack` 返回无 blocking，当前先办事项、阶段状态、材料、填表字段、变量、回执、建议目标日和证据缺口能对应 `/admin/health` 展示；`launch:offline-action-check -- --base-url=...` 能确认行动包、主体路径决策、外部事项和后台区块完整；当前事项快填或优先动作服务端批量保存后，`/api/admin/launch/external-readiness` 能返回同一批更新记录，且批量请求会先整体校验再写入快照。
- `/admin/health` 收费上线包的上线前必补项清零，证据归档不再提示缺失或需刷新。
- `/admin/health` 上线交接摘要显示无新增动作，目标后续推进无 blocking，阶段推进门槛 `transitionGate.canAdvance=true`，目标补齐入口没有待处理项，复制口径可作为最终上线交接记录。
- `/admin/health` 上线执行工作计划显示无待执行阻断任务，六条工作线均无 blocking。
- `launch:handoff-check -- --base-url=...` 能确认交接摘要 GET、执行计划 GET、后台交接区块、生产总门禁交接、线下办理交接、目标后续推进和可复制交接口径完整；该命令输出需归档为阶段交接和上线会前的执行证据。
- `/api/admin/launch/weekly-focus` 返回的本周推进看板无 blocking、无逾期项，承诺覆盖率达到 100%，后台本周推进区显示阶段推进门槛 `transitionGate.canAdvance`，且每个负责人任务都有截止日、验收证据、已保存承诺和明确承诺状态。
- `launch:weekly-focus-check -- --base-url=...` 能确认本周推进 GET/PATCH、承诺留痕、负责人视图、后台本周推进区块和文档口径完整；该命令输出需归档为每周计划会和每日开工前的执行证据。
- `/admin/health` 分阶段放量计划进入小额真实订单或放量复盘阶段前无 blocking，且每阶段退出证据可追溯。
- `/admin/health` 上线排期风险没有逾期项，未排期外部事项已补目标日期或已完成。
- `/admin/health` 第三方回调配置清单无 blocking，平台申请材料中的 URL 与生产 APP_URL 一致。
- `/api/admin/launch/application-pack` 无 blocking，平台申请字段里的官网、协议链接、支付通知地址、七牛 CORS、模型用途说明、提交回执和证据链接可直接提交或归档。
- `launch:qualification-check -- --base-url=...` 能确认外部资质事项、平台申请材料、合规主体计划、支付落地计划、最终上线决策和后台区块均可用于 ICP/支付资质接入前置验收；该检查不能替代真实 ICP 备案号、支付宝应用审核或微信支付商户审核。
- `/admin/health` 端到端验收矩阵无 blocking，每个主链路用例都有可追溯的验收人、截图、录屏或后台记录；验收留证变更后收费上线包会提示刷新最终归档。
- `/admin/health` 真实支付小额订单验收无 blocking，至少一笔小额真实订单能对应支付平台交易号、订单 PAID 状态、钱包/会员权益和对账截图。
- `/api/admin/launch/payment-plan` 返回至少一个 ready 渠道，且支付变量、`npm run launch:payment-check` 输出、`launch:payment-check -- --base-url=...` 的 `callback_guard` 运行时验收、回调地址、签名诊断、小额订单、权益到账和对账证据均能对应后台或支付平台证据。
- `/api/admin/launch/integration-schedule` 返回无 blocking，OpenAI、七牛、支付宝和微信支付四条链路的诊断、端到端验收和证据口径均能对应细分面板。
- `/api/admin/launch/unit-economics` 无 blocking，且 OpenAI 样本日志或 `launch_unit_economics_cost_sample` 记录包含成本金额、估算来源和证据链接；年度会员发放节奏已确认。
- `/api/admin/launch/business-model` 返回商业模型摘要、用户画像、商品回收、经营护栏和可复制口径，主推商品的 AI 成本占比、贡献毛利和 CAC 上限可复核。
- `/admin/health` 上线证据缺口无 blocking，补证清单中的小额订单、平台申请回执、单位经济成本样本、后台记录、后台归档和主链路截图/录屏验收凭证均已闭合。
- `/api/admin/launch/evidence-action-center` 返回无 blocking，按证据类型分组的负责人、目标、优先项和可复制行动口径均能对应到后台证据或第三方平台证据。
- `npm run launch:evidence-check -- --base-url=<APP_URL>` 通过，能复核 `/api/admin/launch/evidence-action-center`、`/api/admin/launch/evidence-gap`、`/api/admin/launch/evidence`、上线证据归档 POST、上线证据行动中心、上线证据缺口和上线证据归档后台区块。
- `/api/admin/launch/decision` 返回 `release_ready` 且 `productionGate.releaseReady=true` 才能公开放量；返回 `no_go` 或生产总门禁未 ready 时必须继续关闭真实收费入口。
- `/api/admin/launch/blocker-dashboard` 返回无 blocking，`productionGate.releaseReady`、`production_gate` 工作线、工作线状态与生产上线总门禁、域名部署、合规主体、生产数据库、AI 图片、真实支付、上线证据和目标规划细分接口一致。
- `/api/admin/launch/daily-brief` 返回今日目标推进日报，生产总门禁、线下办理当前动作、阶段推进门槛 `transitionGate.canAdvance`、今日先办动作、执行状态、目标快照、证据状态、关键阻断数字和可复制日报文本能直接对应 `/admin/health` 展示；线下办理未闭合时 `todayActions` 包含 `offline_action`，阶段门槛未放行时 `todayActions` 包含 `goal_transition`，`PATCH` 保存今日动作状态、负责人、证据备注和推进备注后会写入后台审计。
- `launch:daily-brief-check -- --base-url=...` 能确认日报 GET/PATCH、今日动作执行留痕、条件动作来源、后台日报区块和文档口径完整；该命令输出需归档为每天开工前的执行证据。
- `/api/admin/launch/goal-followup` 返回目标后续推进复盘，当前阶段、阶段推进门槛、`transitionGate.canAdvance`、线下办理当前动作、今日动作留痕、本周承诺分布、证据行动中心、补证覆盖率、复盘检查项、后续优先补齐项、结构化补齐入口和可复制复盘口径能直接对应 `/admin/health` 展示；补齐入口需包含 sectionId、API method/path、payloadHint、payloadTemplate、curlCommand、UsageLog 持久化 feature/event/model 和证据来源，并能通过 `npm run launch:goal-followup-check` 复验。
- `/api/admin/launch/goal-plan` 返回的当前阶段目标、指标、阶段推进门槛、`transitionGate.canAdvance`、下一阶段入口、下一步、验收证据和已保存推进记录能直接对应 `/admin/health` 展示；`PATCH` 保存目标日、负责人、推进状态和证据备注后会写入后台审计，并且 0-14 天阶段无 blocking 且阶段推进门槛通过后才能继续推进小额真实订单。
- `launch:goal-plan-check -- --base-url=...` 能确认目标规划 GET/PATCH、阶段推进留痕、四阶段目标、阶段门槛、后台目标规划区块和文档口径完整；该命令输出需归档为阶段推进会和上线交接前的执行证据。
- `/api/payments/live/orders` 在 `no_go` 或 `internal_gray` 时返回 `LIVE_PAYMENT_NOT_RELEASED`；在 `paid_smoke` 时只允许 `LIVE_PAYMENT_SMOKE_TEST_USER_IDS` 或 `LIVE_PAYMENT_SMOKE_TEST_EMAILS` 命中的内部账号真实预下单；在 `release_ready` 时才允许所有登录用户真实预下单。
- `/api/admin/launch/evidence` 最近归档中的变量核对摘要无 blocking，部署验收证据、数据库验收证据、AI/图片验收证据、单位经济成本样本、今日动作执行记录和目标推进摘要与当前状态一致。
- 真实支付回调能验签并发放权益。
- 手相图片能通过七牛公开 URL 被视觉模型读取。
- OpenAI、七牛、支付宝和微信支付诊断无阻断项。
- AI 与图片能力落地计划无 blocking，`npm run launch:ai-storage-check`、`launch:ai-storage-check -- --base-url=...` 的 AI/图片计划 API 运行时验收、OpenAI 模型读取、成本费率、七牛上传链路、手相视觉报告、深度报告和成本样本都有后台 AI/图片验收证据和可追溯外部凭证。
- `/admin/health` 无生产阻断项。
- `/api/admin/launch/readiness` 返回无 blocking 的上线判断。
- `/api/admin/launch/runbook` 返回无 blocking 的操作步骤，且每个外部事项都有验收证据。
- `/api/admin/launch/evidence` 至少保留一条最终状态归档记录。

## 优先级判断

第一优先级：

```text
登录 + 会员星力 + mock payment
```

第二优先级：

```text
AI 对话 + 塔罗三牌阵
```

第三优先级：

```text
八字五行 + 报告中心
```

第四优先级：

```text
七牛手相上传 + 真实支付适配
```

当前开工优先级：

```text
正式数据库迁移 + 真实转化复盘 + 真实 AI/支付联调
```

## 不做的事

第一版暂不做：

- App
- 小程序
- 真人咨询
- 复杂紫微斗数
- 社区
- 原生多语言完整翻译
- 无限聊天套餐
