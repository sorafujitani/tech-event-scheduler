import { Button } from "@yamada-ui/react/components/button";
import { Card } from "@yamada-ui/react/components/card";
import { Input } from "@yamada-ui/react/components/input";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { useState } from "react";
import { PageContainer } from "../../components/layout/PageContainer";
import { Field } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { QRShare } from "../../components/share/QRShare";
import { publicEventUrl } from "../../lib/public-url";
import { useUpdateEvent } from "../../hooks/mutations/useUpdateEvent";
import { useEventDetail } from "../../hooks/useEventDetail";

export function SettingsPage({ eventId }: { eventId: string }) {
  const { data } = useEventDetail(eventId);

  const savedPublicUrl = publicEventUrl(data?.event.publicSlug ?? "");

  return (
    <PageContainer>
      <VStack gap="lg" align="stretch">
        <PageHeader
          title="設定"
          description="イベント名と参加者向け公開 URL を管理します。"
        />
        {data ? (
          // key でイベント切替時のみ draft を初期化（refetch では編集中の値を保持）。
          <SettingsForm
            key={data.event.id}
            eventId={eventId}
            initialTitle={data.event.title}
            initialSlug={data.event.publicSlug ?? ""}
            savedPublicUrl={savedPublicUrl}
          />
        ) : null}
        <Panel p="md">
          <Text fontSize="sm" fontWeight="semibold" mb="sm">
            参加者向け共有
          </Text>
          {savedPublicUrl ? (
            <QRShare publicUrl={savedPublicUrl} />
          ) : (
            <Text fontSize="sm" color="fg.muted">
              公開URL slug を保存すると QR を共有できます（公開ページは Phase2）。
            </Text>
          )}
        </Panel>
      </VStack>
    </PageContainer>
  );
}

function SettingsForm({
  eventId,
  initialTitle,
  initialSlug,
  savedPublicUrl,
}: {
  eventId: string;
  initialTitle: string;
  initialSlug: string;
  savedPublicUrl: string | null;
}) {
  const update = useUpdateEvent(eventId);
  const [title, setTitle] = useState(initialTitle);
  const [slug, setSlug] = useState(initialSlug);

  const save = () => {
    update.mutate({
      title: title.trim(),
      publicSlug: slug.trim() === "" ? null : slug.trim(),
    });
  };

  return (
    <Card.Root variant="panel">
      <Card.Header fontSize="md" fontWeight="semibold">
        基本情報
      </Card.Header>
      <Card.Body gap="md">
        <Field label="イベント名">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field
          label="公開URL slug"
          hint={
            savedPublicUrl
              ? `公開URL: ${savedPublicUrl}（公開ページは Phase2）`
              : "英数字とハイフンで指定します。"
          }
        >
          <Input
            placeholder="techconf-2026"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </Field>
        <Button
          colorScheme="primary"
          disabled={title.trim().length === 0 || update.isPending}
          onClick={save}
        >
          保存
        </Button>
        {update.isError ? (
          <Text color="red.600" fontSize="sm">
            保存に失敗しました（slug 重複・権限をご確認ください）。
          </Text>
        ) : null}
      </Card.Body>
    </Card.Root>
  );
}
