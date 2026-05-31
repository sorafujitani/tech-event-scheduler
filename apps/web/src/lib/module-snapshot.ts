import type { ModuleSnapshot, ModuleType } from "@app/shared";

export const indexSnapshots = (
  snaps: ModuleSnapshot[],
): Partial<Record<ModuleType, ModuleSnapshot>> => {
  const out: Partial<Record<ModuleType, ModuleSnapshot>> = {};
  for (const s of snaps) out[s.moduleType] = s;
  return out;
};

export const assertNeverModule = (s: never): never => {
  throw new Error(`Unhandled ModuleSnapshot: ${JSON.stringify(s)}`);
};
