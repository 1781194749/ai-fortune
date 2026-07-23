import "server-only";

type HeaderReader = Pick<Headers, "get">;

function normalizeOrigin(value: string | null | undefined) {
  const raw = value?.trim();

  if (!raw) {
    return undefined;
  }

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const hostname = url.hostname.toLowerCase();
    const isLoopback =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1";
    const isWildcard = hostname === "0.0.0.0" || hostname === "::";

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      isWildcard ||
      (process.env.NODE_ENV === "production" && (isLoopback || url.protocol !== "https:"))
    ) {
      return undefined;
    }

    return url.origin;
  } catch {
    return undefined;
  }
}

function getForwardedOrigin(headers: HeaderReader | undefined) {
  if (!headers) {
    return undefined;
  }

  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))
    ?.split(",")[0]
    ?.trim();
  const protocol = headers.get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim() || (process.env.NODE_ENV === "production" ? "https" : "http");

  return host ? normalizeOrigin(`${protocol}://${host}`) : undefined;
}

function getRequestOrigin(requestUrl: string | undefined) {
  if (!requestUrl) {
    return undefined;
  }

  try {
    return normalizeOrigin(new URL(requestUrl).origin);
  } catch {
    return undefined;
  }
}

export function resolvePublicAppOrigin(input: {
  headers?: HeaderReader;
  requestUrl?: string;
} = {}) {
  const configuredCandidates = [
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL),
    normalizeOrigin(process.env.APP_URL),
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? normalizeOrigin(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
      : undefined,
  ];

  if (process.env.NODE_ENV === "production") {
    return configuredCandidates.find(Boolean) ?? "https://xuanji.click";
  }

  const requestCandidates = [
    getForwardedOrigin(input.headers),
    getRequestOrigin(input.requestUrl),
  ];

  return [...configuredCandidates, ...requestCandidates].find(Boolean) ?? "http://localhost:3000";
}
