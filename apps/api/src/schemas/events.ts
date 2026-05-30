import { eventInsertSchema } from "@app/db/zod";
import { z } from "zod";

export const createEventSchema = eventInsertSchema
  .pick({ title: true, timezone: true, startsAtMs: true })
  .extend({
    title: z.string().min(1).max(120),
    timezone: z.string().min(1).default("Asia/Tokyo"),
    startsAtMs: z.number().int().positive().optional(),
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const patchEventSchema = eventInsertSchema
  .pick({
    title: true,
    startsAtMs: true,
    publicSlug: true,
    externalUrl: true,
  })
  .partial();
export type PatchEventInput = z.infer<typeof patchEventSchema>;
