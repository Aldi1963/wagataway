/**
 * WA Sender Registry
 * Stores active device send-functions so admin-bot-processor can send messages
 * without creating a circular import with wa-manager.ts.
 */

type SendFn = (jid: string, text: string) => Promise<void>;
type SendListFn = (jid: string, title: string, body: string, buttonText: string, sections: Array<{ title: string; rows: Array<{ rowId: string; title: string; description?: string }> }>) => Promise<void>;
type CheckNumberFn = (phone: string) => Promise<{ exists: boolean; jid?: string } | null>;

const senderRegistry = new Map<number, SendFn>();
const listSenderRegistry = new Map<number, SendListFn>();
const checkNumberRegistry = new Map<number, CheckNumberFn>();

export function registerDeviceSender(deviceId: number, fn: SendFn): void {
  senderRegistry.set(deviceId, fn);
}

export function unregisterDeviceSender(deviceId: number): void {
  senderRegistry.delete(deviceId);
  listSenderRegistry.delete(deviceId);
  checkNumberRegistry.delete(deviceId);
}

export function registerDeviceListSender(deviceId: number, fn: SendListFn): void {
  listSenderRegistry.set(deviceId, fn);
}

export function registerDeviceCheckNumber(deviceId: number, fn: CheckNumberFn): void {
  checkNumberRegistry.set(deviceId, fn);
}

export function getDeviceSocket(deviceId: number): { sendText: SendFn; sendList: SendListFn; checkNumber: CheckNumberFn } | null {
  const sendText = senderRegistry.get(deviceId);
  if (!sendText) return null;
  const sendList = listSenderRegistry.get(deviceId) ?? (async () => { throw new Error("No list sender"); });
  const checkNumber = checkNumberRegistry.get(deviceId) ?? (async () => { return null; });
  return { sendText, sendList, checkNumber };
}
