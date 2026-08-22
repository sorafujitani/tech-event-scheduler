// Sync Cloudflare Worker Secrets for apps/api from a local env file.
//
// Usage:
//   bun run scripts/cloudflare-secrets.ts sync [--env-file apps/api/.env]
//   bun run scripts/cloudflare-secrets.ts list
//
// - sync  : reads KEY=VALUE pairs from the env file and pipes each required
//           secret into `wrangler secret put KEY` (production Worker).
// - list  : shows which secrets are registered on the production Worker.
//
// Secret values are never printed. The env file itself must stay untracked
// by git (apps/api/.env is already gitignored).

const ROOT = new URL("../", import.meta.url).pathname;
const API_CONFIG = "apps/api/wrangler.jsonc";
const DEFAULT_ENV_FILE = "apps/api/.env";
const REQUIRED_API_SECRETS = [
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

type JsonRecord = Record<string, unknown>;

const report = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const asRecord = (value: unknown, label: string): JsonRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as JsonRecord;
};

const parseEnvFile = (content: string): Map<string, string> => {
  const values = new Map<string, string>();
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key in values) continue;
    values.set(key, value);
  }
  return values;
};

const readEnvValues = async (envFile: string): Promise<Map<string, string>> => {
  const file = Bun.file(`${ROOT}${envFile}`);
  if (!(await file.exists())) {
    throw new Error(
      `${envFile} not found. Create it (see apps/api/.env.example) before syncing.`,
    );
  }
  return parseEnvFile(await file.text());
};

const runWranglerWithStdin = async (
  args: string[],
  input: string,
  label: string,
): Promise<string> => {
  const child = Bun.spawn(["bun", "x", "wrangler", ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    stdin: new Response(input),
    env: process.env,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${label} failed\n${stderr.trim() || stdout.trim()}`);
  }
  return stdout;
};

const runWrangler = async (args: string[], label: string): Promise<string> => {
  const child = Bun.spawn(["bun", "x", "wrangler", ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${label} failed\n${stderr.trim() || stdout.trim()}`);
  }
  return stdout;
};

const putSecret = async (key: string, value: string): Promise<void> => {
  await runWranglerWithStdin(
    ["secret", "put", key, "--config", API_CONFIG],
    value,
    `wrangler secret put ${key}`,
  );
};

const listSecrets = async (): Promise<void> => {
  const stdout = await runWrangler(
    ["secret", "list", "--config", API_CONFIG],
    "wrangler secret list",
  );
  let parsed: unknown = stdout;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // fall through with raw output
  }
  if (Array.isArray(parsed)) {
    const names = parsed
      .map((entry) => asRecord(entry, "secret entry").name)
      .filter((name): name is string => typeof name === "string");
    report(`Registered secrets (${names.length}):`);
    for (const name of names) report(`  - ${name}`);
    const missing = REQUIRED_API_SECRETS.filter((key) => !names.includes(key));
    if (missing.length > 0) {
      report(`Missing required secrets: ${missing.join(", ")}`);
    } else {
      report("All required secrets are registered.");
    }
    return;
  }
  report(stdout.trim());
};

const syncSecrets = async (envFile: string): Promise<void> => {
  const values = await readEnvValues(envFile);
  const missingInFile = REQUIRED_API_SECRETS.filter(
    (key) => !values.has(key) || (values.get(key) ?? "").length === 0,
  );
  if (missingInFile.length > 0) {
    throw new Error(
      `${envFile} is missing values for: ${missingInFile.join(", ")}`,
    );
  }

  report(`Syncing ${REQUIRED_API_SECRETS.length} secrets to ${API_CONFIG}...`);
  for (const key of REQUIRED_API_SECRETS) {
    process.stdout.write(`  putting ${key} ... `);
    await putSecret(key, values.get(key) as string);
    report("done");
  }
  report("Secret sync complete.");
};

const main = async (): Promise<number> => {
  const command = process.argv[2];
  const envFlagIndex = process.argv.indexOf("--env-file");
  const envFile =
    envFlagIndex >= 0
      ? (process.argv[envFlagIndex + 1] ?? DEFAULT_ENV_FILE)
      : DEFAULT_ENV_FILE;

  try {
    if (command === "sync") {
      await syncSecrets(envFile);
      return 0;
    }
    if (command === "list") {
      await listSecrets();
      return 0;
    }
    report(
      "Usage: bun run scripts/cloudflare-secrets.ts <sync|list> [--env-file apps/api/.env]",
    );
    return 1;
  } catch (error) {
    report(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

process.exitCode = await main();
