import "server-only";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function settleOptionalSideEffects(
  label: string,
  tasks: Array<Promise<unknown>>,
) {
  const results = await Promise.allSettled(tasks);
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (failures.length > 0) {
    console.warn(
      `${label} optional side effect failed: ${failures
        .map((failure) => errorMessage(failure.reason))
        .join("; ")}`,
    );
  }
}
