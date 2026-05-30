import { createMiddleware } from "hono/factory";
import { DomainError } from "../errors";
import { createDb } from "@app/db";
import { getMembership } from "../repo/members";
import type { MemberEnv } from "./types";

/**
 * イベントの member（active）であることを要求し、c.var.member をセットする。
 * min="owner" の場合は owner ロールも要求する。判定は active 行のみ（getMembership）。
 */
export const requireEventMember = (min: "manager" | "owner" = "manager") =>
  createMiddleware<MemberEnv>(async (c, next) => {
    const eventId = c.req.param("eventId");
    if (!eventId) throw new DomainError("NOT_FOUND", "event not found");
    const db = createDb(c.env.DB);
    const member = await getMembership(db, eventId, c.var.user.id);
    if (!member) throw new DomainError("FORBIDDEN", "not a member");
    if (min === "owner" && member.role !== "owner") {
      throw new DomainError("FORBIDDEN", "owner only");
    }
    c.set("member", { role: member.role, userId: c.var.user.id });
    await next();
  });
