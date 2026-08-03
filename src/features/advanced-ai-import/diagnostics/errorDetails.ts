type ErrorLike = Error & {
  cause?: unknown;
  code?: unknown;
  command?: unknown;
  cmd?: unknown;
  exitCode?: unknown;
  exit_code?: unknown;
  signal?: unknown;
  stderr?: unknown;
  stdout?: unknown;
};

export function serializeErrorDetails(error: unknown, depth = 0): Record<string, unknown> {
  if (depth > 5) return { message: "Cause chain exceeded diagnostic depth" };
  if (!(error instanceof Error)) return { name: "NonErrorThrown", message: String(error), value: safeValue(error) };
  const candidate = error as ErrorLike;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack || null,
    cause: candidate.cause == null ? null : serializeErrorDetails(candidate.cause, depth + 1),
    rendererDetails: {
      implementation: "pdf-parse/PDFParse.getScreenshot + @napi-rs/canvas",
      command: candidate.command ?? candidate.cmd ?? null,
      exitCode: candidate.exitCode ?? candidate.exit_code ?? null,
      code: candidate.code ?? null,
      signal: candidate.signal ?? null,
      stderr: safeValue(candidate.stderr),
      stdout: safeValue(candidate.stdout),
    },
  };
}

function safeValue(value: unknown) {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value ?? null;
  try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
}
