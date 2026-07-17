import "server-only";

import { createHash } from "crypto";
import { tarotDeck } from "@/lib/tarot-deck";
import {
  promptContractVersions,
  type ReadingEvidenceItem,
  type ReadingEvidencePackage,
  type ReadingMethod,
  type ReadingSubjectContract,
  type FortuneAnswer,
} from "@/lib/prompts/contracts";

type ToolLike = {
  name: string;
  label: string;
  status: "completed" | "needs_input" | "preview";
  result: unknown;
};

const ganZhiPattern = /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function compact(value: string, maxLength = 220) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
}

function uniqueTexts(values: unknown[]) {
  return Array.from(
    new Set(values.map(asText).map((value) => value.trim()).filter(Boolean)),
  );
}

function digest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
}

function addItem(items: ReadingEvidenceItem[], item: Omit<ReadingEvidenceItem, "allowedTerms"> & {
  allowedTerms?: unknown[];
}) {
  items.push({
    ...item,
    allowedTerms: uniqueTexts([
      item.evidenceId,
      item.label,
      item.summary,
      ...(item.allowedTerms ?? []),
    ]),
  });
}

function findTool(toolCalls: ToolLike[], names: string[]) {
  return toolCalls.find((tool) => names.includes(tool.name) && tool.status === "completed");
}

function buildContextEvidence(input: {
  method: ReadingMethod;
  subject: ReadingSubjectContract;
  currentQuestion?: string;
}) {
  const items: ReadingEvidenceItem[] = [];

  addItem(items, {
    evidenceId: "context.subject",
    method: input.method,
    kind: "subject_boundary",
    label: "问事对象边界",
    summary:
      input.subject.memberProfileRole === "subject"
        ? `本轮对象为${input.subject.label}，会员档案属于被分析对象。`
        : input.subject.memberProfileRole === "questioner"
          ? `本轮对象为${input.subject.label}，会员档案只属于提问者。`
          : `本轮对象为${input.subject.label}，账号本人档案已排除。`,
    data: input.subject,
    allowedTerms: [input.subject.kind, input.subject.label, input.subject.memberProfileRole],
  });

  if (input.currentQuestion) {
    addItem(items, {
      evidenceId: "context.question",
      method: input.method,
      kind: "context",
      label: "本轮问题摘要",
      summary: compact(input.currentQuestion, 160),
      data: { questionDigest: digest(input.currentQuestion) },
      allowedTerms: [],
      sensitive: true,
    });
  }

  return items;
}

function buildTarotEvidence(tool: ToolLike, items: ReadingEvidenceItem[]) {
  const result = isRecord(tool.result) ? tool.result : {};
  const cards = Array.isArray(result.cards) ? result.cards : [];

  addItem(items, {
    evidenceId: "tarot.spread",
    method: "tarot",
    kind: "tarot_spread",
    label: asText(result.spreadTitle) || tool.label,
    summary: asText(result.spreadSubtitle) || "塔罗牌阵已生成。",
    data: {
      spread: result.spread,
      spreadTitle: result.spreadTitle,
      cardCount: cards.length,
    },
    allowedTerms: [result.spread, result.spreadTitle, result.spreadSubtitle],
  });

  cards.slice(0, 10).forEach((card, index) => {
    if (!isRecord(card)) {
      return;
    }

    addItem(items, {
      evidenceId: `tarot.card.${index + 1}`,
      method: "tarot",
      kind: "tarot_card",
      label: `${asText(card.position) || `第 ${index + 1} 张`} · ${asText(card.card)}`,
      summary: `${asText(card.card)}${asText(card.orientation)}：${compact(asText(card.contextMeaning) || asText(card.meaning), 180)}`,
      data: card,
      allowedTerms: [
        card.position,
        card.card,
        card.orientation,
        card.meaning,
        card.contextMeaning,
        card.advice,
        ...(Array.isArray(card.keywords) ? card.keywords : []),
      ],
    });
  });
}

function hexagramTerms(hexagram: Record<string, unknown>) {
  const number = asText(hexagram.number);
  return [
    number,
    number ? `第${number}卦` : "",
    number ? `第 ${number} 卦` : "",
    hexagram.name,
    hexagram.nature,
    hexagram.judgment,
    hexagram.advice,
    hexagram.topicAdvice,
    hexagram.relation,
    hexagram.relationAdvice,
  ];
}

