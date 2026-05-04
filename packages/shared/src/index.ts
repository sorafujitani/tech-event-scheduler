import { Temporal } from "temporal-polyfill";
import { z } from "zod";

export { Temporal };

export const Email = z.email();
export type Email = z.infer<typeof Email>;

export const NonEmptyString = z.string().min(1);
export type NonEmptyString = z.infer<typeof NonEmptyString>;

export type Instant = Temporal.Instant;
export type ZonedDateTime = Temporal.ZonedDateTime;
export type PlainDate = Temporal.PlainDate;
export type Duration = Temporal.Duration;

const temporalSchema = <T>(parse: (s: string) => T, label: string) =>
  z
    .string()
    .refine(
      (s) => {
        try {
          parse(s);
          return true;
        } catch {
          return false;
        }
      },
      { message: `Invalid ${label}` },
    )
    .transform(parse);

export const InstantString = temporalSchema(
  (s) => Temporal.Instant.from(s),
  "ISO 8601 instant",
);

export const ZonedDateTimeString = temporalSchema(
  (s) => Temporal.ZonedDateTime.from(s),
  "ZonedDateTime string",
);

export const PlainDateString = temporalSchema(
  (s) => Temporal.PlainDate.from(s),
  "ISO 8601 plain date",
);

export const dateToInstant = (d: Date): Temporal.Instant =>
  Temporal.Instant.fromEpochMilliseconds(d.getTime());

export const instantToDate = (i: Temporal.Instant): Date =>
  new Date(i.epochMilliseconds);
