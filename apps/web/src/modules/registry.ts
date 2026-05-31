import type { ModuleType } from "@app/shared";
import { attendanceModule } from "./attendance";
import { ostModule } from "./ost";
import type { EventModule } from "./registry.types";
import { timetableModule } from "./timetable";

// Record で「全 moduleType を網羅」を型強制（enum 拡張時に登録漏れがコンパイルエラー）。
export const moduleRegistry: Record<ModuleType, EventModule> = {
  timetable: timetableModule,
  attendance: attendanceModule,
  ost: ostModule,
};

export const getModule = (t: ModuleType): EventModule | undefined =>
  moduleRegistry[t];

export type ActiveModule = {
  moduleType: ModuleType;
  orderIndex: number;
  module: EventModule;
};

export const resolveActiveModules = (
  enabled: { moduleType: ModuleType; orderIndex: number }[],
): ActiveModule[] =>
  enabled
    .map((e) => ({ ...e, module: moduleRegistry[e.moduleType] }))
    .filter((e): e is ActiveModule => e.module != null) // DB に未知 type があっても安全無視
    .sort(
      (a, b) =>
        (a.module.navOrder ?? a.orderIndex) -
        (b.module.navOrder ?? b.orderIndex),
    );
