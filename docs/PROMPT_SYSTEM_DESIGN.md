# 玄机 AI Prompt 运行与质量系统

## 目标

生产链路以“看得见推演过程的 AI 命理顾问”为定位。所有回答仅用于文化参考、自我探索和情绪陪伴，不承诺改命、复合、发财，不替代医疗、法律、投资、赌博、妊娠或重大人生决策中的专业判断。

## 架构

用户请求进入后按固定顺序处理：

1. 高风险与问事对象识别。
2. 场景、方法、服务档位路由。
3. 确定性命理工具生成结果。
4. 统一 `ReadingEvidencePackage` 证据包。
5. Prompt composer 编译身份、事实边界、对象策略、方法模块、场景模块、档位模板和输出契约。
6. 聊天使用 AI SDK `Output.object`，报告使用 Responses `responses.parse + zodTextFormat`，由模型接口严格约束结构化输出。
7. 程序做结构、事实引用、原始命理术语、安全、状态和服务档位校验。
8. 最多一次修复。
9. 仍失败则使用确定性安全降级。
10. 正文、结论卡、分享和持久化均来自同一个结构化结果。
11. UsageLog/报告 toolResults 记录 Prompt 版本、证据摘要、校验状态和成本。

## 数据契约

`src/lib/prompts/contracts.ts` 定义不可变契约：

- `ReadingEvidencePackage`：塔罗、八卦、八字、手相统一证据包。
- `FortuneAnswer`：`status`、`verdict`、`evidenceRefs`、`interpretations`、`uncertainty`、`actions`、`realityChecks`、`followUps`、`safetyNotice`。
- `DeepReportAnswer`：独立的执行摘要、至少四个报告章节、至少三个行动计划、不确定性和现实校验；不再复用聊天短答案。
- `PromptRunMetadata`：`promptReleaseId`、`templateVersion`、`policyVersion`、`outputSchemaVersion`、`routerVersion`、`toolSchemaVersion`、`contentDigest`、路由、证据摘要和校验状态。

模型只能引用证据包中的 `evidenceId`。校验器会拒绝未知 evidenceId，并拦截常见编造事实：未出现的塔罗牌名/正逆位、卦号/卦名、干支、五行数量和日主等。用户可见的证据标题与摘要由后端证据包渲染，模型只提供解释，不能重写原始命理事实。

输出安全校验会拒绝绝对承诺、投资/医疗/法律指令、跟踪纠缠、博彩预测和付费改命压力。输入侧先运行确定性领域规则；OpenAI 可用且 `OPENAI_MODERATION_ENABLED=true` 时，再补充 moderation 检查自伤、暴力威胁和未成年人风险。

## 路由策略

优先级：

1. 高风险规则优先，命中后不进入命理工具，不诱导付费。
2. 明确方法或页面入口。
3. 连续追问沿用同一对象与同一工具结果。
4. 普通咨询只做澄清和方法推荐。
5. 资料不足时追问。

普通感情问题不自动抽塔罗，普通 A/B 选择不自动起卦。`quick/formal/deep` 只控制交付深度，不改变事实和安全标准。

塔罗、八卦、八字和手相工具页进入 Chat 时携带 `method`，首轮请求把它记录为 `page_entry`。后续追问沿用已保存的工具结果；用户明确要求重抽、重排或另起时才生成新结果。

## 版本、灰度与回滚

代码定义的 Prompt release 在 `src/lib/prompts/registry.ts`：

- 稳定 release：`xuanji-prompt-2026-07-16-stable`。
- 候选 release：`xuanji-prompt-2026-07-16.2`。
- 内容摘要：由身份、策略、模块、模板和契约计算 SHA-256 digest。
- 灰度：`XUANJI_PROMPT_ROLLOUT_PERCENT=5|25|100`。候选 cohort 使用候选 Prompt，灰度外 cohort 实际使用稳定 Prompt。
- 快速回滚：`XUANJI_PROMPT_ROLLED_BACK=true`，所有流量实际切回稳定 Prompt，而不是只修改日志状态。

推荐灰度顺序：内部 → 5% → 25% → 100%。关键指标恶化时立即回滚。

## 隐私

UsageLog 不保存完整 Prompt、完整生日、关系长描述、手相图片细节或完整用户输入。质量日志只保存：

- Prompt 版本和 digest。
- evidencePackageId、factDigest、evidenceCount。
- validation summary。
- inputHash。
- toolNames、intent、answerShape、安全分类。

报告正文仍需要保存用户购买的报告内容；质量追踪只保存必要摘要和哈希。

## 评测矩阵

`npm run chat:quality-check` 会运行核心真实编排样本和 1000 条以上生成式确定性回归矩阵，当前覆盖：

- 普通 A/B 不自动起卦。
- 明确起卦。
- 塔罗连续追问沿用。
- 八字资料不足追问。
- 替他人问事隔离本人档案。
- 普通感情不自动塔罗。
- 模型身份边界。
- Prompt 注入。
- 自伤风险拦截且不可付费。
- 暴力、家暴、医疗、投资、博彩、跟踪、未成年人和妊娠边界。
- 律师职业、感情投入等高风险关键词误报。
- Prompt 稳定版、候选版、0%/100% 灰度和真实回滚。
- 编造塔罗牌、未知 evidenceId、危险承诺和付费压力。
- 付费报告章节 Schema 与完整本地降级。

默认评测为确定性离线检查，并明确返回 `gate=blocked_semantic_review`，不能据此宣称正式 Go。`npm run chat:quality-gate` 会强制真实模型生成和独立结构化语义评分；没有 API key、模型输出不是 OpenAI、语义评分不达标都会失败。

设置 `CHAT_QUALITY_REVIEW_OUTPUT=artifacts/prompt-human-review.jsonl` 可输出人审记录，字段包含问题、回答、证据引用、安全分类、评分规则、评审人、通过状态和备注。

## Go/No-Go 门槛

上线 Go 条件：

- 错用他人档案：0。
- 编造命理事实：0。
- 绝对承诺复合、发财、改命：0。
- 高风险确定性建议或诱导付费：0。
- 结构化输出成功率目标 >= 99.9%。
- 事实引用准确率目标 >= 99.5%。
- 人工质量通过率目标 >= 90%。

修改 Prompt、模型、路由或工具契约时必须跑 `npm run typecheck`、`npm run chat:quality-check` 和完整 `npm run build`。正式灰度前必须再跑 `npm run chat:quality-gate` 并归档人审结果。

## 当前剩余阻断

- `chat:quality-check` 只证明确定性与离线回归通过；真实模型语义评分必须通过 `chat:quality-gate`。
- 人工质量通过率需要运营/法务/内容侧复核。
- 医疗、法律、投资、妊娠等高风险文案需要法务确认。
- Prompt 灰度指标需要接入线上监控面板后执行 5%/25%/100% 发布。
