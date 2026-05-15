import React from "react";
import SocketState from "./SocketState";
import { GameSocket } from "./GameConnection";

export const ClientContext = React.createContext<
  | {
      socket: GameSocket | null;
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
