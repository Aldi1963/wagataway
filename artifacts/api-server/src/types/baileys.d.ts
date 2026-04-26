declare module "@whiskeysockets/baileys" {
  import type { ILogger } from "pino";

  export type WAMessage = any;
  export type MessageContent = Record<string, any>;
  export type AnyMessageContent = MessageContent;

  export interface AuthenticationState {
    creds: any;
    keys: any;
  }

  export interface BaileysEventMap {
    "creds.update": any;
    "connection.update": {
      connection?: "open" | "close" | "connecting";
      lastDisconnect?: { error?: unknown };
      qr?: string;
    };
    "messages.upsert": {
      messages: WAMessage[];
      type: string;
    };
    "messages.update": Array<{
      key: { id?: string | null; remoteJid?: string | null; fromMe?: boolean };
      update?: { status?: number };
    }>;
  }

  export interface GroupParticipant {
    id: string;
    admin?: "admin" | "superadmin" | null;
  }

  export interface GroupMetadata {
    id: string;
    subject?: string;
    participants?: GroupParticipant[];
    desc?: string;
    creation?: number;
  }

  export interface WASocket {
    user?: { id?: string };
    ev: {
      on<EventName extends keyof BaileysEventMap>(
        event: EventName,
        listener: (payload: BaileysEventMap[EventName]) => void | Promise<void>,
      ): void;
    };
    sendPresenceUpdate(type: string, jid?: string): Promise<void>;
    sendMessage(jid: string, content: AnyMessageContent): Promise<{ key?: { id?: string | null } } | undefined>;
    readMessages(keys: any[]): Promise<void>;
    onWhatsApp(...jids: string[]): Promise<Array<{ jid: string; exists?: boolean }>>;
    requestPairingCode(phoneNumber: string): Promise<string>;
    groupFetchAllParticipating(): Promise<Record<string, GroupMetadata>>;
    groupMetadata(jid: string): Promise<GroupMetadata>;
    end(error?: Error): void;
  }

  export interface SocketConfig {
    version?: number[];
    logger?: ILogger;
    printQRInTerminal?: boolean;
    auth?: any;
    browser?: string[];
    generateHighQualityLinkPreview?: boolean;
    syncFullHistory?: boolean;
  }

  const makeWASocket: (config: SocketConfig) => WASocket;
  export default makeWASocket;

  export function useMultiFileAuthState(folder: string): Promise<{
    state: AuthenticationState;
    saveCreds: (creds?: any) => void | Promise<void>;
  }>;
  export function fetchLatestBaileysVersion(): Promise<{ version: number[]; isLatest?: boolean }>;
  export function makeCacheableSignalKeyStore(store: any, logger?: ILogger): any;
  export function downloadMediaMessage(
    message: WAMessage,
    type: "buffer" | "stream",
    options?: Record<string, any>,
    ctx?: Record<string, any>,
  ): Promise<Buffer>;
  export function generateMessageIDV2(...args: any[]): string;

  export const Browsers: {
    ubuntu(browser: string): string[];
  };

  export const DisconnectReason: {
    loggedOut: number;
    [key: string]: number;
  };

  export const proto: any;
}
