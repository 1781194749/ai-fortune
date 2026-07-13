import { createHash } from "node:crypto";
import { Client } from "pg";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/xuanji_ai?schema=public";
const testEmail = `membership-lifecycle-${Date.now()}@example.com`;
const adminEmail = "a1781194749@gmail.com";
const userId = `email_${createHash("sha256").update(testEmail).digest("hex").slice(0, 24)}`;
const db = new Client({ connectionString: databaseUrl });

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, input = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: input.method ?? "GET",
    headers: {
      ...(input.cookie ? { cookie: input.cookie } : {}),
      ...(input.body ? { "content-type": "application/json" } : {}),
      ...(input.headers ?? {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  const body = await response.json().catch(() => null);

  return { response, body };
}

async function login(email) {
  const { response, body } = await request("/api/auth/email/verify", {
    method: "POST",
    body: { email, code: "000000", returnTo: "/member" },
  });

  assert(response.ok && body?.ok, `登录失败：${body?.message ?? response.status}`);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";", 1)[0];
  assert(cookie.startsWith("xuanji_session="), "登录响应没有返回会话 Cookie。");
  return cookie;
}

async function createAndPay(cookie, productCode) {
  const created = await request("/api/payments/mock/orders", {
    method: "POST",
    cookie,
    body: { productCode },
  });
  assert(created.response.ok && created.body?.ok, `创建 ${productCode} 订单失败：${created.body?.message}`);
  const orderId = created.body.order.id;
  const paid = await request(`/api/payments/mock/orders/${orderId}/pay`, {
    method: "POST",
    cookie,
  });
  assert(paid.response.ok && paid.body?.ok, `支付 ${productCode} 订单失败：${paid.body?.message}`);
  return { orderId, paid };
}

async function getMembership() {
  const result = await db.query(
    `select id, tier, "startsAt", "endsAt", "starBalance", "isActive"
       from "Membership"
      where "userId" = $1
      order by "updatedAt" desc
      limit 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function cleanup() {
  await db.query(`delete from "UsageLog" where "userId" = $1`, [userId]);
  await db.query(`delete from "User" where id = $1`, [userId]);
}

await db.connect();

try {
  await cleanup();
  const userCookie = await login(testEmail);
  const initialMembership = await getMembership();
  const initialBalance = Number(initialMembership?.starBalance ?? 10);

  const first = await createAndPay(userCookie, "monthly");
  const firstMembership = await getMembership();
  assert(firstMembership?.tier === "MONTHLY" && firstMembership.isActive, "首次购买后没有开通月度会员。");
  assert(firstMembership.endsAt, "首次购买后没有会员到期时间。");
  assert(Number(firstMembership.starBalance) === initialBalance + 350, "首次购买星力发放不正确。");
  const firstEndsAt = new Date(firstMembership.endsAt).getTime();

  const second = await createAndPay(userCookie, "monthly");
  const renewedMembership = await getMembership();
  const renewedEndsAt = new Date(renewedMembership.endsAt).getTime();
  assert(renewedMembership.tier === "MONTHLY", "同档续费后会员等级异常。");
  assert(renewedEndsAt - firstEndsAt >= 29 * 24 * 60 * 60 * 1000, "同档续费没有从原到期日顺延。");

  const upgraded = await createAndPay(userCookie, "pro_monthly");
  const upgradedMembership = await getMembership();
  const upgradedEndsAt = new Date(upgradedMembership.endsAt).getTime();
  assert(upgradedMembership.tier === "PRO", "升档购买后没有立即升级。");
  assert(upgradedEndsAt - renewedEndsAt >= 29 * 24 * 60 * 60 * 1000, "升档后会员周期没有顺延。");

  const duplicatePay = await request(`/api/payments/mock/orders/${upgraded.orderId}/pay`, {
    method: "POST",
    cookie: userCookie,
  });
  assert(duplicatePay.response.ok && duplicatePay.body?.ok, "重复支付请求没有幂等返回成功。");
  const walletGrantCount = await db.query(
    `select count(*)::int as count from "WalletTransaction" where "orderId" = $1 and type = 'GRANT'`,
    [upgraded.orderId],
  );
  assert(walletGrantCount.rows[0].count === 1, "重复支付产生了重复星力发放。");

  const downgrade = await request("/api/payments/mock/orders", {
    method: "POST",
    cookie: userCookie,
    body: { productCode: "monthly" },
  });
  assert(
    downgrade.response.status === 409 && downgrade.body?.code === "MEMBERSHIP_DOWNGRADE_BLOCKED",
    "高等级会员购买低等级方案时没有被拦截。",
  );

  const adminCookie = await login(adminEmail);
  const refund = await request(`/api/admin/orders/${upgraded.orderId}/refund`, {
    method: "POST",
    cookie: adminCookie,
    body: { reason: "会员生命周期自动验收" },
  });
  assert(refund.response.ok && refund.body?.ok, `升档订单退款失败：${refund.body?.message}`);
  assert(refund.body.tierAfter === "MONTHLY", "升档订单退款后没有恢复到原会员等级。");
  const refundedMembership = await getMembership();
  assert(refundedMembership.tier === "MONTHLY", "退款后的数据库会员等级不正确。");
  assert(Math.abs(new Date(refundedMembership.endsAt).getTime() - renewedEndsAt) < 5000, "退款后会员到期时间没有回滚。");

  const duplicateRefund = await request(`/api/admin/orders/${upgraded.orderId}/refund`, {
    method: "POST",
    cookie: adminCookie,
    body: { reason: "会员生命周期重复退款验收" },
  });
  assert(duplicateRefund.response.ok && duplicateRefund.body?.alreadyRefunded, "重复退款没有幂等返回。");

  const staleOrder = await request("/api/payments/mock/orders", {
    method: "POST",
    cookie: userCookie,
    body: { productCode: "monthly" },
  });
  assert(staleOrder.response.ok && staleOrder.body?.ok, "待支付订单创建失败。");
  await db.query(
    `update "Order" set "createdAt" = now() - interval '31 minutes' where id = $1`,
    [staleOrder.body.order.id],
  );

  await db.query(
    `update "Membership" set "endsAt" = now() - interval '1 second' where id = $1`,
    [refundedMembership.id],
  );
  const expiry = await request("/api/internal/memberships/reconcile", {
    method: "POST",
    headers: { authorization: "Bearer local-membership-reconcile" },
  });
  assert(expiry.response.ok && expiry.body?.ok && expiry.body.expired >= 1, "会员到期任务没有处理测试会员。");
  assert(expiry.body.closedOrders >= 1, "超时未支付会员订单没有自动关闭。");
  const expiredMembership = await getMembership();
  assert(!expiredMembership.isActive, "会员到期后仍然处于有效状态。");
  const entitlementBalances = await db.query(
    `select coalesce(sum(balance), 0)::int as balance from "EntitlementAccount" where "userId" = $1`,
    [userId],
  );
  assert(entitlementBalances.rows[0].balance === 0, "会员到期后未使用额度没有清零。");

  const lifecycleEvents = await db.query(
    `select count(*)::int as count from "UsageLog" where "userId" = $1 and feature = 'membership_lifecycle'`,
    [userId],
  );
  assert(lifecycleEvents.rows[0].count >= 5, "会员生命周期审计记录不完整。");

  console.log("会员生命周期验收通过");
  console.log(JSON.stringify({
    activationOrderId: first.orderId,
    renewalOrderId: second.orderId,
    upgradeOrderId: upgraded.orderId,
    lifecycleEvents: lifecycleEvents.rows[0].count,
  }, null, 2));
} finally {
  await cleanup();
  await db.end();
}
