import type { MemberRole } from "@app/shared";
import type { Bindings } from "../env";

// WS 認可フォールバック用の短命 signed ticket（cookie 不達経路、§3.5/C1）。
// 一次経路は api が付与する x-conn-meta。ticket は HMAC-SHA256(BETTER_AUTH_SECRET) 署名。
export interface TicketPayload {
  eventId: string;
  userId: string;
  role: MemberRole;
  exp: number; // epoch ms
}

const TTL_MS = 60_000;
const enc = new TextEncoder();

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueWsTicket(
  env: Bindings,
  input: { eventId: string; userId: string; role: MemberRole },
): Promise<string> {
  const payload: TicketPayload = { ...input, exp: Date.now() + TTL_MS };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await hmac(env.BETTER_AUTH_SECRET, body);
  return `${body}.${sig}`;
}

export async function verifyWsTicket(
  secret: string,
  ticket: string,
  nowMs: number,
): Promise<TicketPayload | null> {
  const dot = ticket.indexOf(".");
  if (dot < 0) return null;
  const body = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  const expected = await hmac(secret, body);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body)) as TicketPayload;
    if (typeof payload.exp !== "number" || payload.exp < nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}