function buildBaguaEvidence(tool: ToolLike, items: ReadingEvidenceItem[]) {
  const result = isRecord(tool.result) ? tool.result : {};
  const chart = isRecord(result.chart) ? result.chart : {};
  const stages = [
    ["bagua.main", "本卦", chart.mainHexagram],
    ["bagua.changed", "变卦", chart.changedHexagram],
    ["bagua.mutual", "互卦", chart.mutualHexagram],
    ["bagua.opposite", "错卦", chart.oppositeHexagram],
    ["bagua.reversed", "综卦", chart.reversedHexagram],
  ] as const;

  stages.forEach(([evidenceId, label, value]) => {
    if (!isRecord(value)) {
      return;
    }

    addItem(items, {
      evidenceId,
      method: "bagua",
      kind: "bagua_hexagram",
      label: `${label} · 第${asText(value.number) || "?"}卦 ${asText(value.name) || "未明"}`,
      summary: compact(`${asText(value.nature)} ${asText(value.judgment)} ${asText(value.relationAdvice)}`, 220),
      data: value,
      allowedTerms: hexagramTerms(value),
    });
  });

  const moving = isRecord(chart.moving) ? chart.moving : null;
  if (moving) {
    addItem(items, {
      evidenceId: "bagua.moving",
      method: "bagua",
      kind: "bagua_moving_line",
      label: `动爻 · ${asText(moving.position) || asText(chart.movingLine)}`,
      summary: compact(`${asText(moving.text)} ${asText(moving.advice)}`, 220),
      data: {
        movingLine: chart.movingLine,
        moving,
      },
      allowedTerms: [
        chart.movingLine,
        moving.position,
        moving.stage,
        moving.yinYang,
        moving.text,
        moving.advice,
      ],
    });
  }
}

function buildBaziEvidenceFromChart(chart: Record<string, unknown>, items: ReadingEvidenceItem[]) {
  const bazi = Array.isArray(chart.bazi) ? chart.bazi.map(String).slice(0, 4) : [];
  const pillars = Array.isArray(chart.pillars) ? chart.pillars : [];
  const weightedCounts = isRecord(chart.weightedCounts) ? chart.weightedCounts : isRecord(chart.counts) ? chart.counts : {};
  const dayMaster = isRecord(chart.dayMaster) ? chart.dayMaster : {};
  const luck = isRecord(chart.luck) ? chart.luck : {};
  const currentDaYun = isRecord(luck.currentDaYun) ? luck.currentDaYun : {};

  if (bazi.length > 0 || pillars.length > 0) {
    addItem(items, {
      evidenceId: "bazi.pillars",
      method: "bazi",
      kind: "bazi_pillars",
      label: "四柱",
      summary: bazi.length > 0 ? `四柱：${bazi.join("、")}` : "四柱已排盘。",
      data: { bazi, pillars },
      allowedTerms: [
        ...bazi,
        ...pillars.flatMap((pillar) =>
          isRecord(pillar)
            ? [
                pillar.label,
                pillar.ganzhi,
                pillar.heavenlyStem,
                pillar.earthlyBranch,
                pillar.stemElement,
                pillar.branchElement,
                pillar.stemTenGod,
              ]
            : [],
        ),
      ],
    });
  }

  addItem(items, {
    evidenceId: "bazi.wuxing",
    method: "bazi",
    kind: "bazi_wuxing",
    label: "五行分布",
    summary: ["木", "火", "土", "金", "水"]
      .map((element) => `${element}:${asText(weightedCounts[element]) || "0"}`)
      .join(" / "),
    data: {
      counts: chart.counts,
      weightedCounts: chart.weightedCounts,
      strongest: chart.strongest,
      weakest: chart.weakest,
    },
    allowedTerms: [
      "木",
      "火",
      "土",
      "金",
      "水",
      chart.strongest,
      ...(Array.isArray(chart.weakest) ? chart.weakest : []),
      ...Object.entries(weightedCounts).flatMap(([key, value]) => [`${key}:${value}`, `${key}：${value}`]),
    ],
  });

  addItem(items, {
    evidenceId: "bazi.dayMaster",
    method: "bazi",
    kind: "bazi_day_master",
    label: `日主 · ${asText(dayMaster.stem)}${asText(dayMaster.element)}`,
    summary: compact(`${asText(dayMaster.strengthLabel)} ${asText(dayMaster.explanation)}`, 220),
    data: dayMaster,
    allowedTerms: [
      dayMaster.stem,
      dayMaster.element,
      dayMaster.yinYang,
      dayMaster.strengthLabel,
      ...(Array.isArray(dayMaster.usefulElements) ? dayMaster.usefulElements : []),
      ...(Array.isArray(dayMaster.avoidElements) ? dayMaster.avoidElements : []),
    ],
  });

  if (Object.keys(currentDaYun).length > 0) {
    addItem(items, {
      evidenceId: "bazi.luck",
      method: "bazi",
      kind: "bazi_luck",
      label: `大运 · ${asText(currentDaYun.ganZhi) || "当前大运"}`,
      summary: compact(asText(currentDaYun.advice) || "大运节奏已生成。", 220),
      data: {
        start: luck.start,
        currentDaYun,
        annual: Array.isArray(luck.annual) ? luck.annual.slice(0, 6) : [],
      },
      allowedTerms: [
        currentDaYun.ganZhi,
        currentDaYun.tenGod,
        currentDaYun.gan,
        currentDaYun.zhi,
        currentDaYun.advice,
        ...(Array.isArray(luck.annual)
          ? luck.annual.flatMap((item) =>
              isRecord(item) ? [item.year, item.ganZhi, item.tenGod, item.advice] : [],
            )
          : []),
      ],
    });
  }
}

