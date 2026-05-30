import { z } from "zod";

export const createCounterSchema = z.object({
  name: z.string().min(1).max(40),
  capacity: z.number().int().positive().nullable().optional(),
});

export const adjustSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, "delta must be non-zero"),
});
