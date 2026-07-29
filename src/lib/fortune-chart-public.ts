import "server-only";

import type { generateBagua } from "@/lib/bagua";
import type { calculateBazi } from "@/lib/bazi";

type BaguaChart = ReturnType<typeof generateBagua>;
type BaziChart = ReturnType<typeof calculateBazi>;

function toPublicTrigram(trigram: BaguaChart["mainHexagram"]["upper"]) {
  return {
    name: trigram.name,
    symbol: trigram.symbol,
    element: trigram.element,
    image: trigram.image,
    advice: trigram.advice,
  };
}

function toPublicHexagram(hexagram: BaguaChart["mainHexagram"]) {
  return {
    number: hexagram.number,
    name: hexagram.name,
    nature: hexagram.nature,
    judgment: hexagram.judgment,
    image: hexagram.image,
    advice: hexagram.advice,
    topicAdvice: hexagram.topicAdvice,
    upper: toPublicTrigram(hexagram.upper),
    lower: toPublicTrigram(hexagram.lower),
    relation: hexagram.relation,
    relationAdvice: hexagram.relationAdvice,
  };
}

export function toPublicBaguaChart(chart: BaguaChart) {
  return {
    topic: chart.topic,
    lines: [...chart.lines],
    movingLine: chart.movingLine,
    moving: {
      position: chart.moving.position,
      stage: chart.moving.stage,
      yinYang: chart.moving.yinYang,
      role: chart.moving.role,
      text: chart.moving.text,
      advice: chart.moving.advice,
    },
    yao: chart.yao.map((line) => ({
      index: line.index,
      position: line.position,
      stage: line.stage,
      yinYang: line.yinYang,
      active: line.active,
      moving: line.moving,
      role: line.role,
    })),
    mainHexagram: toPublicHexagram(chart.mainHexagram),
    changedHexagram: toPublicHexagram(chart.changedHexagram),
    mutualHexagram: toPublicHexagram(chart.mutualHexagram),
    oppositeHexagram: toPublicHexagram(chart.oppositeHexagram),
    reversedHexagram: toPublicHexagram(chart.reversedHexagram),
    ...(chart.choiceDirection ? { choiceDirection: chart.choiceDirection } : {}),
  };
}

export function toPublicBaziChart(chart: BaziChart) {
  return {
    solar: chart.solar,
    timeStandard: {
      basis: chart.timeStandard.basis,
      trueSolarTimeAdjusted: chart.timeStandard.trueSolarTimeAdjusted,
      note: chart.timeStandard.note,
    },
    lunar: chart.lunar,
    zodiac: chart.zodiac,
    bazi: [...chart.bazi],
    counts: {
      木: chart.counts.木,
      火: chart.counts.火,
      土: chart.counts.土,
      金: chart.counts.金,
      水: chart.counts.水,
    },
    weightedCounts: {
      木: chart.weightedCounts.木,
      火: chart.weightedCounts.火,
      土: chart.weightedCounts.土,
      金: chart.weightedCounts.金,
      水: chart.weightedCounts.水,
    },
    strongest: chart.strongest,
    weakest: [...chart.weakest],
    pillars: chart.pillars.map((pillar) => ({
      key: pillar.key,
      label: pillar.label,
      ganzhi: pillar.ganzhi,
      heavenlyStem: pillar.heavenlyStem,
      earthlyBranch: pillar.earthlyBranch,
      stemElement: pillar.stemElement,
      branchElement: pillar.branchElement,
      yinYang: pillar.yinYang,
      wuxing: pillar.wuxing,
      naYin: pillar.naYin,
      diShi: pillar.diShi,
      xunKong: pillar.xunKong,
      stemTenGod: pillar.stemTenGod,
      hiddenStems: pillar.hiddenStems.map((stem) => ({
        stem: stem.stem,
        element: stem.element,
        tenGod: stem.tenGod,
      })),
    })),
    dayMaster: {
      stem: chart.dayMaster.stem,
      element: chart.dayMaster.element,
      yinYang: chart.dayMaster.yinYang,
      seasonElement: chart.dayMaster.seasonElement,
      supportScore: chart.dayMaster.supportScore,
      drainScore: chart.dayMaster.drainScore,
      balanceScore: chart.dayMaster.balanceScore,
      strengthLabel: chart.dayMaster.strengthLabel,
      usefulElements: [...chart.dayMaster.usefulElements],
      avoidElements: [...chart.dayMaster.avoidElements],
      explanation: chart.dayMaster.explanation,
    },
    tenGodCounts: Object.fromEntries(Object.entries(chart.tenGodCounts)),
    branchRelations: chart.branchRelations.map((relation) => ({
      type: relation.type,
      branches: [...relation.branches],
      ...(relation.element ? { element: relation.element } : {}),
      advice: relation.advice,
    })),
    luck: {
      ...(chart.luck.start
        ? {
            start: {
              solar: chart.luck.start.solar,
              direction: chart.luck.start.direction,
            },
          }
        : {}),
      ...(chart.luck.currentDaYun
        ? {
            currentDaYun: {
              ganZhi: chart.luck.currentDaYun.ganZhi,
              startYear: chart.luck.currentDaYun.startYear,
              endYear: chart.luck.currentDaYun.endYear,
              startAge: chart.luck.currentDaYun.startAge,
              endAge: chart.luck.currentDaYun.endAge,
              tenGod: chart.luck.currentDaYun.tenGod,
              advice: chart.luck.currentDaYun.advice,
            },
          }
        : {}),
      daYun: chart.luck.daYun.map((period) => ({
        ganZhi: period.ganZhi,
        startYear: period.startYear,
        endYear: period.endYear,
        startAge: period.startAge,
        endAge: period.endAge,
        phase: period.phase,
        tenGod: period.tenGod,
      })),
      annual: chart.luck.annual.map((year) => ({
        year: year.year,
        ganZhi: year.ganZhi,
        tenGod: year.tenGod,
        branchSignals: [...year.branchSignals],
        advice: year.advice,
      })),
    },
  };
}
