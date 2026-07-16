import { webOrigin } from "./env";

// 参加者向け公開ページ URL（/e/:slug）の唯一の生成点。
export const publicEventUrl = (slug: string): string | null => {
  const trimmed = slug.trim();
  if (trimmed === "") return null;
  return `${webOrigin()}/e/${trimmed}`;
};
