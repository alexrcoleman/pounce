import { useEffect, useState } from "react";

export type NetworkInformationSnapshot = {
  isSupported: boolean;
  downlinkMbps: number | null;
  effectiveType: string | null;
  rttMs: number | null;
  saveData: boolean;
};

type NetworkInformationLike = EventTarget & {
  downlink?: number;
  effectiveType?: string;
  rtt?: number;
  saveData?: boolean;
};

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
};

const UNSUPPORTED_NETWORK_INFORMATION: NetworkInformationSnapshot = {
  isSupported: false,
  downlinkMbps: null,
  effectiveType: null,
  rttMs: null,
  saveData: false,
};

export default function useNetworkInformation(): NetworkInformationSnapshot {
  const [snapshot, setSnapshot] = useState(getNetworkInformationSnapshot);

  useEffect(() => {
    const connection = getNetworkInformation();
    if (!connection) {
      setSnapshot(UNSUPPORTED_NETWORK_INFORMATION);
      return;
    }

    const updateSnapshot = () => setSnapshot(getNetworkInformationSnapshot());
    updateSnapshot();
    connection.addEventListener("change", updateSnapshot);
    return () => {
      connection.removeEventListener("change", updateSnapshot);
    };
  }, []);

  return snapshot;
}

export function getNetworkSummary(
  info: NetworkInformationSnapshot
): string | null {
  if (!info.isSupported) {
    return null;
  }

  if (info.effectiveType && info.downlinkMbps != null) {
    return `${info.effectiveType} ${formatDownlinkMbps(info.downlinkMbps)}`;
  }
  if (info.effectiveType) {
    return info.effectiveType;
  }
  if (info.downlinkMbps != null) {
    return formatDownlinkMbps(info.downlinkMbps);
  }
  if (info.rttMs != null) {
    return `${info.rttMs} ms radio`;
  }
  if (info.saveData) {
    return "Save-Data";
  }
  return null;
}

export function getNetworkInformationTitle(
  info: NetworkInformationSnapshot
): string | null {
  if (!info.isSupported) {
    return null;
  }

  const parts: string[] = [];
  if (info.effectiveType) {
    parts.push(`connection ${info.effectiveType}`);
  }
  if (info.downlinkMbps != null) {
    parts.push(`estimated downlink ${formatDownlinkMbps(info.downlinkMbps)}`);
  }
  if (info.rttMs != null) {
    parts.push(`network RTT ${info.rttMs} ms`);
  }
  if (info.saveData) {
    parts.push("Save-Data enabled");
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function getNetworkInformationSnapshot(): NetworkInformationSnapshot {
  const connection = getNetworkInformation();
  if (!connection) {
    return UNSUPPORTED_NETWORK_INFORMATION;
  }

  return {
    isSupported: true,
    downlinkMbps: normalizeNumber(connection.downlink),
    effectiveType:
      typeof connection.effectiveType === "string"
        ? connection.effectiveType
        : null,
    rttMs: normalizeNumber(connection.rtt),
    saveData: connection.saveData === true,
  };
}

function getNetworkInformation(): NetworkInformationLike | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const nav = navigator as NavigatorWithConnection;
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDownlinkMbps(downlinkMbps: number): string {
  if (downlinkMbps >= 10) {
    return `${Math.round(downlinkMbps)} Mb/s`;
  }
  return `${downlinkMbps.toFixed(1)} Mb/s`;
}
