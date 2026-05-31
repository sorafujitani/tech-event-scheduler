import { createFileRoute, redirect } from "@tanstack/react-router";

// "/" は /events へ。認証は _authed ガードが /login へ振り分ける。
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/events" });
  },
});
