import { Link } from "@tanstack/react-router";
import { Box } from "@yamada-ui/react/components/box";
import { Button } from "@yamada-ui/react/components/button";
import { Card } from "@yamada-ui/react/components/card";
import { Input } from "@yamada-ui/react/components/input";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { useEffect, useState } from "react";
import { PageContainer } from "../../components/layout/PageContainer";
import { Field } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { QRShare } from "../../components/share/QRShare";
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

  const origin = typeof location !== "undefined" ? location.origin : "";
  const publicUrl = slug.trim() !== "" ? `${origin}/e/${slug.trim()}` : null;
  const savedSlug = data?.event.publicSlug ?? "";
  const savedPublicUrl = savedSlug !== "" ? `${origin}/e/${savedSlug}` : null;

  return (
    <PageContainer>
      <VStack gap="lg" align="stretch">
        <PageHeader
          title="設定"
          description="イベント名と参加者向け公開 URL を管理します。"
        />
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
                publicUrl
                  ? `公開URL: ${publicUrl}（公開ページは Phase2）`
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
