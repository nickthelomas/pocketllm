import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Play } from "lucide-react";
import type { McpServer } from "@shared/schema";

interface MCPToolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MCPToolsDialog({ open, onOpenChange }: MCPToolsDialogProps) {
  const { data: mcpServers = [], isLoading } = useQuery<McpServer[]>({
    queryKey: ["/api/mcp/servers"],
    enabled: open,
  });

  const executeTool = (serverName: string, toolName: string) => {
    // In a real implementation, this would show a form to collect tool arguments
    // and then execute the tool via MCP protocol
    const args = prompt(`Enter arguments for ${toolName} (JSON format):`);
    if (args) {
      try {
        const parsedArgs = JSON.parse(args);
        console.log("Executing tool:", { serverName, toolName, args: parsedArgs });
        // TODO: Implement actual MCP tool execution
      } catch (error) {
        alert("Invalid JSON format");
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
                              onClick={() => executeTool(server.name, tool)}
                              disabled={!server.isActive}
                              data-testid={`button-execute-tool-${tool}`}
                            >
                              <Play className="w-3 h-3 mr-1" />
                              Execute
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
      </DialogContent>
    </Dialog>
  );
}
