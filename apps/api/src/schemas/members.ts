import { MemberRole } from "@app/shared";
import { z } from "zod";

// MVP: 既存ユーザーを userId で直接アサイン（メール招待は Phase2）。
export const assignMemberSchema = z.object({
  userId: z.string().min(1),
  role: MemberRole.default("manager"),
});
export type AssignMemberInput = z.infer<typeof assignMemberSchema>;

export const patchMemberRoleSchema = z.object({
  role: MemberRole,
});
export type PatchMemberRoleInput = z.infer<typeof patchMemberRoleSchema>;
