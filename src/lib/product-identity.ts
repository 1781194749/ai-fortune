export const PRODUCT_IDENTITY_ANSWER =
  "我是玄机 AI，是这里的智能问事与分析助手。你可以直接告诉我想咨询的问题。";

export const CUSTOMER_ANSWER_BLOCKED =
  "这次回答包含了不应展示的内部信息，已停止展示。请重新发送当前问题，我会直接给出清晰结论、依据和下一步。";

const productIdentityQuestionPatterns = [
  /^(?:请问)?你(?:到底)?(?:是|叫)(?:谁|什么)(?:模型|ai|助手)?[?？。!！]*$/i,
  /(?:你|玄机ai).{0,12}(?:是|属于|用|使用|跑)(?:的)?(?:哪个|什么|哪种)?(?:模型|大模型|版本|底座|底层)/i,
  /(?:你|玄机ai).{0,12}(?:模型|大模型|版本|底座|底层)(?:是|叫|为)?(?:哪个|什么|哪种|多少)/i,
  /(?:你|玄机ai)(?:到底)?(?:是|是不是|属于).{0,12}(?:模型|ai|助手|openai|chatgpt|gpt|claude|gemini|deepseek|anthropic)/i,
  /(?:你|玄机ai).{0,12}(?:用的|使用|基于|接入|调用|底层|背后).{0,12}(?:什么|哪个|哪种|哪家)?(?:模型|大模型|ai)/i,
  /(?:你|玄机ai).{0,12}(?:用的是|跑的是|底层是|底座是).{0,16}(?:gpt|模型|大模型|ai|claude|gemini|deepseek)/i,
  /(?:你|玄机ai).{0,12}(?:现在)?(?:跑|用|使用).{0,8}(?:哪个|什么)版本/i,
  /(?:底层|底座).{0,4}(?:是|是不是).{0,16}(?:gpt|模型|大模型|ai|claude|gemini|deepseek)/i,
  /(?:what|which)model(?:areyou|doyouuse)/i,
  /(?:what|which)(?:ai|llm|version)(?:areyou|doyouuse|isthis)/i,
  /(?:areyou|isthis)(?:chatgpt|gpt|claude|gemini|deepseek|openai)/i,
  /(?:你|玄机ai).{0,8}(?:是|用|跑).{0,8}(?:[a-z]+-?\d[\w.-]*|\d+(?:\.\d+)+)/i,
  /(?:系统|开发者|内部|隐藏).{0,8}(?:提示词|指令|规则|消息)|(?:系统提示词|工具调用|工具结果|意图分类|路由规则|内部实现|模型供应商|模型名称|模型版本|思维链|推理过程)/i,
];
const productIdentityFollowUpPattern =
  /^(?:(?:那|那么|所以|不过|但是)?(?:你)?(?:具体|准确|实际)?(?:用的|使用的|是|跑的)?(?:哪个|什么|哪种)?(?:版本|型号|模型|底层|底座|供应商)(?:呢|啊|呀|吗)?)[？?。!！]*$/i;
const modelOrProviderToken =
  "(?:openai|chatgpt|gpt(?:-[a-z0-9._-]+)?|claude(?:-[a-z0-9._-]+)?|gemini(?:-[a-z0-9._-]+)?|deepseek(?:-[a-z0-9._-]+)?|anthropic|o\\d(?:-[a-z0-9._-]+)?)";
const customerModelDisclosurePattern = new RegExp(
  [
    `(?:我是|我(?:正在)?(?:使用|调用|基于)|玄机\\s*AI|本(?:系统|产品|助手|服务)|底层|底座|当前模型|模型供应商|服务供应商)[^。；！？\\n]{0,24}\\b${modelOrProviderToken}\\b`,
    `(?:报告|回答|内容)[^。；！？\\n]{0,12}(?:由|使用|基于)[^。；！？\\n]{0,8}\\b${modelOrProviderToken}\\b(?:[^。；！？\\n]{0,8}生成)?`,
    `\\b(?:provider|model|modelUsed)\\s*[:=]\\s*${modelOrProviderToken}\\b`,
    `\\b${modelOrProviderToken}\\b[^。；！？\\n]{0,16}(?:驱动本服务|为本服务提供|是本助手的模型)`,
  ].join("|"),
  "i",
);
const customerInternalToolPattern =
  /\b(?:intent_classifier|safety_risk_classifier|profile_reader|tarot_spread_generator|bazi_calculator|birth_info_checker|bagua_generator|palm_image_checker|xuanji_agent_answer(?:_recovery|_repair)?)\b/i;
const knownInternalCodeToken =
  "(?:(?:AGENT|MODEL|TOOL|PROVIDER|CHAT|TURN|FINAL|STRUCTURED|DATABASE|CLIENT|IDEMPOTENCY|IMAGE|SAFETY|OPENAI|QINIU|REDIS|LIVE_PAYMENT)_[A-Z0-9_]+)";
const genericStatusCodeToken = "(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,})";
const customerInternalCodePattern = new RegExp(
  [
    `\\b${knownInternalCodeToken}\\b`,
    `(?:错误码|内部(?:错误|状态|代码)|服务(?:错误|状态)|error(?:Code|[ _-]?code)?|ERROR_CODE)\\s*[:=：]?\\s*\\b${genericStatusCodeToken}\\b`,
  ].join("|"),
);
const customerInternalMetadataPattern =
  /\b(?:promptMetadata|qualityTrace|contextSummary|toolCalls?|toolResults?|usageLogId|tokensIn|tokensOut|modelUsed|answerShape|answerStatus|errorCode)\b/i;
