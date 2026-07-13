export const legalVersion = "2026-07-06";

export type LegalSection = {
  title: string;
  body: string[];
};

export type LegalDocument = {
  slug: string;
  title: string;
  summary: string;
  sections: LegalSection[];
};

type Env = Record<string, string | undefined>;

function cleanEnvValue(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();

  if (
    normalized.startsWith("<") ||
    normalized.includes("<") ||
    normalized.includes(">") ||
    normalized.includes("your-") ||
    normalized.includes("example.") ||
    normalized.includes("todo") ||
    normalized.includes("replace")
  ) {
    return undefined;
  }

  return trimmed;
}

export function getLegalEntity(env: Env = process.env) {
  const companyName = cleanEnvValue(env.COMPANY_NAME);
  const icpRecordNo = cleanEnvValue(env.ICP_RECORD_NO);

  return {
    companyName,
    icpRecordNo,
    hasCompanyName: Boolean(companyName),
    hasIcpRecordNo: Boolean(icpRecordNo),
  };
}

export const legalDocuments = [
  {
    slug: "terms",
    title: "用户协议",
    summary: "约定玄机 AI 的账号、会员、星力、报告、支付和服务边界。",
    sections: [
      {
        title: "服务内容",
        body: [
          "玄机 AI 提供 AI 命理对话、塔罗、八字五行、八卦问事、手相上传、报告中心和会员权益等在线服务。",
          "第一版包含开发期 mock payment；支付宝、微信支付等真实支付能力会在商户资质完成后逐步开启。",
        ],
      },
      {
        title: "账号与安全",
        body: [
          "用户应使用本人可访问的邮箱或后续开放的第三方登录方式注册和登录。",
          "用户应妥善保管验证码、账号和登录设备。因用户主动泄露账号信息造成的损失，由用户自行承担。",
        ],
      },
      {
        title: "会员与星力",
        body: [
          "会员套餐、星力额度、有效期和可用功能以购买页面展示为准。",
          "星力用于抵扣 AI 对话、塔罗、八字、八卦、手相和报告生成等功能消耗。",
          "开发期 mock payment 不产生真实扣款；正式支付上线后，将以第三方支付渠道返回的结果作为订单状态依据。",
        ],
      },
      {
        title: "支付、退款与客服",
        body: [
          "正式支付上线后，会员、星力和已生成报告属于在线数字内容或虚拟权益；除法律法规、支付平台规则或页面另有承诺外，支付成功并发放或消耗后通常不支持无理由退款。",
          "如发生重复扣款、权益未到账、技术故障、异常订单或未使用权益争议，用户可通过页面公布的客服入口联系我们核查。",
          "经核查属于平台原因的异常订单，我们可按实际情况进行权益补发、订单更正、退款或其他合理处理。",
        ],
      },
      {
        title: "内容边界",
        body: [
          "命理、塔罗、手相和八卦内容仅供娱乐、文化参考和自我探索，不构成医疗、心理诊断、投资、法律、婚姻、就业或其他重大人生决策建议。",
          "用户不得使用本服务生成违法、侵权、骚扰、歧视、欺诈或伤害他人的内容。",
        ],
      },
      {
        title: "变更与终止",
        body: [
          "我们可能根据产品迭代、法律法规或运营需要调整服务内容、权益规则和协议条款。",
          "如用户严重违反本协议，我们有权限制或终止相关服务。",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    title: "隐私政策",
    summary: "说明我们如何收集、使用、保存和保护你的个人信息。",
    sections: [
      {
        title: "我们收集的信息",
        body: [
          "账号信息：邮箱、登录状态、会员档位和星力余额。",
          "命理信息：用户主动填写的出生日期、出生时间、出生地、问题内容、塔罗/八字/八卦/手相报告。",
          "图片信息：用户主动上传的手掌图片、文件名、文件大小、内容类型、存储 key 和访问 URL。",
          "交易与日志信息：订单、支付状态、钱包流水、AI 调用模型、token 用量和基础设备请求日志。",
        ],
      },
      {
        title: "使用目的",
        body: [
          "用于创建账号、验证登录、发放会员权益、扣减星力、生成命理报告和保存历史记录。",
          "用于保障服务安全、排查故障、统计成本、优化功能体验和满足法律法规要求。",
          "我们会尽量遵循最少必要原则，不主动收集与上述目的无关的信息。",
        ],
      },
      {
        title: "第三方服务",
        body: [
          "支付服务可能由支付宝、微信支付等第三方提供。",
          "图片存储可能使用七牛云等对象存储服务。",
          "AI 能力可能调用 OpenAI 等模型服务。我们会根据实际上线地区和供应商要求配置数据处理方式。",
        ],
      },
      {
        title: "保存与删除",
        body: [
          "用户可在产品功能中删除已上传图片档案。报告、订单和钱包流水会根据业务、对账和合规需要保留必要时间。",
          "如需访问、更正或删除个人信息，可通过后续公布的客服或邮箱渠道联系我们处理。",
        ],
      },
      {
        title: "安全措施",
        body: [
          "我们会使用访问控制、签名 cookie、服务端校验、对象存储 key 管理等方式保护数据。",
          "任何互联网服务都无法保证绝对安全。我们会在发现安全事件后按法律法规要求采取处置措施。",
        ],
      },
    ],
  },
  {
    slug: "disclaimer",
    title: "免责声明",
    summary: "明确命理内容的娱乐和文化参考属性，避免用户把结果当成确定性决策依据。",
    sections: [
      {
        title: "非专业建议",
        body: [
          "本服务输出的 AI 对话、塔罗、八字、八卦、手相和报告，仅供娱乐、文化参考和自我探索。",
          "本服务不提供医疗诊断、心理治疗、投资理财、法律意见、职业决策、婚姻决策或其他专业建议。",
        ],
      },
      {
        title: "结果不保证",
        body: [
          "AI 和命理工具输出可能受到输入信息、模型能力、算法规则和解释方式影响。",
          "我们不保证任何预测、分析或建议一定准确、完整、适用于你的具体情况或产生特定结果。",
        ],
      },
      {
        title: "用户责任",
        body: [
          "用户应独立判断服务内容，不应仅依据本服务做出重大人生、财务、健康或法律决定。",
          "如遇健康、心理危机、法律纠纷、投资损失等问题，请及时咨询具备资质的专业人士。",
        ],
      },
      {
        title: "图片与 AI 限制",
        body: [
          "手相图片分析会优先使用视觉模型；在未配置模型、图片不可访问或调用失败时会使用本地降级逻辑，分析仍可能出现识别偏差。",
          "请勿上传他人手掌图片、敏感证件、未成年人图片或你无权处理的图片。",
        ],
      },
    ],
  },
  {
    slug: "upload-consent",
    title: "图片上传授权",
    summary: "说明用户上传手掌图片时授予的存储、分析、报告生成和删除授权。",
    sections: [
      {
        title: "授权范围",
        body: [
          "当你上传手掌图片时，即表示你确认该图片由你本人提供，或你已获得合法授权。",
          "你授权玄机 AI 对图片进行存储、读取、格式校验、AI 分析和报告生成。",
        ],
      },
      {
        title: "存储与处理",
        body: [
          "图片可能存储在七牛云等对象存储服务中，并保存 qiniuKey、URL、内容类型、文件大小和上传时间等 metadata。",
          "图片可能被发送给视觉模型或 AI 服务用于完成手相分析。我们会按产品配置控制使用范围。",
        ],
      },
      {
        title: "禁止上传",
        body: [
          "请勿上传他人图片、未成年人图片、身份证件、银行卡、病历、裸露内容或任何你无权处理的图片。",
          "如上传内容涉嫌违法、侵权或违反平台规则，我们有权拒绝分析、删除记录或限制账号功能。",
        ],
      },
      {
        title: "删除与保留",
        body: [
          "你可以在产品中删除图片档案。删除后，图片将不再用于新的分析。",
          "为满足安全审计、订单对账或法律义务，系统可能保留必要的操作记录和报告摘要。",
        ],
      },
    ],
  },
] satisfies LegalDocument[];

export function getLegalDocument(slug: string) {
  return legalDocuments.find((document) => document.slug === slug);
}
