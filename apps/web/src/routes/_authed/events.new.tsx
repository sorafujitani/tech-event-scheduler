import { createFileRoute } from "@tanstack/react-router";
import { EventCreateForm } from "../../features/events-list/EventCreateForm";

export const Route = createFileRoute("/_authed/events/new")({
  component: EventCreateForm,
});
