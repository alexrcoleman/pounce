import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./PwaRegistration.module.css";

const SKIP_WAITING_MESSAGE = "SKIP_WAITING";
const DEV_SERVICE_WORKER_RELOAD_KEY = "pounce::devServiceWorkerReloaded";

export default function PwaRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const shouldReloadOnControllerChangeRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      unregisterDevelopmentServiceWorkers();
      return;
    }

    let isDisposed = false;
    const cleanupCallbacks: Array<() => void> = [];

    const showUpdatePrompt = (worker: ServiceWorker) => {
      if (!isDisposed) {
        setWaitingWorker(worker);
      }
    };

    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      if (!worker) {
        return;
      }

      const onStateChange = () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdatePrompt(worker);
        }
      };

      worker.addEventListener("statechange", onStateChange);
      cleanupCallbacks.push(() =>
        worker.removeEventListener("statechange", onStateChange)
      );
      onStateChange();
    };

    const checkForUpdate = () => {
      registrationRef.current?.update().catch((error) => {
        console.warn("Unable to check for service worker update", error);
      });
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          updateViaCache: "none",
        });
        if (isDisposed) {
          return;
        }

        registrationRef.current = registration;
        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdatePrompt(registration.waiting);
        }
        watchInstallingWorker(registration.installing);

        const onUpdateFound = () => {
          watchInstallingWorker(registration.installing);
        };
        registration.addEventListener("updatefound", onUpdateFound);
        cleanupCallbacks.push(() =>
          registration.removeEventListener("updatefound", onUpdateFound)
        );

        checkForUpdate();
      } catch (error) {
        console.warn("Unable to register service worker", error);
      }
    };

    const onControllerChange = () => {
      if (!shouldReloadOnControllerChangeRef.current) {
        return;
      }
      shouldReloadOnControllerChangeRef.current = false;
      window.location.reload();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForUpdate();
      }
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", onVisibilityChange);
    cleanupCallbacks.push(
      () =>
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          onControllerChange
        ),
      () => window.removeEventListener("focus", checkForUpdate),
      () => document.removeEventListener("visibilitychange", onVisibilityChange)
    );

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      cleanupCallbacks.push(() => window.removeEventListener("load", register));
    }

    return () => {
      isDisposed = true;
      cleanupCallbacks.forEach((cleanup) => cleanup());
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker || isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    shouldReloadOnControllerChangeRef.current = true;
    waitingWorker.postMessage({ type: SKIP_WAITING_MESSAGE });
  }, [isRefreshing, waitingWorker]);

  if (!waitingWorker) {
    return null;
  }

  return (
    <div className={styles.toast}>
      <span aria-live="polite">New update available</span>
      <button
        className={styles.button}
        type="button"
        onClick={applyUpdate}
        disabled={isRefreshing}
      >
        {isRefreshing ? "Updating" : "Update"}
      </button>
    </div>
  );
}

async function unregisterDevelopmentServiceWorkers() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) {
      sessionStorage.removeItem(DEV_SERVICE_WORKER_RELOAD_KEY);
      return;
    }

    await Promise.all(
      registrations.map((registration) => registration.unregister())
    );

    if (
      navigator.serviceWorker.controller &&
      sessionStorage.getItem(DEV_SERVICE_WORKER_RELOAD_KEY) !== "true"
    ) {
      sessionStorage.setItem(DEV_SERVICE_WORKER_RELOAD_KEY, "true");
      window.location.reload();
    }
  } catch (error) {
    console.warn("Unable to unregister development service worker", error);
  }
}
