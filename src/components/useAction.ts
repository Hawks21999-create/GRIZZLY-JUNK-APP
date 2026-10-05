"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Run a server action with a simple pending flag, then refresh the page data.
 * (Used instead of useTransition so a slow or interrupted background refresh
 * can never leave buttons stuck in a disabled state.)
 */
export function useAction(): [boolean, (fn: () => Promise<unknown>) => void] {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const run = useCallback(
    (fn: () => Promise<unknown>) => {
      if (busy.current) return;
      busy.current = true;
      setPending(true);
      fn()
        .catch((e) => console.error(e))
        .finally(() => {
          busy.current = false;
          setPending(false);
          router.refresh();
        });
    },
    [router],
  );
  return [pending, run];
}
