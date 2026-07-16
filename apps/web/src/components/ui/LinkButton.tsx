import { createLink } from "@tanstack/react-router";
import { Box } from "@yamada-ui/react/components/box";
import { Button, IconButton } from "@yamada-ui/react/components/button";
import { type ComponentProps, forwardRef } from "react";

// `as={Link}` + spread は router の型付き `to` 検証を素通しするため、
// createLink で yamada コンポーネントを anchor 描画のままルータ型に接続する。
// forwardRef は router の viewport preload（IntersectionObserver）が anchor の
// ref を要求するために必要。
const AnchorButton = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof Button<"a">>
>((props, ref) => <Button as="a" ref={ref} {...props} />);

export const LinkButton = createLink(AnchorButton);

const AnchorIconButton = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof IconButton<"a">>
>((props, ref) => <IconButton as="a" ref={ref} {...props} />);

export const LinkIconButton = createLink(AnchorIconButton);

const AnchorBox = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof Box<"a">>
>((props, ref) => <Box as="a" ref={ref} {...props} />);

export const LinkBox = createLink(AnchorBox);
