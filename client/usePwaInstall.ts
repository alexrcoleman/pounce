import { useCallback, useEffect, useState } from "react";

import { cacheOfflineAssets } from "./offlineCache";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function usePwaInstall() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported("serviceWorker" in navigator && "caches" in window);
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const downloadForOffline = useCallback(async () => {
    setIsPreparing(true);
    try {
      if (installPrompt) {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
      }
      await navigator.serviceWorker?.ready;
      await cacheOfflineAssets();
      setIsOfflineReady(true);
    } finally {
      setIsPreparing(false);
    }
  }, [installPrompt]);

  return {
    canInstall: installPrompt != null,
    downloadForOffline,
    isOfflineReady,
    isPreparing,
    isSupported,
  };
}
