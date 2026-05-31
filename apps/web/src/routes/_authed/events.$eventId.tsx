import type { FullSnapshot } from "@app/shared";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { EventDetailSkeleton } from "../../components/feedback/Skeletons";
import { EventDetailTabsShell } from "../../features/event-shell/EventDetailTabsShell";
import { unwrap } from "../../lib/api-error";
import type { EventDetail } from "../../lib/api-types";
import { LiveProvider } from "../../lib/live/react/LiveProvider";
import { qk } from "../../lib/query";

export const Route = createFileRoute("/_authed/events/$eventId")({
  loader: async ({ context, params }) => {
    const { apiClient, queryClient } = context;
    const eventId = params.eventId;
    // 並列 prefetch: 詳細メタ + 初回 FullSnapshot。どちらも REST。WS は張らない（design §5.1）。
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: qk.event(eventId),
        queryFn: async () => {
          const res = await apiClient.api.events[":eventId"].$get({
            param: { eventId },
          });
          if (res.status === 404) throw notFound();
          return unwrap<EventDetail>(res);
        },
      }),
      queryClient.prefetchQuery({
        queryKey: qk.eventLive(eventId),
        staleTime: Number.POSITIVE_INFINITY, // 以後は LiveStore が権威
        queryFn: async () =>
          unwrap<FullSnapshot>(
            await apiClient.api.events[":eventId"].live.$get({
              param: { eventId },
            }),
          ),
      }),
    ]);
    return { eventId };
  },
  component: EventDetailRoute,
  pendingComponent: EventDetailSkeleton,
});

function EventDetailRoute() {
  const { eventId } = Route.useParams();
  const { apiClient } = Route.useRouteContext();
  return (
    <LiveProvider eventId={eventId} apiClient={apiClient}>
      <EventDetailTabsShell eventId={eventId} />
    </LiveProvider>
  );
}
