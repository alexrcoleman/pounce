import { useEffect, useRef } from "react";
import { useRouter } from "next/router";

import {
  getRouteAnalyticsMetadata,
  useStatsigLogger,
} from "./analytics";

export default function StatsigRouteLogger() {
  const router = useRouter();
  const logStatsigEvent = useStatsigLogger();
  const lastLoggedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!router.isReady || lastLoggedPathRef.current === router.asPath) {
      return;
    }

    lastLoggedPathRef.current = router.asPath;
    logStatsigEvent(
      "route_loaded",
      getRouteAnalyticsMetadata(router.pathname, router.asPath)
    );
  }, [
    logStatsigEvent,
    router.asPath,
    router.isReady,
    router.pathname,
  ]);

  return null;
}
