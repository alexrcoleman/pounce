import { toast } from "sonner";

import type { RoomToast } from "../shared/RoomToast";

export function showRoomToast(roomToast: RoomToast) {
  const options = {
    description: roomToast.description,
    duration: roomToast.tone === "warning" ? 5000 : 3000,
  };

  if (roomToast.tone === "warning") {
    toast.warning(roomToast.message, options);
    return;
  }

  toast(roomToast.message, options);
}
