import { createFileRoute } from "@tanstack/react-router";
import { LiveDashboard } from "../../features/live-dashboard/LiveDashboard";

export const Route = createFileRoute("/_authed/events/$eventId/")({
  component: () => {
    const { eventId } = Route.useParams();
    return <LiveDashboard eventId={eventId} />;
  },
});
