import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../../features/settings/SettingsPage";

export const Route = createFileRoute("/_authed/events/$eventId/settings")({
  component: () => {
    const { eventId } = Route.useParams();
    return <SettingsPage eventId={eventId} />;
  },
});
