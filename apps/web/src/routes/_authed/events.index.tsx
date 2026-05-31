import { EventStatus } from "@app/shared";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ListSkeleton } from "../../components/feedback/Skeletons";
import { EventListPage } from "../../features/events-list/EventListPage";
import { unwrap } from "../../lib/api-error";
import type { EventList } from "../../lib/api-types";
import { qk } from "../../lib/query";

export const Route = createFileRoute("/_authed/events/")({
  validateSearch: z.object({
    status: EventStatus.optional(),
    q: z.string().optional(),
  }),
  loader: async ({ context }) => {
    // REST snapshot を Query に prefetch（SSR=service binding / browser=origin直、context.apiClient に閉じ込め）。
    await context.queryClient.prefetchQuery({
      queryKey: qk.events(),
      queryFn: async () =>
        unwrap<EventList>(await context.apiClient.api.events.$get()),
    });
  },
  component: EventListPage,
  pendingComponent: ListSkeleton,
});
