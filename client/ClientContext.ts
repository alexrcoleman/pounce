import React from "react";
import SocketState from "./SocketState";
import { ClientSocket } from "./useGameSocket";

export const ClientContext = React.createContext<
  | {
      socket: ClientSocket | null;
      state: SocketState;
    }
  | undefined
>(undefined);

export function useClientContext() {
  const context = React.useContext(ClientContext);
  if (!context) {
    throw new Error("Used useClientContext outside of a ClientContextProvider");
  }
  return context;
}
