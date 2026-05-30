import { scheduleItemInsertSchema } from "@app/db/zod";
import { ScheduleItemKind } from "@app/shared";
import { z } from "zod";

// kind は drizzle-zod 推論が const タプル型に汚染されるため、shared の clean enum で上書きする
// （pick に kind を含めず extend で定義）。
export const createScheduleItemSchema = scheduleItemInsertSchema
  .pick({
    title: true,
    plannedDurationSec: true,
    track: true,
    orderIndex: true,
    speaker: true,
    note: true,
    plannedStartAtMs: true,
  })
  .extend({
    title: z.string().min(1).max(200),
    plannedDurationSec: z.number().int().positive(),
    kind: ScheduleItemKind.optional(),
  })
  .partial({
    track: true,
    orderIndex: true,
    speaker: true,
    note: true,
    plannedStartAtMs: true,
  });
export type CreateScheduleItemInput = z.infer<typeof createScheduleItemSchema>;

export const patchScheduleItemSchema = createScheduleItemSchema.partial();
export type PatchScheduleItemInput = z.infer<typeof patchScheduleItemSchema>;

export const reorderSchema = z.object({
  orderedItemIds: z.array(z.string()).min(1),
});
