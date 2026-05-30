import type { Database } from "@app/db";
import { eventMember } from "@app/db/schema";
import type { MemberRole } from "@app/shared";
import { and, eq, sql } from "drizzle-orm";
import { newId, nowDate } from "./ids";

// status='active' を WHERE に含めて active 行のみを決定的に引く。
// (eventId,userId) が将来 revoked+再 invite で複数行になっても誤 403 を出さない。
export async function getMembership(
  db: Database,
  eventId: string,
  userId: string,
) {
  const rows = await db
    .select()
    .from(eventMember)
    .where(
      and(
        eq(eventMember.eventId, eventId),
        eq(eventMember.userId, userId),
        eq(eventMember.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listMembers(db: Database, eventId: string) {
  return db.select().from(eventMember).where(eq(eventMember.eventId, eventId));
}

/**
 * 既存ユーザーを直接アサイン（MVP: メール招待は Phase2）。
 * (eventId,userId) の unique index で upsert し、revoked 行があっても active に戻す。
 */
export async function addMember(
  db: Database,
  eventId: string,
  userId: string,
  role: MemberRole,
  invitedByUserId: string,
) {
  const now = nowDate();
  const rows = await db
    .insert(eventMember)
    .values({
      id: newId(),
      eventId,
      userId,
      role,
      status: "active",
      invitedByUserId,
      invitedAt: now,
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [eventMember.eventId, eventMember.userId],
      set: { role, status: "active", acceptedAt: now, updatedAt: now },
    })
    .returning();
  // upsert は必ず 1 行返す
  return rows[0]!;
}

/** active な member を owner へ昇格。 */
export async function promoteToOwner(
  db: Database,
  eventId: string,
  userId: string,
): Promise<boolean> {
  const res = await db
    .update(eventMember)
    .set({ role: "owner", updatedAt: nowDate() })
    .where(
      and(
        eq(eventMember.eventId, eventId),
        eq(eventMember.userId, userId),
        eq(eventMember.status, "active"),
      ),
    )
    .returning({ id: eventMember.id });
  return res.length > 0;
}

// owner→manager 降格は owner が2人以上の時のみ（最後の owner を守る）。条件付き UPDATE で原子化。
export async function demoteOwnerAtomic(
  db: Database,
  eventId: string,
  userId: string,
): Promise<boolean> {
  const res = await db
    .update(eventMember)
    .set({ role: "manager", updatedAt: nowDate() })
    .where(sql`
      ${eventMember.eventId} = ${eventId} AND ${eventMember.userId} = ${userId}
      AND ${eventMember.status} = 'active' AND ${eventMember.role} = 'owner'
      AND (SELECT count(*) FROM ${eventMember}
           WHERE ${eventMember.eventId} = ${eventId}
             AND ${eventMember.role} = 'owner' AND ${eventMember.status} = 'active') > 1
    `)
    .returning({ id: eventMember.id });
  return res.length > 0;
}

// 最後の owner 保護：単一文 DELETE で原子化。影響 0 行 → route が CONFLICT(409)。
export async function deleteMemberAtomic(
  db: Database,
  eventId: string,
  userId: string,
): Promise<boolean> {
  const res = await db
    .delete(eventMember)
    .where(sql`
      ${eventMember.eventId} = ${eventId} AND ${eventMember.userId} = ${userId}
      AND ${eventMember.status} = 'active'
      AND ( ${eventMember.role} <> 'owner'
         OR (SELECT count(*) FROM ${eventMember}
             WHERE ${eventMember.eventId} = ${eventId}
               AND ${eventMember.role} = 'owner' AND ${eventMember.status} = 'active') > 1 )
    `)
    .returning({ id: eventMember.id });
  return res.length > 0;
}
