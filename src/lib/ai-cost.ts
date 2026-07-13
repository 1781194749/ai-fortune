import "server-only";

export type AiCostEstimate = {
  costCents: number;
  currency: "CNY";
  estimated: boolean;
  source: "env_model_rate" | "env_default_rate" | "startup_estimate_v1";
  tokensIn: number;
  tokensOut: number;
  inputCostCentsPerMillionTokens: number;
  outputCostCentsPerMillionTokens: number;
};

type RatePair = {
  inputCostCentsPerMillionTokens: number;
  outputCostCentsPerMillionTokens: number;
};

type RatePairWithSource = RatePair & {
  source: AiCostEstimate["source"];
};

function normalizeTokenCount(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function normalizeModelEnvKey(model: string) {
  return model
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readPositiveNumberEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    return undefined;
  }

  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function readEnvRatePair(inputName: string, outputName: string): RatePair | undefined {
  const inputCostCentsPerMillionTokens = readPositiveNumberEnv(inputName);
  const outputCostCentsPerMillionTokens = readPositiveNumberEnv(outputName);

  if (
    inputCostCentsPerMillionTokens === undefined ||
    outputCostCentsPerMillionTokens === undefined
  ) {
    return undefined;
  }

  return {
    inputCostCentsPerMillionTokens,
    outputCostCentsPerMillionTokens,
  };
}

function readConfiguredRatePair(model: string): RatePairWithSource | undefined {
  const modelKey = normalizeModelEnvKey(model);
  const modelRate =
    modelKey.length > 0
      ? readEnvRatePair(
          `OPENAI_COST_${modelKey}_INPUT_CENTS_PER_1M_TOKENS`,
          `OPENAI_COST_${modelKey}_OUTPUT_CENTS_PER_1M_TOKENS`,
        )
      : undefined;

  if (modelRate) {
    return { ...modelRate, source: "env_model_rate" };
  }

  const defaultRate =
    readEnvRatePair(
      "OPENAI_DEFAULT_INPUT_CENTS_PER_1M_TOKENS",
      "OPENAI_DEFAULT_OUTPUT_CENTS_PER_1M_TOKENS",
    ) ??
    readEnvRatePair(
      "OPENAI_COST_INPUT_CENTS_PER_1M_TOKENS",
      "OPENAI_COST_OUTPUT_CENTS_PER_1M_TOKENS",
    );

  return defaultRate ? { ...defaultRate, source: "env_default_rate" } : undefined;
}

function fallbackRatePair(model: string): RatePairWithSource {
  const normalized = model.toLowerCase();
  const isSmallModel =
    normalized.includes("mini") ||
    normalized.includes("nano") ||
    normalized.includes("small") ||
    normalized.includes("fast");

  if (isSmallModel) {
    return {
      source: "startup_estimate_v1",
      inputCostCentsPerMillionTokens: 120,
      outputCostCentsPerMillionTokens: 480,
    };
  }

  return {
    source: "startup_estimate_v1",
    inputCostCentsPerMillionTokens: 900,
    outputCostCentsPerMillionTokens: 7200,
  };
}

export function estimateOpenAiCostCents(input: {
  model: string;
  tokensIn?: number;
  tokensOut?: number;
}): AiCostEstimate | undefined {
  const tokensIn = normalizeTokenCount(input.tokensIn);
  const tokensOut = normalizeTokenCount(input.tokensOut);

  if (tokensIn + tokensOut <= 0) {
    return undefined;
  }

  const rate = readConfiguredRatePair(input.model) ?? fallbackRatePair(input.model);
  const rawCostCents =
    (tokensIn * rate.inputCostCentsPerMillionTokens +
      tokensOut * rate.outputCostCentsPerMillionTokens) /
    1_000_000;

  return {
    costCents: Math.max(1, Math.ceil(rawCostCents)),
    currency: "CNY",
    estimated: true,
    source: rate.source,
    tokensIn,
    tokensOut,
    inputCostCentsPerMillionTokens: rate.inputCostCentsPerMillionTokens,
    outputCostCentsPerMillionTokens: rate.outputCostCentsPerMillionTokens,
  };
}

export function buildAiCostMetadata(estimate: AiCostEstimate | undefined) {
  if (!estimate) {
    return {
      costCurrency: "CNY",
      estimatedCost: true,
      costSource: "missing_usage_tokens",
    };
  }

  return {
    costCurrency: estimate.currency,
    estimatedCost: estimate.estimated,
    costSource: estimate.source,
    inputCostCentsPerMillionTokens: estimate.inputCostCentsPerMillionTokens,
    outputCostCentsPerMillionTokens: estimate.outputCostCentsPerMillionTokens,
  };
}
