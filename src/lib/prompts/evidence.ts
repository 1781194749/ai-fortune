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
        ? `本轮对象为${input.subject.label}。`
        : input.subject.memberProfileRole === "questioner"
          ? `本轮对象为${input.subject.label}，只使用提问者和对方明确提供的信息。`
          : `本轮对象为${input.subject.label}，不使用其他人的个人资料。`,
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
  const primaryStages = [
    ["bagua.main", "本卦", chart.mainHexagram],
    ["bagua.changed", "变卦", chart.changedHexagram],
  ] as const;
  const supportingStages = [
    ["bagua.mutual", "互卦", chart.mutualHexagram],
    ["bagua.opposite", "错卦", chart.oppositeHexagram],
    ["bagua.reversed", "综卦", chart.reversedHexagram],
  ] as const;

  const addHexagramStages = (
    stages: typeof primaryStages | typeof supportingStages,
  ) => {
    stages.forEach(([evidenceId, label, value]) => {
      if (!isRecord(value)) {
        return;
      }

      addItem(items, {
        evidenceId,
        method: "bagua",
        kind: "bagua_hexagram",
        label: `${label} · 第${asText(value.number) || "?"}卦 ${asText(value.name) || "未明"}`,
        summary: compact([
          asText(value.nature),
          asText(value.judgment),
        ].filter(Boolean).join(" "), 220),
        data: value,
        allowedTerms: hexagramTerms(value),
      });
    });
  };

  addHexagramStages(primaryStages);

  const movingLine = asText(chart.movingLine);
  const movingYao = Array.isArray(chart.yao)
    ? chart.yao.find((item) =>
        isRecord(item) && (
          item.moving === true ||
          (movingLine !== "" && asText(item.index) === movingLine)
        )
      )
    : null;
  const moving = isRecord(chart.moving)
    ? chart.moving
    : isRecord(movingYao)
      ? movingYao
      : null;
  if (moving) {
    const position = asText(moving.position) || (movingLine ? `第${movingLine}爻` : "");
    const movingSummary = compact(
      [moving.text, moving.advice].map(asText).filter(Boolean).join(" "),
      220,
    ) || compact(
      [position, moving.yinYang, moving.stage, moving.role]
        .map(asText)
        .filter(Boolean)
        .join(" · "),
      220,
    ) || "动爻字段已记录。";

    addItem(items, {
      evidenceId: "bagua.moving",
      method: "bagua",
      kind: "bagua_moving_line",
      label: position ? `动爻 · ${position}` : "动爻",
      summary: movingSummary,
      data: {
        movingLine: chart.movingLine,
        moving,
      },
      allowedTerms: [
        chart.movingLine,
        moving.position,
        moving.stage,
        moving.yinYang,
        moving.role,
        moving.text,
        moving.advice,
        movingLine ? `第${movingLine}爻` : "",
        "动爻",
        "变爻",
        "爻位提示",
      ],
    });
  }

  addHexagramStages(supportingStages);
}

