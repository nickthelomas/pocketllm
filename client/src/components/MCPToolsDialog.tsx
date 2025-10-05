import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Play, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { McpServer } from "@shared/schema";

interface MCPToolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MCPToolsDialog({ open, onOpenChange }: MCPToolsDialogProps) {
  const { toast } = useToast();
  const [executionResults, setExecutionResults] = useState<Record<string, any>>({});
  const { data: mcpServers = [], isLoading } = useQuery<McpServer[]>({
    queryKey: ["/api/mcp/servers"],
    enabled: open,
  });

  const executeToolMutation = useMutation({
    mutationFn: async ({ serverId, toolName, args }: { 
      serverId: string; 
      toolName: string; 
      args: Record<string, any> 
    }) => {
      return apiRequest("/api/mcp/tools/execute", {
        method: "POST",
        body: JSON.stringify({ serverId, toolName, args }),
      });
    },
    onSuccess: (data, variables) => {
      if (data.success) {
        toast({
          title: "Tool Executed Successfully",
          description: `${variables.toolName} completed successfully`,
        });
        setExecutionResults(prev => ({
          ...prev,
          [variables.toolName]: data.result,
        }));
      } else {
        toast({
          title: "Tool Execution Failed",
          description: data.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Tool Execution Error",
        description: error.message || "Failed to execute tool",
        variant: "destructive",
      });
    },
  });

  const executeTool = (server: McpServer, toolName: string) => {
    // Show a prompt to collect tool arguments
    const args = prompt(`Enter arguments for ${toolName} (JSON format):\n\nExample: {"query": "search term"}`);
    if (args) {
      try {
        const parsedArgs = args.trim() === "" ? {} : JSON.parse(args);
        executeToolMutation.mutate({ 
          serverId: server.id, 
          toolName, 
          args: parsedArgs 
        });
      } catch (error) {
        toast({
          title: "Invalid JSON",
          description: "Please provide valid JSON format for arguments",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="mcp-tools-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            MCP Tools
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-muted rounded-lg p-4">
                    <div className="h-4 bg-muted-foreground/20 rounded w-1/2 mb-2"></div>
                    <div className="h-3 bg-muted-foreground/20 rounded w-3/4"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : mcpServers.length === 0 ? (
            <div className="text-center py-8">
              <Settings className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No MCP servers configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add MCP servers in Settings to access tools
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {mcpServers.map((server) => (
                <div
                  key={server.id}
                  className="bg-card border border-border rounded-lg p-4"
                  data-testid={`mcp-server-${server.id}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-semibold">{server.name}</h3>
                    <Badge variant={server.isActive ? "default" : "secondary"}>
                      {server.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  {server.description && (
                    <p className="text-sm text-muted-foreground mb-3">{server.description}</p>
                  )}

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Available Tools:</h4>
                    {server.tools && Array.isArray(server.tools) && server.tools.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2">
                        {server.tools.map((tool: string, index: number) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-background rounded border"
                            data-testid={`tool-${tool}`}
                          >
                            <div>
                              <code className="text-sm font-mono">{tool}</code>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => executeTool(server, tool)}
                              disabled={!server.isActive || executeToolMutation.isPending}
                              data-testid={`button-execute-tool-${tool}`}
                            >
                              {executeToolMutation.isPending ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  Executing...
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3 mr-1" />
                                  Execute
                                </>
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No tools available</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Display execution results */}
        {Object.keys(executionResults).length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-semibold">Recent Execution Results:</h3>
            <div className="max-h-60 overflow-y-auto space-y-3">
              {Object.entries(executionResults).map(([toolName, result], index) => (
                <Alert key={index} className="bg-accent/5 border-accent/20">
                  <CheckCircle className="h-4 w-4 text-accent" />
                  <AlertDescription>
                    <div className="font-mono text-sm mb-1">{toolName}</div>
                    <pre className="text-xs overflow-x-auto bg-background rounded p-2">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
