import { useEffect, useRef, useContext } from 'react';
import { UNSAFE_NavigationContext as NavigationContext } from 'react-router-dom';

function useBlocker(blocker: (tx: any) => void, when: boolean = true) {
  const navigator = useContext(NavigationContext).navigator;
  const hasMounted = useRef(false);

  useEffect(() => {
    hasMounted.current = true;
  }, []);

  useEffect(() => {
    if (!when || !navigator?.block || !hasMounted.current) return; // Ignore error

    // @ts-expect-error: 'block' is an unstable API on navigator
    const unblock = navigator.block((tx: any) => {
      const autoUnblockingTx = {
      ...tx,
      retry() {
        unblock();
        tx.retry();
      },
      };
      blocker(autoUnblockingTx);
    });

    return unblock;
  }, [navigator, blocker, when]);
}

export default function useUnsavedChangesWarning(when: boolean) {
  useBlocker((tx) => {
    if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
      tx.retry();
    }
  }, when);
}
