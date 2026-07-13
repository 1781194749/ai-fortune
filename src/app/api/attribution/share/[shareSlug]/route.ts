import { recordShareAttributionLanding } from "@/lib/share-attribution";
import { resolveShareTrackingSource } from "@/lib/share-tracking";

export async function POST(
  request: Request,
  context: { params: Promise<{ shareSlug: string }> },
) {
  const { shareSlug } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        source?: string;
        utm_source?: string;
        utm_medium?: string;
        utm_campaign?: string;
      }
    | null;
  const source = resolveShareTrackingSource({
    source: body?.source,
    utm_source: body?.utm_source,
    utm_medium: body?.utm_medium,
    utm_campaign: body?.utm_campaign,
  });

  const log = await recordShareAttributionLanding({
    shareSlug,
    source,
    referrer: request.headers.get("referer") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  if (!log) {
    return Response.json({ ok: false, message: "分享报告不存在或不可访问。" }, { status: 404 });
  }

  return Response.json({ ok: true, source });
}
