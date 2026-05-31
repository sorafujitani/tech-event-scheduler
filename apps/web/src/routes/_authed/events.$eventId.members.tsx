import { createFileRoute } from "@tanstack/react-router";
import { MembersPage } from "../../features/members/MembersPage";

export const Route = createFileRoute("/_authed/events/$eventId/members")({
  component: () => {
    const { eventId } = Route.useParams();
    return <MembersPage eventId={eventId} />;
  },
});
