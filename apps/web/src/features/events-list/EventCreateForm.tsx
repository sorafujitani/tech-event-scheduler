import { Button } from "@yamada-ui/react/components/button";
import { Card } from "@yamada-ui/react/components/card";
import { Input } from "@yamada-ui/react/components/input";
import { VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { useState } from "react";
import { PageContainer } from "../../components/layout/PageContainer";
import { AppShell } from "../../components/shell/AppShell";
import { Field } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { useCreateEvent } from "../../hooks/mutations/useCreateEvent";

export function EventCreateForm() {
  const [title, setTitle] = useState("");
  const create = useCreateEvent();
  const canSubmit = title.trim().length > 0 && !create.isPending;

  return (
    <AppShell>
      <PageContainer>
      <VStack gap="lg" align="stretch" maxW="480px">
        <PageHeader
          title="イベント新規作成"
          description="作成後、進行表タブからセッションを追加できます。"
        />
        <Card.Root variant="panel">
          <Card.Body gap="md">
            <Field label="イベント名">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: TechConf 2026"
                autoFocus
              />
            </Field>
            <Button
              colorScheme="primary"
              w="full"
              disabled={!canSubmit}
              onClick={() =>
                create.mutate({ title: title.trim(), timezone: "Asia/Tokyo" })
              }
            >
              作成
            </Button>
            {create.isError ? (
              <Text color="red.600" fontSize="sm">
                作成に失敗しました。時間をおいて再試行してください。
              </Text>
            ) : null}
          </Card.Body>
        </Card.Root>
      </VStack>
      </PageContainer>
    </AppShell>
  );
}