function buildBaziEvidence(tool: ToolLike, items: ReadingEvidenceItem[]) {
  const result = isRecord(tool.result) ? tool.result : {};
  const chart = isRecord(result.chart) ? result.chart : {};
  buildBaziEvidenceFromChart(chart, items);
}

function buildPalmEvidence(tool: ToolLike, items: ReadingEvidenceItem[]) {
  const result = isRecord(tool.result) ? tool.result : {};

  addItem(items, {
    evidenceId: "palm.image",
    method: "palm",
    kind: "palm_image",
    label: "手相图片",
    summary: compact(asText(result.state) || "手相图片状态已记录。", 160),
    data: {
      state: result.state,
      imageId: result.imageId,
      contentType: result.contentType,
      sizeBytes: result.sizeBytes,
      nextAction: result.nextAction,
    },
    allowedTerms: [result.state, result.imageId, result.contentType, result.nextAction],
    sensitive: true,
  });
}

function packageEvidence(input: {
  method: ReadingMethod;
  subject: ReadingSubjectContract;
  items: ReadingEvidenceItem[];
}) {
  const allowedEvidenceIds = input.items.map((item) => item.evidenceId);
  const digestSource = input.items.map((item) => ({
    evidenceId: item.evidenceId,
    method: item.method,
    kind: item.kind,
    label: item.label,
    summary: item.summary,
    allowedTerms: item.allowedTerms,
  }));

  return {
    evidencePackageId: `evidence_${digest({ method: input.method, subject: input.subject, digestSource })}`,
    toolSchemaVersion: promptContractVersions.toolSchemaVersion,
    method: input.method,
    subject: input.subject,
    items: input.items,
    allowedEvidenceIds,
    factDigest: digest(digestSource),
  } satisfies ReadingEvidencePackage;
}

export function buildReadingEvidencePackage(input: {
  method: ReadingMethod;
  subject: ReadingSubjectContract;
  toolCalls: ToolLike[];
  currentQuestion?: string;
}) {
  const items = buildContextEvidence(input);
  const tarot = findTool(input.toolCalls, ["tarot_spread_generator"]);
  const bagua = findTool(input.toolCalls, ["bagua_generator"]);
  const bazi = findTool(input.toolCalls, ["bazi_calculator"]);
  const palm = findTool(input.toolCalls, ["palm_image_checker"]);

  if (tarot) buildTarotEvidence(tarot, items);
  if (bagua) buildBaguaEvidence(bagua, items);
  if (bazi) buildBaziEvidence(bazi, items);
  if (palm) buildPalmEvidence(palm, items);

  return packageEvidence({ method: input.method, subject: input.subject, items });
}

