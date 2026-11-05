/** Turns an API error into a short, human message (never shows stack traces). */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const e = error as { status?: number; data?: { error?: unknown; issues?: { path?: string; message?: string }[] } } | null;
  if (!e || typeof e !== "object") return fallback;
  if (e.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  const issue = e.data?.issues?.[0];
  if (issue?.message) return issue.path ? `${issue.path}: ${issue.message}` : issue.message;
  if (typeof e.data?.error === "string") return e.data.error;
  return fallback;
}

export const isUnauthorized = (error: unknown) => (error as { status?: number } | null)?.status === 401;
