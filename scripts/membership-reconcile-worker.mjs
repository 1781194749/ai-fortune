const apiUrl = process.env.MEMBERSHIP_RECONCILE_URL ?? "http://ai-fortune:3000/api/internal/memberships/reconcile";
const intervalMs = Math.max(60_000, Number(process.env.MEMBERSHIP_RECONCILE_INTERVAL_MS) || 300_000);
const secret = process.env.MEMBERSHIP_RECONCILE_SECRET ?? process.env.CRON_SECRET;

if (!secret) {
  throw new Error("MEMBERSHIP_RECONCILE_SECRET is required.");
}

async function runOnce() {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Membership reconcile failed (${response.status}): ${body}`);
  }

  console.log(`[membership-reconcile] ${new Date().toISOString()} ${body}`);
}

while (true) {
  try {
    await runOnce();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }

  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
