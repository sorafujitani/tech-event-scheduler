import { ModuleType } from "@app/shared";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Text } from "@yamada-ui/react/components/text";
import { getModule } from "../../modules/registry";

// 汎用モジュールルート（新ルートファイル追加不要・1枚で全モジュール Page を描画）。
export const Route = createFileRoute(
  "/_authed/events/$eventId/modules/$moduleType",
)({
  parseParams: ({ moduleType }) => ({ moduleType: ModuleType.parse(moduleType) }),
  component: () => {
    const { eventId, moduleType } = Route.useParams();
    const mod = getModule(moduleType);
    if (!mod) throw notFound();
    const Page = mod.Page;
    return <Page eventId={eventId} />;
  },
  notFoundComponent: () => (
    <Text p="md" color="muted">
      モジュールが見つかりません。
    </Text>
  ),
});
