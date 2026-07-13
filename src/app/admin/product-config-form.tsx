"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import type { Product, ProductRuntimeOverride } from "@/lib/commerce";

type ProductConfigRow = {
  code: Product["code"];
  base: Product;
  effective: Product;
  config?: ProductRuntimeOverride;
  enabled: boolean;
  configured: boolean;
};

type AdminActionResponse =
  | {
      ok: true;
      message?: string;
    }
  | {
      ok: false;
      message?: string;
    };

function adminApiPath(path: string, token?: string) {
  if (!token) {
    return path;
  }

  return `${path}?token=${encodeURIComponent(token)}`;
}

function centsToYuanInput(cents: number) {
  const yuan = cents / 100;

  if (cents % 100 === 0) {
    return yuan.toFixed(0);
  }

  if (cents % 10 === 0) {
    return yuan.toFixed(1);
  }

  return yuan.toFixed(2);
}

function parseNonNegativeInteger(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return Number.NaN;
  }

  const number = Number(trimmed);

  return Number.isInteger(number) && number >= 0 ? number : Number.NaN;
}

function parsePriceCents(value: string) {
  const trimmed = value.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return Number.NaN;
  }

  return Math.round(Number(trimmed) * 100);
}

export function AdminProductConfigForm({
  row,
  adminToken,
}: {
  row: ProductConfigRow;
  adminToken?: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(row.enabled);
  const [highlighted, setHighlighted] = useState(Boolean(row.effective.highlighted));
  const [name, setName] = useState(row.effective.name);
  const [priceYuan, setPriceYuan] = useState(centsToYuanInput(row.effective.priceCents));
  const [starGrant, setStarGrant] = useState(String(row.effective.starGrant ?? 0));
  const [durationDays, setDurationDays] = useState(String(row.effective.durationDays ?? 0));
  const [reportQuota, setReportQuota] = useState(String(row.effective.reportQuota ?? 0));
  const [palmQuota, setPalmQuota] = useState(String(row.effective.palmQuota ?? 0));
  const [description, setDescription] = useState(row.effective.description);
  const [loading, setLoading] = useState<"save" | "reset" | null>(null);
  const [message, setMessage] = useState("");

  async function submit(reset = false) {
    const parsedPriceCents = parsePriceCents(priceYuan);
    const parsedStarGrant = parseNonNegativeInteger(starGrant);
    const parsedDurationDays = parseNonNegativeInteger(durationDays);
    const parsedReportQuota = parseNonNegativeInteger(reportQuota);
    const parsedPalmQuota = parseNonNegativeInteger(palmQuota);
    const normalizedName = name.trim();
    const normalizedDescription = description.trim();

    if (!reset) {
      if (!normalizedName) {
        setMessage("套餐名称不能为空。");
        return;
      }

      if (!normalizedDescription) {
        setMessage("套餐描述不能为空。");
        return;
      }

      if (
        Number.isNaN(parsedPriceCents) ||
        Number.isNaN(parsedStarGrant) ||
        Number.isNaN(parsedDurationDays) ||
        Number.isNaN(parsedReportQuota) ||
        Number.isNaN(parsedPalmQuota)
      ) {
        setMessage("价格最多保留 2 位小数，额度和天数必须是大于等于 0 的整数。");
        return;
      }
    }

    setLoading(reset ? "reset" : "save");
    setMessage(reset ? "正在恢复默认..." : "正在保存套餐配置...");

    try {
      const response = await fetch(
        adminApiPath(`/api/admin/products/${row.code}/config`, adminToken),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            reset
              ? { reset: true, note: "后台恢复默认套餐配置" }
              : {
                  enabled,
                  highlighted,
                  name: normalizedName,
                  priceCents: parsedPriceCents,
                  starGrant: parsedStarGrant,
                  durationDays: parsedDurationDays,
                  reportQuota: parsedReportQuota,
                  palmQuota: parsedPalmQuota,
                  description: normalizedDescription,
                  note: "后台更新套餐配置",
                },
          ),
        },
      );
      const data = (await response.json()) as AdminActionResponse;

      if (!response.ok || !data.ok) {
        const failureMessage = data.ok === false ? data.message ?? "保存失败。" : "保存失败。";
        setMessage(failureMessage);
        toast.error(failureMessage);
        return;
      }

      const successMessage = reset ? "已恢复默认配置。" : "已保存套餐配置。";
      setMessage(successMessage);
      toast.success(successMessage, {
        description: `${row.effective.name} 的前台套餐配置已更新。`,
      });
      router.refresh();
    } catch {
      const failureMessage = "网络连接异常，请稍后再试。";
      setMessage(failureMessage);
      toast.error(failureMessage);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          套餐名称
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          价格（元）
          <input
            value={priceYuan}
            onChange={(event) => setPriceYuan(event.target.value)}
            inputMode="decimal"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          星力
          <input
            value={starGrant}
            onChange={(event) => setStarGrant(event.target.value)}
            inputMode="numeric"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          有效天数
          <input
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
            inputMode="numeric"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          深度报告
          <input
            value={reportQuota}
            onChange={(event) => setReportQuota(event.target.value)}
            inputMode="numeric"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          手相额度
          <input
            value={palmQuota}
            onChange={(event) => setPalmQuota(event.target.value)}
            inputMode="numeric"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
          />
        </label>
      </div>

      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        套餐描述
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="min-h-20 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            type="checkbox"
            className="size-4 accent-[#b68b43]"
          />
          前台可购买
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            checked={highlighted}
            onChange={(event) => setHighlighted(event.target.checked)}
            type="checkbox"
            className="size-4 accent-[#b68b43]"
          />
          设为主推
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void submit(false);
          }}
          disabled={loading !== null}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading === "save" ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
          保存
        </button>
        <button
          type="button"
          onClick={() => {
            void submit(true);
          }}
          disabled={loading !== null || !row.configured}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading === "reset" ? <Loader2 className="animate-spin" size={15} /> : <RotateCcw size={15} />}
          恢复默认
        </button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}
