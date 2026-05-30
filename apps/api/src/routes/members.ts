import { createDb } from "@app/db";
import { serializeRow } from "@app/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { DomainError } from "../errors";
import { requireEventMember } from "../middleware/event";
import type { MemberEnv } from "../middleware/types";
import * as membersRepo from "../repo/members";
import { assignMemberSchema, patchMemberRoleSchema } from "../schemas/members";

// 変更系(POST/PATCH/DELETE)は owner 限定。最後の owner 保護は repo の原子 SQL の戻り false を CONFLICT に。
const ownerMemberScoped = new Hono<MemberEnv>()
  .use(requireEventMember("owner"))
  .post("/", zValidator("json", assignMemberSchema), async (c) => {
    const db = createDb(c.env.DB);
    const { userId, role } = c.req.valid("json");
    const m = await membersRepo.addMember(
      db,
      c.req.param("eventId")!,
      userId,
      role,
      c.var.member.userId,
    );
    return c.json(serializeRow(m), 201);
  })
  .patch("/:userId", zValidator("json", patchMemberRoleSchema), async (c) => {
    const db = createDb(c.env.DB);
    const eventId = c.req.param("eventId")!;
    const userId = c.req.param("userId")!;
    const { role } = c.req.valid("json");
    const cur = await membersRepo.getMembership(db, eventId, userId);
    if (!cur) throw new DomainError("NOT_FOUND", "member not found");
    if (cur.role === role) return c.json({ ok: true } as const); // no-op
    if (role === "owner") {
      await membersRepo.promoteToOwner(db, eventId, userId);
    } else {
      const ok = await membersRepo.demoteOwnerAtomic(db, eventId, userId);
      if (!ok) throw new DomainError("CONFLICT", "cannot demote the last owner");
    }
    return c.json({ ok: true } as const);
  })
  .delete("/:userId", async (c) => {
    const db = createDb(c.env.DB);
    const ok = await membersRepo.deleteMemberAtomic(
      db,
      c.req.param("eventId")!,
      c.req.param("userId")!,
    );
    if (!ok) throw new DomainError("CONFLICT", "cannot remove the last owner");
    return c.json({ ok: true } as const);
  });

export const memberRoutes = new Hono<MemberEnv>()
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const rows = await membersRepo.listMembers(db, c.req.param("eventId")!);
    return c.json(rows.map(serializeRow));
  })
  .route("/", ownerMemberScoped);
