import type { ScheduleItemKind } from "@app/shared";
import { Button } from "@yamada-ui/react/components/button";
import { Drawer } from "@yamada-ui/react/components/drawer";
import { Input } from "@yamada-ui/react/components/input";
import { Select } from "@yamada-ui/react/components/select";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { useEffect, useState } from "react";
import { Field } from "../../components/ui/Field";
import type { UseSchedule } from "../../hooks/mutations/useSchedule";
import type { EventDetail } from "../../lib/api-types";
import { KIND_OPTIONS, minutesOf } from "./constants";

type ScheduleItemRow = EventDetail["items"][number];

// セッション編集用の下部 Drawer。draft 状態は item 切替時にリセットする。
export function ScheduleItemEditor({
  item,
  update,
  onClose,
}: {
  item: ScheduleItemRow | null;
  update: UseSchedule["update"];
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [min, setMin] = useState("10");
  const [kind, setKind] = useState<ScheduleItemKind>("session");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setMin(String(Math.round(item.plannedDurationSec / 60)));
    setKind(item.kind);
    setError(null);
  }, [item]);

  const save = () => {
    if (!item) return;
    const t = title.trim();
    if (!t) return;
    setError(null);
    update.mutate(
      {
        itemId: item.id,
        patch: {
          title: t,
          plannedDurationSec: minutesOf(min) * 60,
          kind,
        },
      },
      {
        onSuccess: onClose,
        onError: () => setError("保存に失敗しました。"),
      },
    );
  };

  return (
    <Drawer.Root placement="block-end" open={item !== null} onClose={onClose}>
      <Drawer.Overlay />
      <Drawer.Content>
        <Drawer.CloseButton />
        <Drawer.Header>セッションを編集</Drawer.Header>
        <Drawer.Body>
          {item ? (
            <VStack gap="md" align="stretch">
              <Field label="タイトル">
                <Input
                  placeholder="タイトル"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <HStack gap="md" align="flex-end">
                <Field label="所要時間">
                  <HStack>
                    <Input
                      type="number"
                      w="6rem"
                      min={1}
                      value={min}
                      onChange={(e) => setMin(e.target.value)}
                    />
                    <Text color="fg.muted">分</Text>
                  </HStack>
                </Field>
                <Field label="種別">
                  <Select.Root
                    w="8rem"
                    items={KIND_OPTIONS}
                    value={kind}
                    onChange={(v) => setKind(v as ScheduleItemKind)}
                  />
                </Field>
              </HStack>
              {error ? (
                <Text color="red.600" fontSize="sm">
                  {error}
                </Text>
              ) : null}
            </VStack>
          ) : null}
        </Drawer.Body>
        <Drawer.Footer>
          <Button
            w="full"
            colorScheme="primary"
            disabled={!title.trim() || update.isPending}
            onClick={save}
          >
            保存
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer.Root>
  );
}
