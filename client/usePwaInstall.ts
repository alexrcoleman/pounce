import { useCallback, useEffect, useState } from "react";

import { cacheOfflineAssets, isOfflineCacheReady } from "./offlineCache";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function usePwaInstall() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isCheckingOfflineReady, setIsCheckingOfflineReady] = useState(true);
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [message, setMessage] = useState("");
  const [installContext, setInstallContext] = useState<InstallContext>({
    isAndroid: false,
    isChrome: false,
    isIOS: false,
    isMobile: false,
    isStandalone: false,
    shouldUseSafari: false,
  });

  useEffect(() => {
    let isMounted = true;
    const isPwaSupported = "serviceWorker" in navigator && "caches" in window;
    setIsSupported(isPwaSupported);
    setInstallContext(getInstallContext());
    if (isPwaSupported) {
      isOfflineCacheReady()
        .then((isReady) => {
          if (isMounted) {
            setIsOfflineReady(isReady);
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsCheckingOfflineReady(false);
          }
        });
    } else {
      setIsCheckingOfflineReady(false);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setMessage("");
    };
    const onAppInstalled = () => {
      setInstallPrompt(null);
      setMessage("Pounce was added to your home screen.");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      isMounted = false;
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const addToHomeScreen = useCallback(async () => {
    setMessage("");

    if (installContext.isStandalone) {
      setMessage("Pounce is already on your home screen.");
      return;
    }

    if (installContext.isIOS) {
      if (installContext.shouldUseSafari) {
        setMessage(
          "Open this page in Safari, then tap Share and Add to Home Screen."
        );
      } else {
        setMessage("Tap Share, then Add to Home Screen.");
      }
      return;
    }

    if (!installPrompt) {
      setMessage("Use your browser's install option to add Pounce.");
      return;
    }

    setIsInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") {
        setMessage("Pounce is being added to your home screen.");
      } else {
        setMessage("Home screen install was dismissed.");
      }
    } catch (error) {
      console.warn("Unable to install Pounce", error);
      setMessage("Home screen install did not finish.");
    } finally {
      setIsInstalling(false);
    }
  }, [installContext, installPrompt]);

  const downloadForOffline = useCallback(async () => {
    setIsPreparing(true);
    setMessage("");
    try {
      if (!isSupported) {
        setMessage("Offline download is not supported in this browser.");
        return;
      }

      setMessage("Offline files are being saved.");
      await waitForServiceWorkerReady();
      await cacheOfflineAssets();
      const isReady = await isOfflineCacheReady();
      setIsOfflineReady(isReady);
      if (!isReady) {
        setMessage("Some offline files could not be saved. Try again online.");
        return;
      }

      if (installContext.isIOS && installContext.isStandalone) {
        setMessage("Pounce is saved and ready for offline play.");
      } else {
        setMessage("Offline files are ready.");
      }
    } catch (error) {
      console.warn("Unable to prepare Pounce for offline use", error);
      setMessage("Offline setup did not finish. Try again while online.");
    } finally {
      setIsPreparing(false);
    }
  }, [installContext, isSupported]);

  return {
    addToHomeScreen,
    canInstall: installPrompt != null,
    downloadForOffline,
    installContext,
    isCheckingOfflineReady,
    isInstalling,
    isOfflineReady,
    isPreparing,
    isSupported,
    message,
  };
}

type InstallContext = {
  isAndroid: boolean;
  isChrome: boolean;
  isIOS: boolean;
  isMobile: boolean;
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
  const isAndroid = /Android/.test(userAgent);
  const isChrome =
    /Chrome|CriOS/.test(userAgent) &&
    !/Edg|EdgiOS|OPR|OPiOS|SamsungBrowser/.test(userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true;
  const isSafari =
    /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);

  return {
    isAndroid,
    isChrome,
    isIOS,
    isMobile: isIOS || isAndroid,
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
