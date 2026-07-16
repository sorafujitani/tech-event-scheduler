import type { InferRequestType, InferResponseType } from "hono/client";
import type { api } from "./api-client";

type Client = ReturnType<typeof api>;

export type EventDetail = InferResponseType<
  Client["api"]["events"][":eventId"]["$get"],
  200
>;
export type EventList = InferResponseType<Client["api"]["events"]["$get"], 200>;
export type CreateEventInput = InferRequestType<
  Client["api"]["events"]["$post"]
>["json"];
