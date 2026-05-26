import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  getServerDrainStage,
  getServerNoticeDescription,
  getServerNoticeTitle,
} from "../shared/ServerDrainNotice";
import type { ServerNotice } from "../shared/SocketTypes";

const SERVER_NOTICE_TOAST_ID = "server-notice";

export function showServerNoticeToast(notice: ServerNotice) {
  const stage = getServerDrainStage(notice.drainingUntil);
  const showToast = stage === "restarting" ? toast.error : toast.warning;
  showToast(<ServerNoticeTitle notice={notice} />, {
    description: <ServerNoticeDescription notice={notice} />,
    duration: stage === "restarting" ? Infinity : 15000,
    id: SERVER_NOTICE_TOAST_ID,
  });
}

function ServerNoticeTitle({ notice }: { notice: ServerNotice }) {
  const now = useCurrentSecond();
  return <>{getServerNoticeTitle(notice, now)}</>;
}

function ServerNoticeDescription({ notice }: { notice: ServerNotice }) {
  const now = useCurrentSecond();
  return <>{getServerNoticeDescription(notice, now)}</>;
}

function useCurrentSecond() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, 1000);
    update();
    return () => window.clearInterval(interval);
  }, []);

  return now;
}
