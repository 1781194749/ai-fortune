export const adminSectionValues = [
  "overview",
  "users",
  "orders",
  "products",
  "assets",
  "ai",
  "risk",
  "reports",
] as const;

export type AdminSection = (typeof adminSectionValues)[number];

export function normalizeAdminSection(value: string | undefined): AdminSection {
  return adminSectionValues.includes(value as AdminSection)
    ? (value as AdminSection)
    : "overview";
}

export function buildAdminHref(input: {
  section?: AdminSection;
  token?: string;
  query?: string;
  status?: string;
}) {
  const params = new URLSearchParams();

  if (input.section && input.section !== "overview") {
    params.set("section", input.section);
  }

  if (input.token) {
    params.set("token", input.token);
  }

  if (input.query) {
    params.set("q", input.query);
  }

  if (input.status) {
    params.set("status", input.status);
  }

  const query = params.toString();

  return query ? `/admin?${query}` : "/admin";
}

export function buildProtectedAdminPath(path: string, token?: string) {
  if (!token) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}token=${encodeURIComponent(token)}`;
}
