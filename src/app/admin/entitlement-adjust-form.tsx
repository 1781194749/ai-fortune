"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EntitlementKind = "deep_report" | "palm_reading";

type EntitlementAdjustResponse =
  | {
      ok: true;
      balance?: {
        label: string;
        remaining: number;
      };
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

function parseAmount(value: string) {
  if (!/^-?\d+$/.test(value.trim())) {
    return Number.NaN;
  }

  return Number(value);
}

export function AdminEntitlementAdjustForm({
  adminToken,
  userOptions,
}: {
  adminToken?: string;
  userOptions: string[];
}) {
  const router = useRouter();
  const [userId, setUserId] = useState(userOptions[0] ?? "");
  const [kind, setKind] = useState<EntitlementKind>("deep_report");
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState("后台人工调整会员权益额度");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    const parsedAmount = parseAmount(amount);

    if (!userId.trim()) {
      setMessage("请填写用户 ID。");
      return;
    }

    if (!Number.isInteger(parsedAmount) || parsedAmount === 0 || Math.abs(parsedAmount) > 100) {
      setMessage("调整数量必须是 -100 到 100 之间的非 0 整数。");
      return;
    }

    if (!reason.trim()) {
      setMessage("请填写调整原因。");
      return;
    }

    setLoading(true);
    setMessage(parsedAmount > 0 ? "正在补发额度..." : "正在扣回额度...");

    const response = await fetch(adminApiPath("/api/admin/entitlements/adjust", adminToken), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId.trim(),
        kind,
        amount: parsedAmount,
        reason: reason.trim(),
      }),
    });
    const data = (await response.json()) as EntitlementAdjustResponse;

    setLoading(false);

    if (!response.ok || !data.ok) {
      setMessage(data.ok === false ? data.message ?? "调整失败。" : "调整失败。");
      return;
    }

    setMessage(
      data.balance
        ? `已调整 ${data.balance.label}，当前剩余 ${data.balance.remaining}。`
        : "已调整会员权益额度。",
    );
    router.refresh();
  }

  return (
    <Card className="shadow-xs ring-border/80">
      <CardHeader className="border-b">
        <CardTitle>人工调整会员权益</CardTitle>
        <CardDescription>用于运营补发或扣回深度报告、手相分析额度，所有操作都会记录审计流水。</CardDescription>
      </CardHeader>
      <CardContent className="pt-1">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr_0.55fr]">
        <div className="grid gap-2">
          <Label htmlFor="entitlement-user-id">用户 ID</Label>
          <Input
            id="entitlement-user-id"
            list="entitlement-user-options"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="输入或选择用户 ID"
          />
          <datalist id="entitlement-user-options">
            {userOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="entitlement-kind">权益类型</Label>
          <select
            id="entitlement-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as EntitlementKind)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
          >
            <option value="deep_report">深度报告额度</option>
            <option value="palm_reading">手相额度</option>
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="entitlement-amount">调整数量</Label>
          <Input
            id="entitlement-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <Label htmlFor="entitlement-reason">调整原因</Label>
        <Input
          id="entitlement-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={120}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => {
            void submit();
          }}
          disabled={loading}
          size="sm"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <PlusCircle size={14} />}
          提交调整
        </Button>
        <span className="text-xs text-muted-foreground">补发填写正数，扣回填写负数，单次最多 100。</span>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </div>
      </CardContent>
    </Card>
  );
}