const customerInternalCredentialPattern =
  /\b(?:OPENAI_[A-Z0-9_]+|DATABASE_URL|QINIU_[A-Z0-9_]+|REDIS_URL|AUTH_GOOGLE_ENABLED|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|LIVE_PAYMENT_[A-Z0-9_]+|ALIPAY_[A-Z0-9_]+|WECHAT_[A-Z0-9_]+)\b/;
const infrastructureToken =
  "(?:\\b(?:postgres(?:ql)?|prisma|redis|bullmq|qiniu)\\b|七牛云?)";
const productStackContext =
  "(?:本(?:系统|产品|服务|助手)|玄机\\s*AI|当前(?:系统|产品|服务)|我们的(?:系统|产品|服务|技术栈)|产品(?:后端|服务端|技术栈)|内部(?:系统|服务|技术栈))";
const customerInternalInfrastructurePattern = new RegExp(
  [
    `${productStackContext}[^。；！？\\n]{0,32}${infrastructureToken}`,
    `${infrastructureToken}[^。；！？\\n]{0,16}(?:驱动|支撑|用于)[^。；！？\\n]{0,12}${productStackContext}`,
    `\\bpostgres(?:ql)?\\b\\s*暂时不可用，无法(?:读取|保存|写入|更新)`,
  ].join("|"),
  "i",
);
const customerInternalPromptPattern =
  /(?:系统|开发者|内部|隐藏).{0,8}(?:提示词|指令|规则|消息)|(?:system|developer)\s+(?:prompt|message)|chain[ -]?of[ -]?thought|思维链|推理过程/i;
const customerInternalUsageIdPattern =
  /\b(?:chat_usage|usage_log|prompt_run|trace_log|usage)_[a-z0-9][a-z0-9_-]{7,}\b/i;

const customerAnswerBoundaryPatterns = [
  ["model_or_provider", customerModelDisclosurePattern],
  ["internal_tool", customerInternalToolPattern],
  ["internal_code", customerInternalCodePattern],
  ["internal_metadata", customerInternalMetadataPattern],
  ["credential_or_env", customerInternalCredentialPattern],
  ["infrastructure", customerInternalInfrastructurePattern],
  ["prompt_or_reasoning", customerInternalPromptPattern],
  ["usage_or_trace_id", customerInternalUsageIdPattern],
] as const;

function asGlobalPattern(pattern: RegExp) {
  return new RegExp(pattern.source, Array.from(new Set(`${pattern.flags}g`)).join(""));
}

const customerDocumentReplacements: Array<[RegExp, string]> = [
  [asGlobalPattern(customerModelDisclosurePattern), "[服务实现已隐藏]"],
  [/\bintent_classifier\b/gi, "问题类型判断"],
  [/\bprofile_reader\b/gi, "档案核对"],
  [/\btarot_spread_generator\b/gi, "塔罗推演"],
  [/\bbazi_calculator\b/gi, "八字排盘"],
  [/\bbirth_info_checker\b/gi, "出生信息核对"],
  [/\bbagua_generator\b/gi, "八卦推演"],
  [/\bpalm_image_checker\b/gi, "手相图片检查"],
  [/\bsafety_risk_classifier\b/gi, "安全边界检查"],
  [/\bxuanji_agent_answer(?:_recovery|_repair)?\b/gi, "回答整理"],
  [asGlobalPattern(customerInternalToolPattern), "内部流程"],
  [asGlobalPattern(customerInternalCodePattern), "[服务状态已隐藏]"],
  [asGlobalPattern(customerInternalMetadataPattern), "内部信息"],
  [asGlobalPattern(customerInternalCredentialPattern), "[服务配置已隐藏]"],
  [asGlobalPattern(customerInternalInfrastructurePattern), "服务"],
  [asGlobalPattern(customerInternalPromptPattern), "[内部说明已隐藏]"],
  [asGlobalPattern(customerInternalUsageIdPattern), "[内部标识已隐藏]"],
];

export function getProductIdentityAnswer(question: string) {
  const normalized = question.trim().replace(/\s+/g, "");

  return productIdentityQuestionPatterns.some((pattern) => pattern.test(normalized))
    ? PRODUCT_IDENTITY_ANSWER
    : null;
}

export function getProductIdentityAnswerForConversation(
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
) {
  const directAnswer = getProductIdentityAnswer(question);

  if (directAnswer || !productIdentityFollowUpPattern.test(question.trim())) {
    return directAnswer;
  }

  const hasIdentityContext = history.slice(-4).some((message) =>
    message.role === "assistant"
      ? message.content.trim() === PRODUCT_IDENTITY_ANSWER
      : Boolean(getProductIdentityAnswer(message.content))
  );

  return hasIdentityContext ? PRODUCT_IDENTITY_ANSWER : null;
}

export function getCustomerAnswerBoundaryIssues(answer: string) {
  return customerAnswerBoundaryPatterns
    .filter(([, pattern]) => pattern.test(answer))
    .map(([issue]) => issue);
}

export function sanitizeCustomerDocument(text: string) {
  return customerDocumentReplacements.reduce(
    (sanitized, [pattern, replacement]) => sanitized.replace(pattern, replacement),
    text,
  );
}

export function sanitizeCustomerAnswer(
  answer: string,
  answerShape?: string | null,
  question?: string | null,
) {
  if (
    answerShape === "identity_boundary" ||
    Boolean(question && getProductIdentityAnswer(question))
  ) {
    return PRODUCT_IDENTITY_ANSWER;
  }

  return getCustomerAnswerBoundaryIssues(answer).length > 0
    ? CUSTOMER_ANSWER_BLOCKED
    : answer;
}
