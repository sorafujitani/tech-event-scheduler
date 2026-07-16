import { z } from "zod";

export const adjustSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, "delta must be non-zero"),
});
