import { Modal } from "antd";

import type { BoardState, PlayerState } from "../shared/GameUtils";

export function getDisconnectedPlayers(
  board: BoardState
): PlayerState[] {
  return board.players.filter((player) => player.disconnected);
}

export function getPlayersWhoLostConnection(
  board: BoardState
): PlayerState[] {
  return board.players.filter(
    (player) => player.disconnected && player.hasLeftRoom !== true
  );
}

export function confirmRoomActionWithDisconnectedPlayers({
  action,
  disconnectedPlayers,
  okText,
  onConfirm,
  title,
}: {
  action: string;
  disconnectedPlayers: PlayerState[];
  okText: string;
  onConfirm: () => void;
  title: string;
}): void {
  if (disconnectedPlayers.length === 0) {
    onConfirm();
    return;
  }

  Modal.confirm({
    title,
    content: getDisconnectedPlayersRemainMessage(
      action,
      disconnectedPlayers
    ),
    okText,
    cancelText: "Cancel",
    onOk: onConfirm,
  });
}

export function getDisconnectedPlayerNames(
  disconnectedPlayers: PlayerState[]
): string {
  return disconnectedPlayers
    .map((player) => player.name || "Unnamed player")
    .join(", ");
}

function getDisconnectedPlayersRemainMessage(
  action: string,
  disconnectedPlayers: PlayerState[]
): string {
  const isPlural = disconnectedPlayers.length !== 1;
  const names = getDisconnectedPlayerNames(disconnectedPlayers);
  return `${names} ${
    isPlural ? "are" : "is"
  } disconnected. ${action} will keep ${
    isPlural ? "their seats" : "their seat"
  } in the room so they can rejoin.`;
}
