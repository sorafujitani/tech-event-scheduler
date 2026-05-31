import { Text } from "@yamada-ui/react/components/text";
import type { EventModule } from "../registry.types";

// Phase2 で実装。現状は拡張ポイントの placeholder（enabled 時のみ汎用ルートで表示）。
export const ostModule: EventModule = {
  moduleType: "ost",
  label: "OST",
  icon: "🗳",
  navOrder: 3,
  Page: () => (
    <Text p="md" color="muted">
      OST モジュールは準備中です。
    </Text>
  ),
};
