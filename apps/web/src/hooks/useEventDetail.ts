import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { unwrap } from "../lib/api-error";
import type { EventDetail } from "../lib/api-types";
import { qk } from "../lib/query";

// qk.event（GET /events/:eventId）。loader が prefetch 済み。定義系の単一読み取り口。
export const useEventDetail = (eventId: string) =>
  useQuery({
    queryKey: qk.event(eventId),
    queryFn: async () =>
      unwrap<EventDetail>(
        await api().api.events[":eventId"].$get({ param: { eventId } }),
      ),
  });
