import { useState, useRef, useEffect } from "react";
import { 
  Terminal, 
  Send, 
  Trash2, 
  Play, 
  ShieldCheck, 
  Activity, 
  Cpu, 
  HardDrive,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  type: "command" | "result" | "error" | "system";
  content: string;
  timestamp: Date;
}

export default function GatewayCommand() {
  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (type: LogEntry["type"], content: string) => {
    setLogs(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        type,
        content,
        timestamp: new Date()
      }
    ]);
  };

  const handleExecute = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!command.trim() || isExecuting) return;

    const cmd = command.trim();
    setCommand("");
    addLog("command", `> ${cmd}`);
    setIsExecuting(true);

    // Mock execution for now as requested "Gateway Command Server"
    // In real scenario, this would call /api/admin/system/command
    setTimeout(() => {
      processCommand(cmd);
      setIsExecuting(false);
    }, 600);
  };

  const processCommand = (cmd: string) => {
    const c = cmd.toLowerCase();
    
    if (c === "help") {
      addLog("system", "Available commands:\n- status: Show gateway health\n- uptime: Server run time\n- check-auth: Verify session integrity\n- flush-cache: Clear temporary buffers\n- clear: Clear terminal logs");
    } else if (c === "status") {
      addLog("result", "API Status: ONLINE\nDatabase: CONNECTED (14ms)\nRedis: CONNECTED\nWhatsApp Session: 4 Active\nWorker Nodes: 2 Running");
    } else if (c === "uptime") {
      addLog("result", "System Uptime: 4 days, 12 hours, 43 minutes");
    } else if (c === "check-auth") {
      addLog("result", "Auth Token: VALID\nRole: ADMINISTRATOR\nPermissions: ALL_GRANTED");
    } else if (c === "flush-cache") {
      addLog("result", "Flushing message cache...\nClearing temporary file buffers...\nDONE: 142MB released.");
    } else if (c === "clear") {
      setLogs([]);
    } else {
      addLog("error", `Unknown command: '${cmd}'. Type 'help' for options.`);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gateway Command</h1>
          <p className="text-muted-foreground">Diagnostik sistem dan server command line interface.</p>
        </div>
        <div className="flex items-center gap-2">
           <Badge variant="outline" className="gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border-emerald-200">
             <Activity className="w-3 h-3" /> System Healthy
           </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="rounded-[20px] shadow-sm border-0 bg-zinc-900 text-zinc-100 md:col-span-3 flex flex-col h-[600px] overflow-hidden">
          <CardHeader className="border-b border-zinc-800 py-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-mono font-medium text-zinc-400 uppercase tracking-widest">Gateway CLI v1.0</span>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
                onClick={() => setLogs([])}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent 
            className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed" 
            ref={scrollRef}
          >
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-2">
                <Search className="w-8 h-8 opacity-20" />
                <p>Ketik <code className="text-zinc-400">help</code> untuk memulai</p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map(log => (
                  <div key={log.id} className={cn(
                    "whitespace-pre-wrap break-all",
                    log.type === "command" && "text-zinc-100 font-bold",
                    log.type === "result" && "text-emerald-400 pl-4 border-l border-emerald-900/50",
                    log.type === "error" && "text-rose-400 pl-4 border-l border-rose-900/50",
                    log.type === "system" && "text-blue-400 pl-4 border-l border-blue-900/50"
                  )}>
                    {log.content}
                  </div>
                ))}
                {isExecuting && (
                  <div className="flex items-center gap-2 text-zinc-500 italic px-4">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Executing...
                  </div>
                )}
              </div>
            )}
          </CardContent>

          <div className="p-4 border-t border-zinc-800 shrink-0">
            <form onSubmit={handleExecute} className="relative">
              <Input
                value={command}
                onChange={e => setCommand(e.target.value)}
                placeholder="Enter gateway command..."
                className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono pl-4 pr-12 h-11 focus-visible:ring-zinc-700"
                disabled={isExecuting}
              />
              <Button 
                type="submit" 
                size="icon" 
                className={cn(
                  "absolute right-1.5 top-1.5 h-8 w-8",
                  command.trim() ? "bg-primary hover:bg-primary/90" : "bg-zinc-800 text-zinc-500 pointer-events-none"
                )}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          </div>
        </Card>

        {/* System Info Sidebar */}
        <div className="space-y-4">
          <Card className="rounded-[20px] shadow-sm border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" /> CPU Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Load Average</span>
                  <span className="font-mono">1.02, 1.05, 1.01</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-[32%]" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[20px] shadow-sm border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-blue-500" /> Storage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Used: 42.4GB</span>
                  <span className="font-mono">Total: 100GB</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 w-[42%]" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[20px] shadow-sm border-0 overflow-hidden">
             <div className="bg-zinc-900 p-4 space-y-3">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Server Health</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Node Cluster</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Redis Cache</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Main Database</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Baileys Engine</span>
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                </div>
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
