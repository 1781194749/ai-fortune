"use client";

import {
  Bar,
  CartesianGrid,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type AdminDailyMetric = {
  date: string;
  label: string;
  orders: number;
  aiCalls: number;
  revenueCents: number;
  tokensIn: number;
  tokensOut: number;
  aiCostCents: number;
};

const activityConfig = {
  orders: {
    label: "支付订单",
    color: "var(--chart-1)",
  },
  aiCalls: {
    label: "AI 调用",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const tokenConfig = {
  tokensIn: {
    label: "输入 Token",
    color: "var(--chart-2)",
  },
  tokensOut: {
    label: "输出 Token",
    color: "var(--chart-1)",
  },
  aiCostCents: {
    label: "预估成本（分）",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

export function AdminActivityChart({ data }: { data: AdminDailyMetric[] }) {
  return (
    <ChartContainer config={activityConfig} className="h-[280px] w-full">
      <ComposedChart data={data} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={24}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        <Bar dataKey="aiCalls" fill="var(--color-aiCalls)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="orders" fill="var(--color-orders)" radius={[4, 4, 0, 0]} maxBarSize={18} />
      </ComposedChart>
    </ChartContainer>
  );
}

export function AdminTokenChart({ data }: { data: AdminDailyMetric[] }) {
  return (
    <ChartContainer config={tokenConfig} className="h-[310px] w-full">
      <ComposedChart data={data} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={24}
        />
        <YAxis yAxisId="tokens" hide />
        <YAxis yAxisId="cost" orientation="right" hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        <Bar
          yAxisId="tokens"
          dataKey="tokensIn"
          stackId="tokens"
          fill="var(--color-tokensIn)"
          maxBarSize={24}
        />
        <Bar
          yAxisId="tokens"
          dataKey="tokensOut"
          stackId="tokens"
          fill="var(--color-tokensOut)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
        />
        <Line
          yAxisId="cost"
          type="monotone"
          dataKey="aiCostCents"
          stroke="var(--color-aiCostCents)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
