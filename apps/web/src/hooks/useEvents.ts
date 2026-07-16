import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { unwrap } from "../lib/api-error";
import type { EventList } from "../lib/api-types";
import { qk } from "../lib/query";

// qk.events（GET /events）。loader が prefetch 済み。一覧の単一読み取り口。
export const useEvents = () =>
  useQuery({
    queryKey: qk.events(),
    queryFn: async () => unwrap<EventList>(await api().api.events.$get()),
  });