export function buildSafetyEvidencePackage(input: {
  subject: ReadingSubjectContract;
  currentQuestion?: string;
}) {
  const items = buildContextEvidence({
    method: "general",
    subject: input.subject,
    currentQuestion: input.currentQuestion,
  });

  addItem(items, {
    evidenceId: "safety.assessment",
    method: "general",
    kind: "context",
    label: "高风险识别",
    summary: "本轮命中安全或专业边界，不能进入命理推演。",
    data: { risk: "blocked" },
    allowedTerms: ["高风险", "安全优先", "专业边界"],
  });

  return packageEvidence({ method: "general", subject: input.subject, items });
}

export function buildDeepReportEvidencePackage(input: {
  subject: ReadingSubjectContract;
  profile: unknown;
  localDraft: { toolResults?: unknown; content?: string };
}) {
  const items = buildContextEvidence({
    method: "bazi",
    subject: input.subject,
  });
  const profile = isRecord(input.profile) ? input.profile : {};
  const toolResults = isRecord(input.localDraft.toolResults) ? input.localDraft.toolResults : {};
  const chart =
    isRecord(profile.baziChart) ? profile.baziChart :
    isRecord(toolResults.bazi) ? toolResults.bazi :
    {};
  const wuxing = isRecord(profile.wuxingProfile) ? profile.wuxingProfile : isRecord(toolResults.wuxing) ? toolResults.wuxing : {};

  if (Object.keys(chart).length > 0) {
    buildBaziEvidenceFromChart({ ...chart, ...(Object.keys(wuxing).length > 0 ? { wuxingProfile: wuxing } : {}) }, items);
  }

  addItem(items, {
    evidenceId: "report.localDraft",
    method: "bazi",
    kind: "context",
    label: "本地报告草稿",
    summary: compact(input.localDraft.content ?? "本地报告草稿已生成。", 220),
    data: { draftDigest: digest(input.localDraft.content ?? "") },
    allowedTerms: [],
    sensitive: true,
  });

  return packageEvidence({ method: "bazi", subject: input.subject, items });
}

function answerText(answer: FortuneAnswer) {
  return JSON.stringify(answer);
}

function validateEvidenceIds(answer: FortuneAnswer, evidence: ReadingEvidencePackage) {
  const errors: string[] = [];
  const allowed = new Set(evidence.allowedEvidenceIds);

  for (const evidenceId of answer.evidenceRefs) {
    if (!allowed.has(evidenceId)) {
      errors.push(`Unknown evidenceRef: ${evidenceId}`);
    }
  }

  for (const interpretation of answer.interpretations) {
    if (!allowed.has(interpretation.evidenceId)) {
      errors.push(`Unknown interpretation evidenceId: ${interpretation.evidenceId}`);
    }
    if (!answer.evidenceRefs.includes(interpretation.evidenceId)) {
      errors.push(`Interpretation evidenceId missing from evidenceRefs: ${interpretation.evidenceId}`);
    }
  }

  if (answer.status !== "blocked" && answer.status !== "needs_input" && answer.evidenceRefs.length === 0) {
    errors.push("Non-blocked answer must include at least one evidenceRef.");
  }

  return errors;
}

function validateTarotFacts(text: string, evidence: ReadingEvidencePackage) {
  const errors: string[] = [];
  const allowedTerms = new Set(evidence.items.flatMap((item) => item.allowedTerms));
  const mentionedCardNames = tarotDeck
    .map((card) => card.name)
    .filter((name) =>
      text.includes(`「${name}」`) ||
      text.includes(`『${name}』`) ||
      text.includes(`${name}正位`) ||
      text.includes(`${name}逆位`) ||
      text.includes(`${name}牌`),
    );

  for (const name of mentionedCardNames) {
    if (!allowedTerms.has(name)) {
      errors.push(`Tarot card not present in evidence: ${name}`);
    }
  }

  return errors;
}