function buildBaziEvidenceFromChart(chart: Record<string, unknown>, items: ReadingEvidenceItem[]) {
  const bazi = Array.isArray(chart.bazi)
    ? chart.bazi.map(asText).map((value) => value.trim()).filter(Boolean).slice(0, 4)
    : [];
  const pillars = Array.isArray(chart.pillars) ? chart.pillars : [];
  const pillarRecords = pillars.filter(isRecord);
  const wuxingProfile = isRecord(chart.wuxingProfile) ? chart.wuxingProfile : {};
  const weightedCounts = isRecord(chart.weightedCounts)
    ? chart.weightedCounts
    : isRecord(wuxingProfile.weightedCounts)
      ? wuxingProfile.weightedCounts
      : isRecord(chart.counts)
        ? chart.counts
        : isRecord(wuxingProfile.counts)
          ? wuxingProfile.counts
          : {};
  const tenGodCounts = isRecord(chart.tenGodCounts) ? chart.tenGodCounts : {};
  const branchRelations = Array.isArray(chart.branchRelations)
    ? chart.branchRelations.filter(isRecord)
    : [];
  const dayPillar = pillarRecords.find(
    (pillar) => pillar.key === "day" || pillar.label === "日柱",
  );
  const dayMaster = isRecord(chart.dayMaster)
    ? chart.dayMaster
    : isRecord(dayPillar)
      ? {
          stem: dayPillar.heavenlyStem,
          element: dayPillar.stemElement,
          yinYang: dayPillar.yinYang,
        }
      : {};
  const luck = isRecord(chart.luck) ? chart.luck : {};
  const currentDaYun = isRecord(luck.currentDaYun) ? luck.currentDaYun : {};
  const annual = Array.isArray(luck.annual) ? luck.annual.filter(isRecord) : [];
  const currentYear = new Date().getFullYear();
  const currentAnnual = annual.find((item) =>
    Number(item.year) === currentYear
  );
  const pillarTenGods = pillarRecords.flatMap((pillar) => {
    const tenGod = asText(pillar.stemTenGod);
    if (!tenGod) return [];
    const pillarLabel = asText(pillar.label) || asText(pillar.ganzhi);
    return [pillarLabel ? `${pillarLabel}:${tenGod}` : tenGod];
  });
  const tenGodCountLabels = Object.entries(tenGodCounts).flatMap(([tenGod, count]) => {
    const countText = asText(count);
    return tenGod && countText ? [`${tenGod}:${countText}`] : [];
  });
  const tenGodCountTerms = tenGodCountLabels.flatMap((label) => {
    const [tenGod, count] = label.split(":");
    return [label, `${tenGod}：${count}`, `${tenGod}${count}`];
  });
  const branchRelationDetails = branchRelations.flatMap((relation) => {
    const branches = Array.isArray(relation.branches) ? uniqueTexts(relation.branches) : [];
    const type = asText(relation.type);
    const element = asText(relation.element);
    const label = `${type}${branches.join("")}${element ? `化${element}` : ""}`;
    return label ? [{ relation, branches, type, element, label }] : [];
  });
  const branchRelationTerms = branchRelationDetails.flatMap((detail) => [
    detail.label,
    detail.type,
    detail.element,
    detail.relation.advice,
    ...detail.branches,
  ]);
  const pillarSummary = [
    bazi.length > 0 ? `四柱：${bazi.join("、")}` : "",
    pillarTenGods.length > 0 ? `天干十神：${pillarTenGods.join("、")}` : "",
    tenGodCountLabels.length > 0
      ? `十神计数：${tenGodCountLabels.join("、")}`
      : "",
    branchRelationDetails.length > 0
      ? `地支关系：${branchRelationDetails.map((detail) => detail.label).join("、")}`
      : "",
  ].filter(Boolean).join("；");

  if (bazi.length > 0 || pillars.length > 0) {
    addItem(items, {
      evidenceId: "bazi.pillars",
      method: "bazi",
      kind: "bazi_pillars",
      label: "四柱",
      summary: compact(pillarSummary || "四柱字段已记录。", 360),
      data: { bazi, pillars, tenGodCounts, branchRelations },
      allowedTerms: [
        ...bazi,
        ...pillarRecords.flatMap((pillar) => [
          pillar.label,
          pillar.ganzhi,
          pillar.heavenlyStem,
          pillar.earthlyBranch,
          pillar.stemElement,
          pillar.branchElement,
          pillar.yinYang,
          pillar.wuxing,
          pillar.naYin,
          pillar.diShi,
          pillar.xunKong,
          pillar.stemTenGod,
          ...(Array.isArray(pillar.hiddenStems)
            ? pillar.hiddenStems.flatMap((hiddenStem) =>
                isRecord(hiddenStem)
                  ? [hiddenStem.stem, hiddenStem.element, hiddenStem.tenGod]
                  : [],
              )
            : []),
        ]),
        ...pillarTenGods,
        ...tenGodCountTerms,
        ...branchRelationTerms,
      ],
    });
  }

  const countSummaryTerms = ["木", "火", "土", "金", "水"].flatMap((element) => {
    const value = asText(weightedCounts[element]);
    return value ? [`${element}:${value}`] : [];
  });
  const strongest = asText(chart.strongest ?? wuxingProfile.strongest);
  const weakestSource = chart.weakest ?? wuxingProfile.weakest;
  const weakest = Array.isArray(weakestSource)
    ? uniqueTexts(weakestSource)
    : asText(weakestSource)
      ? [asText(weakestSource)]
      : [];
  const wuxingSummary = [
    countSummaryTerms.length > 0 ? `加权五行：${countSummaryTerms.join(" / ")}` : "未提供可引用的五行计数",
    strongest ? `最高项：${strongest}` : "",
    weakest.length > 0 ? `相对低项：${weakest.join("、")}` : "",
  ].filter(Boolean).join("；");

  addItem(items, {
    evidenceId: "bazi.wuxing",
    method: "bazi",
    kind: "bazi_wuxing",
    label: "五行分布",
    summary: wuxingSummary,
    data: {
      counts: isRecord(wuxingProfile.counts) ? wuxingProfile.counts : chart.counts,
      weightedCounts,
      strongest: chart.strongest ?? wuxingProfile.strongest,
      weakest: weakestSource,
    },
    allowedTerms: [
      "木",
      "火",
      "土",
      "金",
      "水",
      strongest,
      ...weakest,
      ...countSummaryTerms,
      ...Object.entries(weightedCounts).flatMap(([key, value]) => [`${key}:${value}`, `${key}：${value}`]),
    ],
  });

  const usefulElements = Array.isArray(dayMaster.usefulElements)
    ? uniqueTexts(dayMaster.usefulElements)
    : [];
  const avoidElements = Array.isArray(dayMaster.avoidElements)
    ? uniqueTexts(dayMaster.avoidElements)
    : [];
  const dayMasterName = `${asText(dayMaster.stem)}${asText(dayMaster.element)}`;
  const dayMasterSummary = [
    asText(dayMaster.strengthLabel) ? `旺衰：${asText(dayMaster.strengthLabel)}` : "",
    asText(dayMaster.seasonElement) ? `季令五行：${asText(dayMaster.seasonElement)}` : "",
    usefulElements.length > 0 ? `结构调节方向：${usefulElements.join("、")}` : "",
    avoidElements.length > 0 ? `慎防过量：${avoidElements.join("、")}` : "",
    asText(dayMaster.explanation),
  ].filter(Boolean).join("；") || (dayMasterName ? `日主：${dayMasterName}` : "未提供可引用的日主字段。");

  addItem(items, {
    evidenceId: "bazi.dayMaster",
    method: "bazi",
    kind: "bazi_day_master",
    label: dayMasterName ? `日主 · ${dayMasterName}` : "日主",
    summary: compact(dayMasterSummary, 300),
    data: dayMaster,
    allowedTerms: [
      dayMaster.stem,
      dayMaster.element,
      dayMaster.yinYang,
      dayMaster.seasonElement,
      dayMaster.strengthLabel,
      dayMaster.explanation,
      ...usefulElements,
      ...avoidElements,
      asText(dayMaster.supportScore) ? `支持分:${asText(dayMaster.supportScore)}` : "",
      asText(dayMaster.drainScore) ? `耗泄分:${asText(dayMaster.drainScore)}` : "",
      asText(dayMaster.balanceScore) ? `平衡分:${asText(dayMaster.balanceScore)}` : "",
    ],
  });

  if (Object.keys(currentDaYun).length > 0) {
    const daYunRange = asText(currentDaYun.startYear) && asText(currentDaYun.endYear)
      ? `${asText(currentDaYun.startYear)}-${asText(currentDaYun.endYear)}`
      : "";
    const currentAnnualSummary = currentAnnual
      ? [
          `${currentYear}${asText(currentAnnual.ganZhi)}`,
          asText(currentAnnual.tenGod) ? `十神：${asText(currentAnnual.tenGod)}` : "",
          asText(currentAnnual.role) ? `作用：${asText(currentAnnual.role)}` : "",
          asText(currentAnnual.advice),
        ].filter(Boolean).join("；")
      : "";
    const luckSummary = [
      asText(currentDaYun.ganZhi) ? `当前大运：${asText(currentDaYun.ganZhi)}` : "",
      daYunRange ? `区间：${daYunRange}` : "",
      asText(currentDaYun.tenGod) ? `十神：${asText(currentDaYun.tenGod)}` : "",
      asText(currentDaYun.role) ? `作用：${asText(currentDaYun.role)}` : "",
      asText(currentDaYun.advice),
      currentAnnualSummary ? `当前流年：${currentAnnualSummary}` : "",
    ].filter(Boolean).join("；");

    addItem(items, {
      evidenceId: "bazi.luck",
      method: "bazi",
      kind: "bazi_luck",
      label: `大运 · ${asText(currentDaYun.ganZhi) || "当前大运"}${currentAnnual ? ` / ${currentYear}流年` : ""}`,
      summary: compact(luckSummary || "当前大运字段已记录。", 360),
      data: {
        start: luck.start,
        currentDaYun,
        annual: annual.slice(0, 6),
      },
      allowedTerms: [
        currentDaYun.ganZhi,
        currentDaYun.tenGod,
        currentDaYun.gan,
        currentDaYun.zhi,
        currentDaYun.ganElement,
        currentDaYun.zhiElement,
        currentDaYun.role,
        currentDaYun.phase,
        currentDaYun.startYear,
        currentDaYun.endYear,
        currentDaYun.startAge,
        currentDaYun.endAge,
        currentDaYun.advice,
        ...(isRecord(luck.start)
          ? [
              luck.start.solar,
              luck.start.direction,
              luck.start.years,
              luck.start.months,
              luck.start.days,
              luck.start.hours,
            ]
          : []),
        ...(annual.length > 0
          ? annual.flatMap((item) =>
              [
                item.year,
                item.ganZhi,
                item.gan,
                item.zhi,
                item.ganElement,
                item.zhiElement,
                item.tenGod,
                item.role,
                item.advice,
                ...(Array.isArray(item.branchSignals) ? item.branchSignals : []),
              ],
            )
          : []),
      ],
    });
  } else if (currentAnnual) {
    addItem(items, {
      evidenceId: "bazi.luck",
      method: "bazi",
      kind: "bazi_luck",
      label: `流年 · ${currentYear}${asText(currentAnnual.ganZhi)}`,
      summary: compact([
        "未提供性别，未推定大运顺逆、起运时间和当前大运",
        `当前流年：${currentYear}${asText(currentAnnual.ganZhi)}`,
        asText(currentAnnual.tenGod) ? `十神：${asText(currentAnnual.tenGod)}` : "",
        asText(currentAnnual.role) ? `作用：${asText(currentAnnual.role)}` : "",
        asText(currentAnnual.advice),
      ].filter(Boolean).join("；"), 360),
      data: {
        start: null,
        currentDaYun: null,
        annual: annual.slice(0, 6),
      },
      allowedTerms: annual.flatMap((item) => [
        item.year,
        item.ganZhi,
        item.gan,
        item.zhi,
        item.ganElement,
        item.zhiElement,
        item.tenGod,
        item.role,
        item.advice,
        ...(Array.isArray(item.branchSignals) ? item.branchSignals : []),
      ]),
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
  const signals = Array.isArray(result.signals) ? result.signals : [];

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
    allowedTerms: [result.state, result.imageId, result.contentType, result.nextAction, result.analyzer],
    sensitive: true,
  });

  signals.slice(0, 6).forEach((signal, index) => {
    if (!isRecord(signal)) return;

    addItem(items, {
      evidenceId: `palm.signal.${index + 1}`,
      method: "palm",
      kind: "palm_signal",
      label: asText(signal.line) || `掌纹观察 ${index + 1}`,
      summary: compact(asText(signal.reading) || "视觉分析已返回掌纹观察。", 220),
      data: signal,
      allowedTerms: [signal.line, signal.reading],
      sensitive: true,
    });
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
    ...validateUnsupportedPredictiveClaims(text),
  ];
}

const futureWindowPattern =
  /未来|接下来|今后|短期内|近期|未来[一二三四五六七八九十\d]+(?:天|周|个月|月|年)|(?:这|下)(?:周|月|季度|半年|年)|(?:上|下)半年/;
const relationshipPredictionPattern =
  /(?:对方|他|她|前任|伴侣)[^。！？\n]{0,20}(?:会|将|一定|必然|肯定|大概率)[^。！？\n]{0,20}(?:主动|复合|回来|联系|表白|结婚|分手|离开|答应|拒绝)/;
const futureOutcomePattern =
  /(?:会|将|一定|必然|肯定|大概率)[^。！？\n]{0,24}(?:复合|回来|联系|表白|结婚|分手|离开|成功|发生|出现|进入|得到|失去)/;
const uncertaintyFramingPattern =
  /可能|也许|倾向|更像|是否|会不会|要看|如果|若|取决于|需(?:要)?(?:观察|确认|核实|验证)|观察(?:信号|迹象)|可观察|尚不能|无法|不能|不代表|不意味着|并非|仅凭|只凭|目前信息|当前信息|以.{0,12}为准/;

export function validateUnsupportedPredictiveClaims(text: string) {
  return text
    .split(/[。！？\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) =>
      !uncertaintyFramingPattern.test(segment) &&
      (
        relationshipPredictionPattern.test(segment) ||
        (futureWindowPattern.test(segment) && futureOutcomePattern.test(segment))
      )
    )
    .map((segment) => `Unsupported predictive claim: ${segment.slice(0, 120)}`);
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
