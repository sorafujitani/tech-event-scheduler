import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { account, session, user, verification } from "./schema/auth";
import { event, eventMember } from "./schema/event";
import { scheduleItem } from "./schema/schedule";
import { attendanceCounter, attendanceEvent } from "./schema/attendance";
import { eventModule } from "./schema/module";

export const userSelectSchema = createSelectSchema(user);
export const userInsertSchema = createInsertSchema(user);

export const sessionSelectSchema = createSelectSchema(session);
export const sessionInsertSchema = createInsertSchema(session);

export const accountSelectSchema = createSelectSchema(account);
export const accountInsertSchema = createInsertSchema(account);

export const verificationSelectSchema = createSelectSchema(verification);
export const verificationInsertSchema = createInsertSchema(verification);

export const eventSelectSchema = createSelectSchema(event);
export const eventInsertSchema = createInsertSchema(event);

export const eventMemberSelectSchema = createSelectSchema(eventMember);
export const eventMemberInsertSchema = createInsertSchema(eventMember);

export const scheduleItemSelectSchema = createSelectSchema(scheduleItem);
export const scheduleItemInsertSchema = createInsertSchema(scheduleItem);

export const attendanceCounterSelectSchema =
  createSelectSchema(attendanceCounter);
export const attendanceCounterInsertSchema =
  createInsertSchema(attendanceCounter);

export const attendanceEventSelectSchema = createSelectSchema(attendanceEvent);
export const attendanceEventInsertSchema = createInsertSchema(attendanceEvent);

export const eventModuleSelectSchema = createSelectSchema(eventModule);
export const eventModuleInsertSchema = createInsertSchema(eventModule);
