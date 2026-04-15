/**
 * Bridge for Mobile WebView integration (Android/iOS).
 * Allows the web app to communicate with the native shell.
 */

export interface MobileInfo {
  platform: 'android' | 'ios' | 'web';
  version?: string;
  isNative: boolean;
  appId?: string;
}

const getMobileInfo = (): MobileInfo => {
  const ua = navigator.userAgent.toLowerCase();
  const isAndroid = ua.includes('android');
  const isIOS = /iphone|ipad|ipod/.test(ua);
  
  // Check if we are inside a custom webview (e.g. by checking for a bridge object)
  const isNative = !!((window as any).AndroidBridge || (window as any).webkit?.messageHandlers?.mobileBridge);

  return {
    platform: isAndroid ? 'android' : isIOS ? 'ios' : 'web',
    isNative,
    appId: (window as any).APP_ID || undefined
  };
};

export const mobileBridge = {
  info: getMobileInfo(),

  /** Send a native notification via the app shell */
  notify: (title: string, body: string) => {
    if ((window as any).AndroidBridge?.showNotification) {
      (window as any).AndroidBridge.showNotification(title, body);
    } else if ((window as any).webkit?.messageHandlers?.mobileBridge) {
      (window as any).webkit.messageHandlers.mobileBridge.postMessage({
        type: 'NOTIFICATION',
        title,
        body
      });
    } else {
      // Fallback to Web Notification API
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    }
  },

  /** Request camera access for QR scanning (if native scanner is preferred) */
  scanQr: async (): Promise<string | null> => {
    if (!getMobileInfo().isNative) return null;

    return new Promise((resolve) => {
      (window as any).onQrScanned = (result: string) => {
        delete (window as any).onQrScanned;
        resolve(result);
      };

      if ((window as any).AndroidBridge?.startScanner) {
        (window as any).AndroidBridge.startScanner();
      } else if ((window as any).webkit?.messageHandlers?.mobileBridge) {
        (window as any).webkit.messageHandlers.mobileBridge.postMessage({ type: 'SCAN_QR' });
      } else {
        resolve(null);
      }
    });
  },

  /** Copy text to native clipboard */
  copyToClipboard: (text: string) => {
    if ((window as any).AndroidBridge?.copyToClipboard) {
      (window as any).AndroidBridge.copyToClipboard(text);
      return true;
    }
    return false;
  },

  /** Trigger haptic feedback */
  vibrate: (type: 'light' | 'medium' | 'heavy' = 'medium') => {
    if ((window as any).AndroidBridge?.vibrate) {
      (window as any).AndroidBridge.vibrate(type);
    } else if (navigator.vibrate) {
      navigator.vibrate(type === 'light' ? 20 : type === 'medium' ? 50 : 100);
    }
  }
};
