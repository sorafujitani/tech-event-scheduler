type Level = "info" | "warn" | "error";

// 構造化ログ 1 行 JSON（wrangler observability で収集）。PII（email）は出さず userId まで。
export function log(
  level: Level,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  // oxlint-disable-next-line no-console
  console[level === "error" ? "error" : "log"](
    JSON.stringify({ level, event, ...fields }),
  );
}
