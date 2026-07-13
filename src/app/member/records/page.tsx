import { CreditCard, WalletCards } from "lucide-react";
import {
  getOrderDisplay,
  getUserMockOrders,
  getUserWalletTransactions,
} from "@/lib/mock-payment-store";
import { formatTime, getOrderStatusLabel, getRequiredMemberSession } from "../member-data";
import { PageHeader, Panel } from "../member-ui";

export default async function MemberRecordsPage() {
  const session = await getRequiredMemberSession();
  const [rawOrders, walletTransactions] = await Promise.all([
    getUserMockOrders(session.userId),
    getUserWalletTransactions(session.userId),
  ]);
  const orders = rawOrders.map(getOrderDisplay);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Records"
        title="交易记录"
        description="订单与星力流水独立查看，后续可以继续加筛选、退款、导出。"
      />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="订单记录" description="最近购买与支付状态" icon={CreditCard}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-[#252a32] text-xs text-[#697386]">
                <tr>
                  <th className="px-5 py-3 font-medium">产品</th>
                  <th className="px-5 py-3 font-medium">金额</th>
                  <th className="px-5 py-3 font-medium">状态</th>
                  <th className="px-5 py-3 font-medium">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#20252d]">
                {orders.length ? (
                  orders.map((order) => (
                    <tr key={order.id} className="text-[#c8d0dc]">
                      <td className="px-5 py-4">{order.productName}</td>
                      <td className="px-5 py-4 text-[#d8b873]">{order.priceLabel}</td>
                      <td className="px-5 py-4">{getOrderStatusLabel(order.status)}</td>
                      <td className="px-5 py-4 text-[#8d98a8]">{formatTime(order.createdAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-[#697386]">暂无订单记录</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="星力流水" description="充值、消耗与邀请奖励" icon={WalletCards}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-[#252a32] text-xs text-[#697386]">
                <tr>
                  <th className="px-5 py-3 font-medium">说明</th>
                  <th className="px-5 py-3 font-medium">变动</th>
                  <th className="px-5 py-3 font-medium">余额</th>
                  <th className="px-5 py-3 font-medium">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#20252d]">
                {walletTransactions.length ? (
                  walletTransactions.map((transaction) => (
                    <tr key={transaction.id} className="text-[#c8d0dc]">
                      <td className="max-w-[220px] truncate px-5 py-4">{transaction.reason}</td>
                      <td className={`px-5 py-4 font-medium ${transaction.amount >= 0 ? "text-[#8ad5bd]" : "text-[#d98572]"}`}>
                        {transaction.amount >= 0 ? "+" : ""}
                        {transaction.amount}
                      </td>
                      <td className="px-5 py-4">{transaction.balanceAfter}</td>
                      <td className="px-5 py-4 text-[#8d98a8]">{formatTime(transaction.createdAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-[#697386]">暂无星力流水</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </div>
  );
}