function validateBaguaFacts(text: string, evidence: ReadingEvidencePackage) {
  const errors: string[] = [];
  const allowedTerms = new Set(evidence.items.flatMap((item) => item.allowedTerms));
  const matches = [...text.matchAll(/第\s*(\d{1,2})\s*卦/g)].map((match) => match[1]);

  for (const number of matches) {
    if (!allowedTerms.has(`第${number}卦`) && !allowedTerms.has(`第 ${number} 卦`)) {
      errors.push(`Hexagram number not present in evidence: 第${number}卦`);
    }
  }

  const allowedNames = new Set(
    evidence.items.flatMap((item) => {
      const data = isRecord(item.data) ? item.data : {};
      return item.kind === "bagua_hexagram" && typeof data.name === "string" ? [data.name] : [];
    }),
  );
  const namedMatches = [...text.matchAll(/(?:本卦|变卦|互卦|错卦|综卦)(?:为|是|：)\s*[「『]?([\u4e00-\u9fa5]{1,4})[」』]?(?:卦)?(?=[，。；\s]|$)/g)]
    .map((match) => match[1])
    .filter((name) => name !== "第");

  for (const name of namedMatches) {
    if (!allowedNames.has(name)) {
      errors.push(`Hexagram name not present in evidence: ${name}`);
    }
  }

  return errors;
}

function validateBaziFacts(text: string, evidence: ReadingEvidencePackage) {
  const errors: string[] = [];
  const allowedTerms = new Set(evidence.items.flatMap((item) => item.allowedTerms));
  const matches = Array.from(new Set(text.match(ganZhiPattern) ?? []));

  for (const ganZhi of matches) {
    if (!allowedTerms.has(ganZhi)) {
      errors.push(`GanZhi not present in evidence: ${ganZhi}`);
    }
  }

  const countMatches = [...text.matchAll(/([木火土金水])[：:]\s*(\d+(?:\.\d+)?)/g)];
  for (const match of countMatches) {
    const compactCount = `${match[1]}:${match[2]}`;
    const fullWidthCount = `${match[1]}：${match[2]}`;
    if (!allowedTerms.has(compactCount) && !allowedTerms.has(fullWidthCount)) {
      errors.push(`Wuxing count not present in evidence: ${compactCount}`);
    }
  }

  const dayMasterMatches = [...text.matchAll(/日主(?:为|是|：)?\s*[「『]?([甲乙丙丁戊己庚辛壬癸])[」』]?/g)];
  for (const match of dayMasterMatches) {
    if (!allowedTerms.has(match[1])) {
      errors.push(`Day master not present in evidence: ${match[1]}`);
    }
  }

  return errors;
}

export function validateFortuneAnswerAgainstEvidence(
  answer: FortuneAnswer,
  evidence: ReadingEvidencePackage,
) {
  const text = answerText(answer);
  const errors = [
    ...validateEvidenceIds(answer, evidence),
    ...validateGeneratedTextAgainstEvidence(text, evidence),
  ];

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function validateGeneratedTextAgainstEvidence(
  text: string,
  evidence: ReadingEvidencePackage,
) {
  return [
    ...(evidence.method === "tarot" ? validateTarotFacts(text, evidence) : []),
    ...(evidence.method === "bagua" ? validateBaguaFacts(text, evidence) : []),
    ...(evidence.method === "bazi" ? validateBaziFacts(text, evidence) : []),
  ];
}

export function serializeEvidenceForPrompt(evidence: ReadingEvidencePackage) {
  return {
    evidencePackageId: evidence.evidencePackageId,
    toolSchemaVersion: evidence.toolSchemaVersion,
    method: evidence.method,
    subject: evidence.subject,
    allowedEvidenceIds: evidence.allowedEvidenceIds,
    items: evidence.items.map((item) => ({
      evidenceId: item.evidenceId,
      method: item.method,
      kind: item.kind,
      label: item.label,
      summary: item.summary,
      data: item.data,
      allowedTerms: item.allowedTerms,
    })),
  };
}

export function findReadingEvidenceItem(evidence: ReadingEvidencePackage, evidenceId: string) {
  return evidence.items.find((item) => item.evidenceId === evidenceId) ?? null;
}
