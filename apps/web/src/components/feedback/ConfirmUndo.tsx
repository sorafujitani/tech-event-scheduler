import { Button } from "@yamada-ui/react/components/button";
import { HStack } from "@yamada-ui/react/components/stack";
import { Text } from "@yamada-ui/react/components/text";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

const UNDO_MS = 5000;

interface ConfirmUndoValue {
  /** label を 5 秒 Undo 付きで表示し、未取り消しなら action を実行する（破壊的操作の遅延実行）。 */
  run: (label: string, action: () => void) => void;
}
const Ctx = createContext<ConfirmUndoValue | null>(null);

export const useConfirmUndo = (): ConfirmUndoValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConfirmUndo outside ConfirmUndoProvider");
  return v;
};

export function ConfirmUndoProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const action = useRef<(() => void) | null>(null);

  const run = useCallback(
    (nextLabel: string, nextAction: () => void) => {
      // 連続操作: 前の保留を先に確定してから新規を予約。
      if (timer.current) {
        clearTimeout(timer.current);
        action.current?.();
      }
      action.current = nextAction;
      setLabel(nextLabel);
      timer.current = setTimeout(() => {
        action.current?.();
        action.current = null;
        timer.current = null;
        setLabel(null);
      }, UNDO_MS);
    },
    [],
  );

  const undo = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    action.current = null;
    setLabel(null);
  }, []);

  return (
    <Ctx.Provider value={{ run }}>
      {children}
      {label != null ? (
        <HStack
          role="status"
          aria-live="polite"
          position="fixed"
          left="50%"
          transform="translateX(-50%)"
          bottom="calc(80px + env(safe-area-inset-bottom))"
          zIndex={50}
          bg={["blackAlpha.800", "whiteAlpha.800"]}
          color={["white", "black"]}
          rounded="full"
          px="lg"
          py="sm"
          gap="md"
          boxShadow="lg"
        >
          <Text fontSize="sm">{label}</Text>
          <Button size="sm" variant="ghost" colorScheme="primary" onClick={undo}>
            取り消す
          </Button>
        </HStack>
      ) : null}
    </Ctx.Provider>
  );
}
