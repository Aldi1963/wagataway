import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, getToken } from "@/lib/api";

export interface Device {
  id: string;
  name: string;
  phone?: string;
  status: "connected" | "connecting" | "disconnected";
  provider?: "baileys" | "official";
  officialPhoneId?: string;
  officialBusinessAccountId?: string;
  officialAccessToken?: string;
  battery?: number;
  lastSeen?: string;
  autoReconnect?: boolean;
  messagesSent?: number;
  notifyOnDisconnect?: boolean;
  notifyOnConnect?: boolean;
  rotationEnabled?: boolean;
  rotationWeight?: number;
  rotationGroup?: string | null;
}

interface DeviceContextValue {
  devices: Device[];
  selectedDevice: Device | null;
  selectDevice: (id: string) => void;
  isLoading: boolean;
}

const DeviceContext = createContext<DeviceContextValue>({
  devices: [],
  selectedDevice: null,
  selectDevice: () => {},
  isLoading: true,
});

const LS_KEY = "wa_selected_device";

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem(LS_KEY));

  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ["devices-context"],
    queryFn: async () => {
      const r = await apiFetch("/devices");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!getToken(),
    refetchInterval: 30000,
  });

  // Auto-select first device if none selected
  useEffect(() => {
    if (!selectedId && devices.length > 0) {
      const id = devices[0].id;
      setSelectedId(id);
      localStorage.setItem(LS_KEY, id);
    }
  }, [devices, selectedId]);

  function selectDevice(id: string) {
    setSelectedId(id);
    localStorage.setItem(LS_KEY, id);
  }

  const selectedDevice = devices.find((d) => d.id === selectedId) ?? devices[0] ?? null;

  return (
    <DeviceContext.Provider value={{ devices, selectedDevice, selectDevice, isLoading }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  return useContext(DeviceContext);
}
