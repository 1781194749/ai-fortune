export type HumanReviewGateCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

type ParsedHumanReview = {
  sampleId: string;
  reviewer: unknown;
  pass: unknown;
};

export type HumanReviewValidation = {
  checks: HumanReviewGateCheck[];
  reviewedCount: number;
  passedCount: number;
  passRate: number;
};

export const minimumHumanReviewPassRate = 0.9;

function addCheck(
  checks: HumanReviewGateCheck[],
  id: string,
  ok: boolean,
  detail: string,
) {
  checks.push({ id, ok, detail });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHumanReviewer(value: unknown) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    !/^semantic\s*[:：]/i.test(value.trim());
}

export function validateHumanReviewJsonl(input: {
  jsonl: string;
  expectedSampleIds: readonly string[];
}): HumanReviewValidation {
  const checks: HumanReviewGateCheck[] = [];
  const expectedSampleIds = Array.from(new Set(input.expectedSampleIds));
  const expectedSampleIdSet = new Set(expectedSampleIds);
  const reviewsBySampleId = new Map<string, ParsedHumanReview>();
  const lines = input.jsonl
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter((item) => item.line.length > 0);

  for (const { line, lineNumber } of lines) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch {
      addCheck(
        checks,
        `human-review:jsonl-line-${lineNumber}`,
        false,
        `Line ${lineNumber} is not valid JSON.`,
      );
      continue;
    }

    if (!isRecord(parsed) || typeof parsed.sampleId !== "string" || !parsed.sampleId.trim()) {
      addCheck(
        checks,
        `human-review:record-line-${lineNumber}`,
        false,
        `Line ${lineNumber} must contain a non-empty sampleId.`,
      );
      continue;
    }

    const sampleId = parsed.sampleId.trim();
    if (!expectedSampleIdSet.has(sampleId)) {
      addCheck(
        checks,
        `human-review:unknown-sample-line-${lineNumber}`,
        false,
        `Unknown sampleId=${sampleId}.`,
      );
      continue;
    }

    if (reviewsBySampleId.has(sampleId)) {
      addCheck(
        checks,
        `human-review:duplicate:${sampleId}`,
        false,
        `sampleId=${sampleId} appears more than once.`,
      );
      continue;
    }

    reviewsBySampleId.set(sampleId, {
      sampleId,
      reviewer: parsed.reviewer,
      pass: parsed.pass,
    });
  }

  addCheck(
    checks,
    "human-review:coverage",
    reviewsBySampleId.size === expectedSampleIds.length,
    `expected=${expectedSampleIds.length}, covered=${reviewsBySampleId.size}`,
  );

  let reviewedCount = 0;
  let passedCount = 0;

  for (const sampleId of expectedSampleIds) {
    const review = reviewsBySampleId.get(sampleId);
    addCheck(
      checks,
      `human-review:sample-covered:${sampleId}`,
      Boolean(review),
      review ? "ok" : "Missing human review record.",
    );

    if (!review) continue;

    const reviewerOk = isHumanReviewer(review.reviewer);
    const passOk = typeof review.pass === "boolean";
    addCheck(
      checks,
      `human-review:reviewer:${sampleId}`,
      reviewerOk,
      reviewerOk
        ? String(review.reviewer).trim()
        : "reviewer must name a human reviewer and must not start with semantic:.",
    );
    addCheck(
      checks,
      `human-review:pass:${sampleId}`,
      passOk,
      passOk ? String(review.pass) : "pass must be a JSON boolean.",
    );

    if (reviewerOk && passOk) {
      reviewedCount += 1;
      if (review.pass) passedCount += 1;
    }
  }

  const passRate = expectedSampleIds.length > 0
    ? passedCount / expectedSampleIds.length
    : 0;
  addCheck(
    checks,
    "human-review:pass-rate",
    passRate >= minimumHumanReviewPassRate,
    `passed=${passedCount}, expected=${expectedSampleIds.length}, rate=${(passRate * 100).toFixed(1)}%, required>=${minimumHumanReviewPassRate * 100}%`,
  );

  return {
    checks,
    reviewedCount,
    passedCount,
    passRate,
  };
}
