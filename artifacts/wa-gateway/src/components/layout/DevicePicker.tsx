import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Smartphone, ChevronDown, Wifi, WifiOff, RefreshCw, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDevice } from "@/contexts/DeviceContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusIcon: Record<string, React.ElementType> = {
  connected: Wifi,
  connecting: RefreshCw,
  disconnected: WifiOff,
};

const statusColor: Record<string, string> = {
  connected: "text-green-500",
  connecting: "text-amber-500",
  disconnected: "text-red-400",
};

function formatPhone(phone: string | undefined) {
  if (!phone) return "Belum terhubung";
  const local = phone.startsWith("62") ? "0" + phone.slice(2) : phone;
  return local;
}

interface DevicePickerProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export function DevicePicker({ collapsed, onNavigate }: DevicePickerProps) {
  const { devices, selectedDevice, selectDevice } = useDevice();
  const [location] = useLocation();
  const isDeviceSettingsActive = location.startsWith("/device-settings");

  if (!selectedDevice && devices.length === 0) return null;

  const Icon = statusIcon[selectedDevice?.status ?? "disconnected"];
  const color = statusColor[selectedDevice?.status ?? "disconnected"];
  const statusLabel: Record<string, string> = {
    connected: "Terhubung",
    connecting: "Menghubungkan",
    disconnected: "Terputus",
  };

  if (collapsed) {
    return (
      <div className="px-1 py-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center justify-center h-9 rounded-lg hover:bg-secondary transition-colors">
              <Smartphone className="w-5 h-5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" className="w-56">
            {devices.map((d) => {
              const DIcon = statusIcon[d.status];
              return (
                <DropdownMenuItem key={d.id} onClick={() => selectDevice(d.id)} className="gap-3">
                  <DIcon className={cn("w-4 h-4 shrink-0", statusColor[d.status])} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{formatPhone(d.phone ?? "")}</p>
                  </div>
                  {d.id === selectedDevice?.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="px-2 py-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-left",
              isDeviceSettingsActive
                ? "bg-primary/10 border-primary/30"
                : "bg-muted/50 border-border hover:border-primary/30 hover:bg-muted"
            )}
          >
            {/* Icon */}
            <div className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
              selectedDevice?.status === "connected"
                ? "bg-green-100 dark:bg-green-900/30"
                : selectedDevice?.status === "connecting"
                ? "bg-amber-100 dark:bg-amber-900/30"
                : "bg-red-100 dark:bg-red-900/30"
            )}>
              <Icon className={cn("w-3.5 h-3.5", color, selectedDevice?.status === "connecting" && "animate-spin")} />
            </div>
            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate leading-tight">
                {formatPhone(selectedDevice?.phone ?? "")}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {statusLabel[selectedDevice?.status ?? "disconnected"]}
              </p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          <div className="px-2 py-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pilih Device</p>
          </div>
          {devices.map((d) => {
            const DIcon = statusIcon[d.status];
            return (
              <DropdownMenuItem
                key={d.id}
                onClick={() => { selectDevice(d.id); }}
                className="gap-3 cursor-pointer"
              >
                <div className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center shrink-0",
                  d.status === "connected" ? "bg-green-100" : d.status === "connecting" ? "bg-amber-100" : "bg-red-100"
                )}>
                  <DIcon className={cn("w-3 h-3", statusColor[d.status])} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{formatPhone(d.phone ?? "")}</p>
                </div>
                {d.id === selectedDevice?.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                )}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/device-settings">
              <div className="flex items-center gap-2 w-full cursor-pointer" onClick={onNavigate}>
                <Settings className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Pengaturan Device</span>
              </div>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href="/devices">
              <div className="flex items-center gap-2 w-full cursor-pointer" onClick={onNavigate}>
                <Plus className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Kelola Perangkat</span>
              </div>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
