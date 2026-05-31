import React, { type ReactNode } from "react";

import type ClientSettingsStore from "./ClientSettingsStore";
import type { GameSocket } from "./GameConnection";
import type SocketState from "./SocketState";

type ClientContextValue = {
  settings: ClientSettingsStore;
  socket: GameSocket | null;
  state: SocketState;
};

export const ClientContext =
  React.createContext<ClientContextValue | undefined>(undefined);

export function ClientProvider({
  children,
  settings,
  socket,
  state,
}: ClientContextValue & { children: ReactNode }) {
  const value = React.useMemo(
    () => ({ settings, socket, state }),
    [settings, socket, state]
  );

  return React.createElement(ClientContext.Provider, { value }, children);
}

export function useClientContext() {
  const context = React.useContext(ClientContext);
  if (!context) {
    throw new Error("Used useClientContext outside of a ClientContextProvider");
  }
  return context;
}
