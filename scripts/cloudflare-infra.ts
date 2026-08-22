const ROOT = new URL("../", import.meta.url).pathname;
const API_CONFIG = "apps/api/wrangler.jsonc";
const WEB_CONFIG = "apps/web/wrangler.jsonc";
const PLACEHOLDER_DATABASE_ID = "00000000-0000-0000-0000-000000000000";
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

const asArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be a JSON array`);
  return value;
};

const run = async (args: string[], label: string): Promise<string> => {
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

const runJson = async (args: string[], label: string): Promise<unknown> => {
  const stdout = await run(args, label);
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
};

const readConfiguredResource = async (): Promise<{
  databaseId: string;
  databaseName: string;
}> => {
  const config = await Bun.file(`${ROOT}${API_CONFIG}`).text();
  const name = config.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
  const id = config.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
  if (!name || !id) {
    throw new Error(`${API_CONFIG} must declare database_name and database_id`);
  }
  return { databaseId: id, databaseName: name };
};

const listDatabases = async (): Promise<JsonRecord[]> => {
  const value = await runJson(
    ["d1", "list", "--json", "--config", API_CONFIG],
    "D1 inventory",
  );
  return asArray(value, "D1 inventory").map((item) =>
    asRecord(item, "D1 database"),
  );
};

const findDatabase = (
  databases: JsonRecord[],
  databaseName: string,
): JsonRecord | undefined =>
  databases.find((database) => database.name === databaseName);

const verifyDatabase = async (): Promise<void> => {
  const configured = await readConfiguredResource();
  const database = findDatabase(await listDatabases(), configured.databaseName);
  if (!database) {
    throw new Error(
      `D1 database ${configured.databaseName} is missing in the authenticated account`,
    );
  }
  if (database.uuid !== configured.databaseId) {
    throw new Error(
      `D1 id mismatch: config=${configured.databaseId}, remote=${String(database.uuid)}`,
    );
  }
  report(`ok D1 ${configured.databaseName} (${configured.databaseId})`);
};

const verifySecrets = async (): Promise<void> => {
  const value = await runJson(
    ["secret", "list", "--format", "json", "--config", API_CONFIG],
    "API Worker secret inventory",
  );
  const names = new Set(
    asArray(value, "API Worker secrets").map((item) => {
      const secret = asRecord(item, "Worker secret");
      return String(secret.name);
    }),
  );
  const missing = REQUIRED_API_SECRETS.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`missing API Worker secrets: ${missing.join(", ")}`);
  }
  report(`ok API Worker secrets (${REQUIRED_API_SECRETS.join(", ")})`);
};

const verifyWorker = async (configPath: string, label: string): Promise<void> => {
  const value = await runJson(
    ["versions", "list", "--json", "--config", configPath],
    `${label} version inventory`,
  );
  const versions = asArray(value, `${label} versions`);
  if (versions.length === 0) throw new Error(`${label} has no deployed versions`);

  const latest = asRecord(versions.at(-1), `${label} latest version`);
  report(`ok ${label} latest version ${String(latest.id)}`);
};

const check = async (): Promise<void> => {
  await verifyDatabase();
  await verifySecrets();
  await verifyWorker(API_CONFIG, "API Worker");
  await verifyWorker(WEB_CONFIG, "Web Worker");
};

const bootstrap = async (): Promise<void> => {
  const configured = await readConfiguredResource();
  const database = findDatabase(await listDatabases(), configured.databaseName);

  if (database) {
    if (database.uuid !== configured.databaseId) {
      throw new Error(
        `D1 ${configured.databaseName} already exists with id ${String(database.uuid)}, ` +
          `but ${API_CONFIG} contains ${configured.databaseId}; refusing to modify either resource`,
      );
    }
    report(`D1 ${configured.databaseName} already exists; nothing to create`);
    return;
  }

  if (configured.databaseId !== PLACEHOLDER_DATABASE_ID) {
    throw new Error(
      `${API_CONFIG} points to ${configured.databaseId}, but that D1 is not visible in the ` +
        "authenticated account; refusing to create a duplicate database",
    );
  }

  process.stdout.write(
    await run(
      ["d1", "create", configured.databaseName, "--config", API_CONFIG],
      "D1 bootstrap",
    ),
  );
};

const main = async (): Promise<void> => {
  const command = process.argv[2];
  if (command === "check") return check();
  if (command === "bootstrap") return bootstrap();
  throw new Error("usage: bun run scripts/cloudflare-infra.ts <check|bootstrap>");
};

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
