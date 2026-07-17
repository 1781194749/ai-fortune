const defaultReturnTo = "/chat";
const localOrigin = "https://xuanji.local";

function hasControlCharacter(value: string) {
  return /[\u0000-\u001F\u007F]/.test(value);
}

export function sanitizeReturnTo(value: string | null | undefined, fallback = defaultReturnTo) {
  const fallbackPath = fallback.startsWith("/") && !fallback.startsWith("//") ? fallback : defaultReturnTo;
  const rawValue = value?.trim();

  if (!rawValue || hasControlCharacter(rawValue)) {
    return fallbackPath;
  }

  if (!rawValue.startsWith("/") || rawValue.startsWith("//")) {
    return fallbackPath;
  }

  try {
    const parsed = new URL(rawValue, localOrigin);

    if (parsed.origin !== localOrigin || parsed.pathname.startsWith("/api/")) {
      return fallbackPath;
    }

    if (parsed.pathname === "/login" || parsed.pathname.startsWith("/login/")) {
      return fallbackPath;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallbackPath;
  }
}

export function createLoginHref(returnTo: string, fallback = defaultReturnTo) {
  return `/login?returnTo=${encodeURIComponent(sanitizeReturnTo(returnTo, fallback))}`;
}
