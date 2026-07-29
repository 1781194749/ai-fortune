import "server-only";

import { isDatabaseUnavailableError } from "@/lib/prisma";

type PublicApiErrorOptions = {
  context: string;
  message: string;
  status?: number;
  unavailableMessage?: string;
};

export function logPublicApiError(context: string, error: unknown) {
  console.error(`[public-api] ${context}`, error);
}

export function publicApiErrorResponse(error: unknown, options: PublicApiErrorOptions) {
  logPublicApiError(options.context, error);

  if (isDatabaseUnavailableError(error)) {
    return Response.json(
      {
        ok: false,
        message: options.unavailableMessage ?? "服务暂时不可用，请稍后重试。",
      },
      { status: 503 },
    );
  }

  return Response.json(
    { ok: false, message: options.message },
    { status: options.status ?? 500 },
  );
}
