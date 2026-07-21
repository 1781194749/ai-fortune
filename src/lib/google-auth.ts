import "server-only";

import { createHash, randomBytes } from "crypto";
import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici";

const googleAuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenEndpoint = "https://oauth2.googleapis.com/token";
const googleUserInfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo";
const googleCallbackPath = "/api/auth/google/callback";
const googleProxyDispatcher =
  process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy
    ? new EnvHttpProxyAgent()
    : undefined;

export type GoogleUser = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

type GoogleRequestInit = NonNullable<Parameters<typeof undiciFetch>[1]>;

function googleFetch(url: string, init: GoogleRequestInit) {
  if (!googleProxyDispatcher) {
    return fetch(url, init as unknown as RequestInit);
  }

  return undiciFetch(url, {
    ...init,
    dispatcher: googleProxyDispatcher,
  });
}

function requiredConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured.");
  }

  return { clientId, clientSecret };
}

function configuredAppOrigin() {
  const appUrl = process.env.APP_URL?.trim();

  if (!appUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(appUrl);

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function getPublicAppOrigin(fallbackOrigin: string) {
  return configuredAppOrigin() ?? fallbackOrigin;
}

export function getGoogleRedirectUri(fallbackOrigin: string) {
  return new URL(googleCallbackPath, getPublicAppOrigin(fallbackOrigin)).toString();
}

export function isGoogleAuthConfigured() {
  return Boolean(
    process.env.AUTH_GOOGLE_ENABLED === "true" &&
      process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export function createGoogleOAuthAttempt() {
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { state, codeVerifier, codeChallenge };
}

export function buildGoogleAuthorizationUrl(input: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const { clientId } = requiredConfig();
  const url = new URL(googleAuthorizationEndpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url;
}

export async function exchangeGoogleCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  const { clientId, clientSecret } = requiredConfig();
  const response = await googleFetch(googleTokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
      code_verifier: input.codeVerifier,
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { access_token?: string } | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error("Google token exchange failed.");
  }

  return payload.access_token;
}

export async function getGoogleUser(accessToken: string) {
  const response = await googleFetch(googleUserInfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const user = (await response.json().catch(() => null)) as GoogleUser | null;

  if (!response.ok || !user?.sub || !user.email || !user.email_verified) {
    throw new Error("Google account email is unavailable or unverified.");
  }

  return user;
}
