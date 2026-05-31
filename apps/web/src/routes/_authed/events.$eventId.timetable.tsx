import { createFileRoute } from "@tanstack/react-router";
import { TimetablePage } from "../../features/timetable/TimetablePage";

export const Route = createFileRoute("/_authed/events/$eventId/timetable")({
  component: () => {
    const { eventId } = Route.useParams();
    return <TimetablePage eventId={eventId} />;
  },
});
