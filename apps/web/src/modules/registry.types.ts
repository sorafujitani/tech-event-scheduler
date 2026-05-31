import type { ModuleSnapshot, ModuleType } from "@app/shared";
import type { FC, ReactNode } from "react";

export type ModuleSnapshotOf<T extends ModuleType> = Extract<
  ModuleSnapshot,
  { moduleType: T }
>;
export type ModuleLiveCardProps = {
  eventId: string;
  snapshot: ModuleSnapshot | undefined;
};
export type ModulePageProps = { eventId: string };

export type EventModule = {
  moduleType: ModuleType;
  label: string; // アイコン+ラベル両表示（屋外誤認防止）
  icon: ReactNode;
  LiveCard?: FC<ModuleLiveCardProps>; // Live サマリーカード（任意）
  Page: FC<ModulePageProps>; // タブ本体（必須）
  navOrder?: number;
};
