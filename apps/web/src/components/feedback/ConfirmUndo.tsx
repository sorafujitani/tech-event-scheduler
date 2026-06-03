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
import { Panel } from "../ui/Panel";

const UNDO_MS = 5000;

interface ConfirmUndoValue {
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

  const run = useCallback((nextLabel: string, nextAction: () => void) => {
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
  }, []);

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
        <Panel
          as="div"
          role="status"
          aria-live="polite"
          variant="elevated"
          position="fixed"
          left="50%"
          transform="translateX(-50%)"
          bottom="calc(80px + env(safe-area-inset-bottom))"
          zIndex={50}
          px="md"
          py="sm"
          maxW="calc(100vw - 2rem)"
        >
          <HStack gap="md" align="center">
            <Text fontSize="sm">{label}</Text>
            <Button size="sm" variant="subtle" colorScheme="primary" onClick={undo}>
              取り消す
            </Button>
          </HStack>
        </Panel>
      ) : null}
    </Ctx.Provider>
  );
}
