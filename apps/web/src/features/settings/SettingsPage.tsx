import { Box } from "@yamada-ui/react/components/box";
import { Button } from "@yamada-ui/react/components/button";
import { Heading } from "@yamada-ui/react/components/heading";
import { Input } from "@yamada-ui/react/components/input";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { useEffect, useState } from "react";
import { useUpdateEvent } from "../../hooks/mutations/useUpdateEvent";
import { useEventDetail } from "../../hooks/useEventDetail";

export function SettingsPage({ eventId }: { eventId: string }) {
  const { data } = useEventDetail(eventId);
  const update = useUpdateEvent(eventId);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    if (data) {
      setTitle(data.event.title);
      setSlug(data.event.publicSlug ?? "");
    }
  }, [data]);

  const save = () => {
    update.mutate({
      title: title.trim(),
      publicSlug: slug.trim() === "" ? null : slug.trim(),
    });
  };

  const publicUrl =
    slug.trim() !== ""
      ? `${typeof location !== "undefined" ? location.origin : ""}/e/${slug.trim()}`
      : null;

  return (
    <VStack p="md" gap="md" maxW="640px" mx="auto" align="stretch">
      <Heading size="lg">設定</Heading>
      <VStack gap="xs" align="stretch">
        <Text fontSize="sm" fontWeight="medium">
          イベント名
        </Text>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </VStack>
      <VStack gap="xs" align="stretch">
        <Text fontSize="sm" fontWeight="medium">
          公開URL slug
        </Text>
        <Input
          placeholder="techconf-2026"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
        {publicUrl ? (
          <Text fontSize="sm" color="muted">
            公開URL: {publicUrl}（公開ページは Phase2）
          </Text>
        ) : null}
      </VStack>
      <Button
        colorScheme="primary"
        disabled={title.trim().length === 0 || update.isPending}
        onClick={save}
      >
        保存
      </Button>
      {update.isError ? (
        <Text color="red.500" fontSize="sm">
          保存に失敗しました（slug 重複・権限をご確認ください）。
        </Text>
      ) : null}
      <Box borderTopWidth="1px" pt="md">
        <Text fontSize="sm" color="muted">
          QR 共有・公開ページは Phase2 で追加予定です。
        </Text>
      </Box>
    </VStack>
  );
}
