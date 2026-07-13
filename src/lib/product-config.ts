import "server-only";

import {
  getProduct,
  membershipProducts,
  oneTimeProducts,
  type Product,
  type ProductCode,
  type ProductRuntimeOverride,
} from "@/lib/commerce";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export type ProductRuntimeConfig = ProductRuntimeOverride & {
  code: ProductCode;
  updatedAt: string;
  updatedBy: string;
  note?: string;
};

export type ProductConfigMetadata = {
  event: "product_config_updated";
  products: ProductRuntimeConfig[];
  updatedBy: string;
  note?: string;
};

const runtimeConfigs =
  globalThis.xuanjiProductRuntimeConfigs ?? new Map<string, ProductRuntimeOverride>();
const productConfigCacheTtlMs = 5_000;

if (!globalThis.xuanjiProductRuntimeConfigs) {
  globalThis.xuanjiProductRuntimeConfigs = runtimeConfigs;
}

declare global {
  var xuanjiProductRuntimeConfigsLoadedAt: number | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function readConfig(value: unknown): ProductRuntimeConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const code = readString(value.code) as ProductCode | undefined;
  const updatedAt = readString(value.updatedAt);
  const updatedBy = readString(value.updatedBy);

  if (!code || !updatedAt || !updatedBy) {
    return undefined;
  }

  return {
    code,
    enabled: readBoolean(value.enabled),
    name: readString(value.name),
    priceCents: readNonNegativeInteger(value.priceCents),
    starGrant: readNonNegativeInteger(value.starGrant),
    durationDays: readNonNegativeInteger(value.durationDays),
    reportQuota: readNonNegativeInteger(value.reportQuota),
    palmQuota: readNonNegativeInteger(value.palmQuota),
    highlighted: readBoolean(value.highlighted),
    description: readString(value.description),
    updatedAt,
    updatedBy,
    note: readString(value.note),
  };
}

function configToOverride(config: ProductRuntimeConfig): ProductRuntimeOverride {
  return {
    enabled: config.enabled,
    name: config.name,
    priceCents: config.priceCents,
    starGrant: config.starGrant,
    durationDays: config.durationDays,
    reportQuota: config.reportQuota,
    palmQuota: config.palmQuota,
    highlighted: config.highlighted,
    description: config.description,
  };
}

function applySnapshot(configs: ProductRuntimeConfig[]) {
  runtimeConfigs.clear();

  for (const config of configs) {
    runtimeConfigs.set(config.code, configToOverride(config));
  }
}

function isRuntimeConfigCacheFresh() {
  const loadedAt = globalThis.xuanjiProductRuntimeConfigsLoadedAt ?? 0;
  return loadedAt > 0 && Date.now() - loadedAt < productConfigCacheTtlMs;
}

function markRuntimeConfigCacheLoaded() {
  globalThis.xuanjiProductRuntimeConfigsLoadedAt = Date.now();
}

function applyConfig(product: Product, config: ProductRuntimeOverride | undefined) {
  if (!config) {
    return product;
  }

  return {
    ...product,
    ...Object.fromEntries(
      Object.entries(config).filter(([, value]) => value !== undefined),
    ),
    code: product.code,
    type: product.type,
    currency: product.currency,
  } satisfies Product;
}

export function readProductConfigMetadata(log: UsageLogRecord) {
  if (log.feature !== "product_config" || !isRecord(log.metadata)) {
    return undefined;
  }

  if (log.metadata.event !== "product_config_updated" || !Array.isArray(log.metadata.products)) {
    return undefined;
  }

  const products = log.metadata.products
    .map(readConfig)
    .filter((config): config is ProductRuntimeConfig => Boolean(config));
  const updatedBy = readString(log.metadata.updatedBy);

  if (!updatedBy) {
    return undefined;
  }

  return {
    event: "product_config_updated",
    products,
    updatedBy,
    note: readString(log.metadata.note),
  } satisfies ProductConfigMetadata;
}

export async function getProductRuntimeConfigMap(input: { forceRefresh?: boolean } = {}) {
  if (!input.forceRefresh && isRuntimeConfigCacheFresh()) {
    return new Map(runtimeConfigs);
  }

  const logs = await getUsageLogsByFeature("product_config", { take: 20 });
  const latest = logs.map(readProductConfigMetadata).find(Boolean);

  if (latest) {
    applySnapshot(latest.products);
  }

  markRuntimeConfigCacheLoaded();

  return new Map(runtimeConfigs);
}

export async function getRuntimeProduct(code: ProductCode) {
  await getProductRuntimeConfigMap();
  return getProduct(code);
}

export async function getRuntimeMembershipProducts() {
  await getProductRuntimeConfigMap();
  return membershipProducts
    .map((product) => getProduct(product.code))
    .filter((product): product is Product => Boolean(product));
}

export async function getRuntimeOneTimeProducts() {
  await getProductRuntimeConfigMap();
  return oneTimeProducts
    .map((product) => getProduct(product.code))
    .filter((product): product is Product => Boolean(product));
}

export async function getAdminProductConfigRows() {
  const configs = await getProductRuntimeConfigMap();

  return membershipProducts.map((base) => {
    const config = configs.get(base.code);
    const effective = applyConfig(base, config);

    return {
      code: base.code,
      base,
      effective,
      config,
      enabled: config?.enabled ?? true,
      configured: Boolean(config),
    };
  });
}

export async function saveProductRuntimeConfig(input: {
  code: ProductCode;
  config?: ProductRuntimeOverride;
  reset?: boolean;
  updatedBy?: string;
  note?: string;
}) {
  const updatedBy = input.updatedBy ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin";
  const updatedAt = new Date().toISOString();

  if (input.reset) {
    runtimeConfigs.delete(input.code);
  } else {
    runtimeConfigs.set(input.code, {
      enabled: input.config?.enabled,
      name: input.config?.name,
      priceCents: input.config?.priceCents,
      starGrant: input.config?.starGrant,
      durationDays: input.config?.durationDays,
      reportQuota: input.config?.reportQuota,
      palmQuota: input.config?.palmQuota,
      highlighted: input.config?.highlighted,
      description: input.config?.description,
    });
  }

  const products = Array.from(runtimeConfigs.entries()).map(([code, config]) => ({
    code: code as ProductCode,
    ...config,
    updatedAt,
    updatedBy,
    note: input.note,
  }));
  const metadata = {
    event: "product_config_updated",
    products,
    updatedBy,
    note: input.note,
  } satisfies ProductConfigMetadata;

  await createUsageLog({
    provider: "internal",
    model: "product-config",
    feature: "product_config",
    costCents: 0,
    metadata,
  });
  markRuntimeConfigCacheLoaded();

  return metadata;
}
