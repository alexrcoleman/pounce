import { ClientToServerEvents } from "../shared/SocketTypes";

export type GameSocket = {
  emit<Event extends keyof ClientToServerEvents>(
    event: Event,
    ...args: Parameters<ClientToServerEvents[Event]>
  ): void;
  close(): void;
};
