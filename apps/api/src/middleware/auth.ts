import { createMiddleware } from "hono/factory";
import { getAuth, type Auth } from "../auth";
import { DomainError } from "../errors";
import type { Bindings } from "../env";

type AuthResult = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
type AuthVariables = {
  user: AuthResult["user"];
  session: AuthResult["session"];
};

export const requireSession = createMiddleware<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>(async (c, next) => {
  const auth = getAuth(c.env);
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) {
    // 統一エラー形 {error, code}（M2）に合わせて onError 経由で正規化する
    throw new DomainError("UNAUTHORIZED", "Unauthorized");
  }
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
});
