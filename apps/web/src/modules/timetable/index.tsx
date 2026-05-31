import { TimetablePage } from "../../features/timetable/TimetablePage";
import type { EventModule } from "../registry.types";

export const timetableModule: EventModule = {
  moduleType: "timetable",
  label: "進行表",
  icon: "🗓",
  navOrder: 1,
  Page: TimetablePage,
};
