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
  const [message, setMessage] = useState("");
  const [installContext, setInstallContext] = useState<InstallContext>({
    isIOS: false,
    isStandalone: false,
    shouldUseSafari: false,
  });

  useEffect(() => {
    setIsSupported("serviceWorker" in navigator && "caches" in window);
    setInstallContext(getInstallContext());
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setMessage("");
    };
    const onAppInstalled = () => {
      setInstallPrompt(null);
      setIsOfflineReady(true);
      setMessage("Pounce is installed and ready offline.");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const downloadForOffline = useCallback(async () => {
    setIsPreparing(true);
    setMessage("");
    let installAccepted = false;
    try {
      if (installPrompt) {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        setInstallPrompt(null);
        if (choice.outcome === "accepted") {
          installAccepted = true;
        }
      } else if (isSupported) {
        setMessage("Offline files are being saved.");
      }

      await waitForServiceWorkerReady();
      await cacheOfflineAssets();
      setIsOfflineReady(true);
      if (installAccepted) {
        setMessage("Pounce is installing and offline files are ready.");
      } else if (installContext.isIOS && installContext.isStandalone) {
        setMessage("Pounce is saved and ready for offline play.");
      } else if (installContext.isIOS && installContext.shouldUseSafari) {
        setMessage(
          "Offline files are ready. Open this page in Safari, then tap Share and Add to Home Screen."
        );
      } else if (installContext.isIOS) {
        setMessage(
          "Offline files are ready. Tap Share, then Add to Home Screen."
        );
      } else {
        setMessage("Offline files are ready.");
      }
    } catch (error) {
      console.warn("Unable to prepare Pounce for offline use", error);
      setMessage("Offline setup did not finish. Try again while online.");
    } finally {
      setIsPreparing(false);
    }
  }, [installPrompt, isSupported]);

  return {
    canInstall: installPrompt != null,
    downloadForOffline,
    installContext,
    isOfflineReady,
    isPreparing,
    isSupported,
    message,
  };
}

type InstallContext = {
  isIOS: boolean;
  isStandalone: boolean;
  shouldUseSafari: boolean;
};

function getInstallContext(): InstallContext {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  const userAgent = navigator.userAgent;
  const isTouchMac =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || isTouchMac;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true;
  const isSafari =
    /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);

  return {
    isIOS,
    isStandalone,
    shouldUseSafari: isIOS && !isSafari,
  };
}

async function waitForServiceWorkerReady() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      return;
    }
    await withTimeout(navigator.serviceWorker.ready, 5000);
  } catch (error) {
    console.warn("Service worker was not ready before offline caching", error);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("Timed out waiting for service worker")),
      timeoutMs
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
