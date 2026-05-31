import { Box } from "@yamada-ui/react/components/box";
import { Button } from "@yamada-ui/react/components/button";
import { HStack, VStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import { toDataURL } from "qrcode";
import { useEffect, useState } from "react";

export type QRShareProps = { publicUrl: string; title?: string };

// 公開URL を QR + コピーで参加者へ共有。クライアントのみ（useEffect で QR 生成）。
export function QRShare({ publicUrl, title }: QRShareProps) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void toDataURL(publicUrl, { width: 200, margin: 1 })
      .then((url) => {
        if (alive) setDataUrl(url);
      })
      .catch(() => {
        if (alive) setDataUrl("");
      });
    return () => {
      alive = false;
    };
  }, [publicUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard 不可環境 */
    }
  };

  return (
    <VStack gap="sm" align="center">
      {title ? <Text fontWeight="medium">{title}</Text> : null}
      {dataUrl ? (
        <Box
          as="img"
          src={dataUrl}
          alt={`${publicUrl} の QR コード`}
          boxSize="200px"
        />
      ) : (
        <Text color="muted" fontSize="sm">
          QR を生成中…
        </Text>
      )}
      <Text fontSize="sm" color="muted" wordBreak="break-all" textAlign="center">
        {publicUrl}
      </Text>
      <HStack>
        <Button size="sm" colorScheme="primary" onClick={() => void copy()}>
          {copied ? "コピーしました" : "URL をコピー"}
        </Button>
      </HStack>
    </VStack>
  );
}
