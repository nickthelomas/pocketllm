import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";

interface HealthStatus {
  timestamp: string;
  backend: {
    status: string;
    message: string;
  };
  database: {
    status: string;
    message: string;
  };
  ollama: {
    status: string;
    message: string;
  };
}

interface SystemHealthViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SystemHealthViewer({ open, onOpenChange }: SystemHealthViewerProps) {
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data: health, isLoading, refetch } = useQuery<HealthStatus>({
    queryKey: ["/api/system/health"],
    refetchInterval: autoRefresh ? 3000 : false,
    retry: false
  });

  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ok":
        return <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-green-400" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-500 dark:text-red-400" />;
      default:
        return <AlertCircle className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ok":
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30">Online</Badge>;
      case "error":
        return <Badge className="bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30">Offline</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30">Unknown</Badge>;
    }
  };

  const allHealthy = health?.backend.status === "ok" && 
                     health?.database.status === "ok" && 
                     health?.ollama.status === "ok";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" data-testid="dialog-system-health">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            System Health Monitor
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto flex-1 pr-2">
          {/* Overall Status */}
          <div className={`p-4 rounded-lg border ${
            allHealthy 
              ? "bg-green-500/10 border-green-500/30 dark:bg-green-500/5" 
              : "bg-red-500/10 border-red-500/30 dark:bg-red-500/5"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {allHealthy ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500 dark:text-green-400" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-500 dark:text-red-400" />
                )}
                <div>
                  <h3 className="font-semibold text-lg">
                    {allHealthy ? "All Systems Operational" : "System Issues Detected"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {health?.timestamp ? new Date(health.timestamp).toLocaleString() : "Loading..."}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                data-testid="button-refresh-health"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Component Status Cards */}
          <div className="space-y-3">
            {/* Backend Status */}
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {getStatusIcon(health?.backend.status || "unknown")}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">Backend Server</h4>
                      {health && getStatusBadge(health.backend.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {health?.backend.message || "Checking..."}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      http://localhost:5000
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Database Status */}
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {getStatusIcon(health?.database.status || "unknown")}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">Database</h4>
                      {health && getStatusBadge(health.database.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {health?.database.message || "Checking..."}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Ollama Status */}
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {getStatusIcon(health?.ollama.status || "unknown")}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">Ollama LLM Server</h4>
                      {health && getStatusBadge(health.ollama.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {health?.ollama.message || "Checking..."}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      http://127.0.0.1:11434
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Troubleshooting Tips */}
          {!allHealthy && health && (
            <div className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 dark:bg-yellow-500/5">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Troubleshooting Tips
              </h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                {health.database.status !== "ok" && (
                  <li>• Database: Check that PostgreSQL is running and DATABASE_URL is set</li>
                )}
                {health.ollama.status !== "ok" && (
                  <li>• Ollama: Run <code className="px-1 py-0.5 bg-background rounded">ollama serve</code> in Termux</li>
                )}
                <li>• For Termux: Use the "PocketLLM — Start Servers" widget</li>
                <li>• Check logs in <code className="px-1 py-0.5 bg-background rounded">~/pocketllm/data/</code></li>
              </ul>
            </div>
          )}

          {/* Auto-refresh toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 rounded border-border"
                data-testid="checkbox-auto-refresh"
              />
              <label htmlFor="auto-refresh" className="text-sm text-muted-foreground cursor-pointer">
                Auto-refresh every 3 seconds
              </label>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
