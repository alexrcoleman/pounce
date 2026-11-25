import QRCode from "qrcode";

const PREFIX = "POUNCE-LAN-1.";
const CODE_LIMIT = 2400;
const CHANNEL = "pounce-lan-v1";

export type LanSignal = { room: string; type: "offer" | "answer"; sdp: string };
export type LanCode = { text: string; image: string };

export class LanPeer {
  private readonly connection = new RTCPeerConnection({ iceServers: [] });
  private channel: RTCDataChannel | null = null;
  private inbox: string[] = [];
  private listener: ((data: string) => void) | null = null;

  constructor(
    readonly role: "host" | "guest",
    readonly room: string,
    onStatus: (status: RTCPeerConnectionState) => void
  ) {
    this.connection.onconnectionstatechange = () => {
      const status = this.connection.connectionState;
      if (status !== "connected" || this.channel?.readyState === "open") onStatus(status);
    };
    const attach = (channel: RTCDataChannel) => {
      this.channel = channel;
      channel.onopen = () => onStatus("connected");
      channel.onclose = () => onStatus("closed");
      channel.onerror = () => onStatus("failed");
      channel.onmessage = ({ data }) => {
        if (typeof data !== "string" || data.length > 65000) return;
        if (this.listener) this.listener(data);
        else if (this.inbox.length < 32) this.inbox.push(data);
      };
    };
    if (role === "host") {
      attach(this.connection.createDataChannel(CHANNEL));
    } else {
      this.connection.ondatachannel = ({ channel }) => {
        if (channel.label === CHANNEL && !this.channel) attach(channel);
        else channel.close();
      };
    }
  }

  async offer() {
    return this.createCode(await this.connection.createOffer());
  }

  async answer(offer: LanSignal) {
    await this.connection.setRemoteDescription({ type: "offer", sdp: offer.sdp });
    return this.createCode(await this.connection.createAnswer());
  }

  get isOpen() {
    return this.channel?.readyState === "open" && this.connection.connectionState === "connected";
  }

  async accept(answer: LanSignal) {
    await this.connection.setRemoteDescription({ type: "answer", sdp: answer.sdp });
  }

  private async createCode(description: RTCSessionDescriptionInit): Promise<LanCode> {
    await this.connection.setLocalDescription(description);
    await waitForCandidates(this.connection);
    const local = this.connection.localDescription;
    if (!local || (local.type !== "offer" && local.type !== "answer")) {
      throw new Error("Could not create a pairing code. Start pairing again.");
    }
    if (!/^a=candidate:.* typ host\b/m.test(local.sdp)) {
      throw new Error("No local network address was found. Check Wi-Fi and try again.");
    }
    const payload = JSON.stringify({ room: this.room, type: local.type, sdp: local.sdp });
    const stream = new Response(payload).body!.pipeThrough(new CompressionStream("deflate"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    const text = PREFIX + btoa(String.fromCharCode(...Array.from(bytes)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (text.length > CODE_LIMIT) {
      throw new Error("The pairing code is too large. Try another Wi-Fi connection.");
    }
    const image = await QRCode.toDataURL(text, { errorCorrectionLevel: "L", width: 768 });
    return { text, image };
  }

  subscribe(listener: (data: string) => void) {
    this.listener = listener;
    const buffered = this.inbox;
    this.inbox = [];
    buffered.forEach(listener);
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  send(message: unknown) {
    const channel = this.channel;
    if (channel?.readyState !== "open") return false;
    try {
      channel.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this.connection.onconnectionstatechange = null;
    this.connection.ondatachannel = null;
    if (this.channel) {
      this.channel.onopen = null;
      this.channel.onclose = null;
      this.channel.onerror = null;
      this.channel.onmessage = null;
      this.channel.close();
    }
    this.connection.close();
    this.inbox = [];
    this.listener = null;
  }
}

function waitForCandidates(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    };
    const onChange = () => {
      if (connection.iceGatheringState === "complete") finish();
    };
    const timeout = window.setTimeout(finish, 8000);
    connection.addEventListener("icegatheringstatechange", onChange);
  });
}

export async function decodeLanSignal(input: string): Promise<LanSignal> {
  const code = input.trim();
  if (code.length > CODE_LIMIT || !code.startsWith(PREFIX) ||
    !/^[A-Za-z0-9_-]+$/.test(code.slice(PREFIX.length))) {
    throw new Error("Use a pairing code from Pounce LAN.");
  }
  try {
    const bytes = Uint8Array.from(
      atob(code.slice(PREFIX.length).replace(/-/g, "+").replace(/_/g, "/")),
      (character) => character.charCodeAt(0)
    );
    const reader = new Response(bytes).body!
      .pipeThrough(new DecompressionStream("deflate")).getReader();
    const decoder = new TextDecoder();
    let text = "";
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16000) {
        await reader.cancel();
        throw new Error("Pairing code is too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    const signal: Partial<LanSignal> = JSON.parse(text + decoder.decode());
    if ((signal.type !== "offer" && signal.type !== "answer") ||
      typeof signal.room !== "string" || !/^[0-9a-f]{16}$/.test(signal.room) ||
      typeof signal.sdp !== "string" || !signal.sdp.startsWith("v=0\r\n")) {
      throw new Error("Invalid pairing code");
    }
    return { type: signal.type, room: signal.room, sdp: signal.sdp };
  } catch {
    throw new Error("This pairing code couldn’t be read. Ask your friend for a fresh code.");
  }
}

export function createLanRoomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}
