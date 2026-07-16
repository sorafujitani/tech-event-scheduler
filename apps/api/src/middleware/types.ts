import type { Auth } from "../auth";
import type { Bindings } from "../env";

type Session = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;

/** requireSession 済みサブルーター用（/events 直下） */
export type AuthedEnv = {
  Bindings: Bindings;
  Variables: { user: Session["user"]; session: Session["session"] };
};

/** requireEventMember を更に積むサブルーター用（/events/:eventId 配下） */
export type MemberEnv = {
  Bindings: Bindings;
  Variables: AuthedEnv["Variables"] & {
    eventId: string;
    member: { role: "owner" | "manager"; userId: string };
  };
};
