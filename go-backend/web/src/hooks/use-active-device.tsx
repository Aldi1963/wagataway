import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "wag-active-device";

export interface ActiveDevice {
  id: number;
  name: string;
  phone: string;
  status: string;
}

interface ActiveDeviceContextValue {
  /** ID device aktif, diturunkan dari activeDevice */
  activeDeviceId: number | null;
  setActiveDeviceId: (id: number | null) => void;
  /** Objek device aktif (null bila belum dipilih) */
  activeDevice: ActiveDevice | null;
  setActiveDevice: (device: ActiveDevice | null) => void;
}

const ActiveDeviceContext = createContext<ActiveDeviceContextValue | null>(null);

function loadStored(): ActiveDevice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveDevice;
    if (typeof parsed?.id !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function ActiveDeviceProvider({ children }: { children: ReactNode }) {
  const [activeDevice, setActiveDeviceState] = useState<ActiveDevice | null>(loadStored);

  useEffect(() => {
    try {
      if (activeDevice) localStorage.setItem(STORAGE_KEY, JSON.stringify(activeDevice));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* abaikan — storage penuh / tidak tersedia */
    }
  }, [activeDevice]);

  const setActiveDevice = (device: ActiveDevice | null) => {
    setActiveDeviceState(device);
  };

  const setActiveDeviceId = (id: number | null) => {
    if (id === null) {
      setActiveDeviceState(null);
      return;
    }
    setActiveDeviceState((prev) =>
      prev && prev.id === id ? prev : { id, name: "", phone: "", status: "" }
    );
  };

  return (
    <ActiveDeviceContext.Provider
      value={{
        activeDeviceId: activeDevice?.id ?? null,
        setActiveDeviceId,
        activeDevice,
        setActiveDevice,
      }}
    >
      {children}
    </ActiveDeviceContext.Provider>
  );
}

export function useActiveDevice(): ActiveDeviceContextValue {
  const ctx = useContext(ActiveDeviceContext);
  if (!ctx) throw new Error("useActiveDevice harus dipakai di dalam ActiveDeviceProvider");
  return ctx;
}
