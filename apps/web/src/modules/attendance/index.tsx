import { Text } from "@yamada-ui/react/components/text";
import type { EventModule } from "../registry.types";

// 入場者数の操作は Live タブの CounterSection が担う。汎用モジュールルートからの
// 直接アクセス向けの最小 Page。
export const attendanceModule: EventModule = {
  moduleType: "attendance",
  label: "入場",
  icon: "👥",
  navOrder: 2,
  Page: () => (
    <Text p="md" color="muted">
      入場者数は Live タブで管理します。
    </Text>
  ),
};
