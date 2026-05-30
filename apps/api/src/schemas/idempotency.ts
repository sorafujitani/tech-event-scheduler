import { z } from "zod";

// hono のヘッダキーは小文字正規化される。RPC の header 型もこのキーで現れる。
export const idempotencyHeaderSchema = z.object({
  "idempotency-key": z.string().regex(/^[A-Za-z0-9._-]{8,128}$/),
});
