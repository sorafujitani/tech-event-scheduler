import { createMiddleware } from "hono/factory";
import { DomainError } from "../errors";
import { createDb } from "@app/db";
import { getMembership } from "../repo/members";
import type { MemberEnv } from "./types";

/**
 * イベントの member（active）であることを要求し、c.var.eventId / c.var.member をセットする。
 * min="owner" の場合は owner ロールも要求する。判定は active 行のみ（getMembership）。
 */
export const requireEventMember = (min: "manager" | "owner" = "manager") =>
  createMiddleware<MemberEnv>(async (c, next) => {
    const eventId = c.req.param("eventId");
    if (!eventId) throw new DomainError("NOT_FOUND", "event not found");
    // 多段に積まれても（manager → owner）membership クエリは 1 リクエスト 1 回。
    let member: MemberEnv["Variables"]["member"] | undefined =
      c.get("eventId") === eventId ? c.get("member") : undefined;
    if (!member) {
      const db = createDb(c.env.DB);
      const row = await getMembership(db, eventId, c.var.user.id);
      if (!row) throw new DomainError("FORBIDDEN", "not a member");
      member = { role: row.role, userId: c.var.user.id };
    }
    if (min === "owner" && member.role !== "owner") {
      throw new DomainError("FORBIDDEN", "owner only");
    }
    c.set("eventId", eventId);
    c.set("member", member);
    await next();
  });
