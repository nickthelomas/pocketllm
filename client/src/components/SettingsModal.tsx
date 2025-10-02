import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Settings2, User, Zap, Database, Cog } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState({
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 2048,
    repeatPenalty: 1.1,
    seed: null,
    stopSequences: "",
    contextWindow: 10,
    memoryDepth: "last7days",
    baseApiUrl: "http://localhost:11434",
    bearerToken: "",
    userProfile: "",
    chunkSize: 512,
    chunkOverlap: 50,
    topKResults: 3,
    similarityThreshold: 0.7,
  });

  const { toast } = useToast();

  const { data: storedSettings } = useQuery({
    queryKey: ["/api/settings"],
    enabled: isOpen,
  });

  const { data: mcpServers = [] } = useQuery({
    queryKey: ["/api/mcp/servers"],
    enabled: isOpen,
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (settingsToSave: typeof settings) => {
      // Save each setting individually
      const promises = Object.entries(settingsToSave).map(([key, value]) =>
        apiRequest("POST", "/api/settings", {
          userId: null,
          key,
          value,
        })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings saved",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMcpServerMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/mcp/servers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/servers"] });
      toast({
        title: "MCP server removed",
      });
    },
  });

  // Load stored settings when modal opens
  useEffect(() => {
    if (storedSettings && Array.isArray(storedSettings)) {
      const settingsObj = storedSettings.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {});
      
      setSettings(prev => ({ ...prev, ...settingsObj }));
    }
  }, [storedSettings]);

  const resetToDefaults = () => {
    setSettings({
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 2048,
      repeatPenalty: 1.1,
      seed: null,
      stopSequences: "",
      contextWindow: 10,
      memoryDepth: "last7days",
      baseApiUrl: "http://localhost:11434",
      bearerToken: "",
      userProfile: "",
      chunkSize: 512,
      chunkOverlap: 50,
      topKResults: 3,
      similarityThreshold: 0.7,
    });
  };

  const addMcpServer = () => {
    const name = prompt("Enter MCP server name:");
    const endpoint = prompt("Enter MCP server endpoint:");
    
    if (name && endpoint) {
      apiRequest("POST", "/api/mcp/servers", {
        name,
        endpoint,
        description: "Custom MCP server",
        tools: [],
        isActive: true,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/mcp/servers"] });
        toast({
          title: "MCP server added",
        });
      }).catch((error) => {
        toast({
          title: "Failed to add MCP server",
          description: error.message,
          variant: "destructive",
        });
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden" data-testid="settings-modal">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto space-y-8 pr-2">
          {/* LLM Parameters */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Settings2 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">LLM Parameters</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label>Temperature</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Slider
                    value={[settings.temperature]}
                    onValueChange={([value]) => setSettings(prev => ({ ...prev, temperature: value }))}
                    max={2}
                    min={0}
                    step={0.1}
                    className="flex-1"
                    data-testid="slider-temperature"
                  />
                  <span className="text-sm font-mono w-12 text-right">{settings.temperature}</span>
                </div>
              </div>
              
              <div>
                <Label>Top P</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Slider
                    value={[settings.topP]}
                    onValueChange={([value]) => setSettings(prev => ({ ...prev, topP: value }))}
                    max={1}
                    min={0}
                    step={0.05}
                    className="flex-1"
                    data-testid="slider-top-p"
                  />
                  <span className="text-sm font-mono w-12 text-right">{settings.topP}</span>
                </div>
              </div>
              
              <div>
                <Label>Max Tokens</Label>
                <Input
                  type="number"
                  value={settings.maxTokens}
                  onChange={(e) => setSettings(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                  className="mt-2"
                  data-testid="input-max-tokens"
                />
              </div>
              
              <div>
                <Label>Repeat Penalty</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Slider
                    value={[settings.repeatPenalty]}
                    onValueChange={([value]) => setSettings(prev => ({ ...prev, repeatPenalty: value }))}
                    max={2}
                    min={0}
                    step={0.1}
                    className="flex-1"
                    data-testid="slider-repeat-penalty"
                  />
                  <span className="text-sm font-mono w-12 text-right">{settings.repeatPenalty}</span>
                </div>
              </div>
              
              <div>
                <Label>Seed</Label>
                <Input
                  type="number"
                  placeholder="Random"
                  value={settings.seed || ""}
                  onChange={(e) => setSettings(prev => ({ ...prev, seed: e.target.value ? parseInt(e.target.value) : null }))}
                  className="mt-2"
                  data-testid="input-seed"
                />
              </div>
              
              <div>
                <Label>Stop Sequences</Label>
                <Input
                  placeholder="e.g., ###, END"
                  value={settings.stopSequences}
                  onChange={(e) => setSettings(prev => ({ ...prev, stopSequences: e.target.value }))}
                  className="mt-2"
                  data-testid="input-stop-sequences"
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* Memory & Context */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-accent" />
              <h3 className="text-lg font-semibold">Memory & Context</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label>Context Window (Last N turns)</Label>
                <Input
                  type="number"
                  value={settings.contextWindow}
                  onChange={(e) => setSettings(prev => ({ ...prev, contextWindow: parseInt(e.target.value) }))}
                  min={1}
                  max={100}
                  className="mt-2"
                  data-testid="input-context-window"
                />
              </div>
              
              <div>
                <Label>Memory Depth</Label>
                <Select value={settings.memoryDepth} onValueChange={(value) => setSettings(prev => ({ ...prev, memoryDepth: value }))}>
                  <SelectTrigger className="mt-2" data-testid="select-memory-depth">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current session only</SelectItem>
                    <SelectItem value="last24hours">Last 24 hours</SelectItem>
                    <SelectItem value="last7days">Last 7 days</SelectItem>
                    <SelectItem value="last30days">Last 30 days</SelectItem>
                    <SelectItem value="all">All history</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* API Configuration */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Cog className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">API Configuration</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label>Base API URL</Label>
                <Input
                  type="url"
                  value={settings.baseApiUrl}
                  onChange={(e) => setSettings(prev => ({ ...prev, baseApiUrl: e.target.value }))}
                  className="mt-2 font-mono"
                  data-testid="input-base-api-url"
                />
              </div>
              
              <div>
                <Label>Bearer Token (Optional)</Label>
                <Input
                  type="password"
                  placeholder="Enter token if required"
                  value={settings.bearerToken}
                  onChange={(e) => setSettings(prev => ({ ...prev, bearerToken: e.target.value }))}
                  className="mt-2 font-mono"
                  data-testid="input-bearer-token"
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* User Profile */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-accent" />
              <h3 className="text-lg font-semibold">User Profile & Rules</h3>
            </div>
            
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This profile is automatically included in every system prompt to personalize responses.
              </p>
              <Textarea
                rows={8}
                className="font-mono resize-none"
                placeholder="Example: I'm Nick, a software engineer specializing in AI/ML. I prefer concise, technical explanations with code examples when relevant..."
                value={settings.userProfile}
                onChange={(e) => setSettings(prev => ({ ...prev, userProfile: e.target.value }))}
                data-testid="textarea-user-profile"
              />
              
              <div className="flex items-center gap-2 p-3 bg-accent/5 border border-accent/30 rounded-lg">
                <svg className="w-5 h-5 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-accent">Profile is active and will be included in all conversations</p>
              </div>
            </div>
          </section>

          <Separator />

          {/* MCP Servers */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Settings2 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">MCP Tool Servers</h3>
            </div>
            
            <div className="space-y-3">
              {mcpServers.map((server) => (
                <div key={server.id} className="bg-background/50 border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-semibold">{server.name}</h4>
                        <Badge variant={server.isActive ? "default" : "secondary"}>
                          {server.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      {server.description && (
                        <p className="text-xs text-muted-foreground mb-3">{server.description}</p>
                      )}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Endpoint:</span>
                          <code className="font-mono text-foreground">{server.endpoint}</code>
                        </div>
                        {server.tools && Array.isArray(server.tools) && server.tools.length > 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">Tools:</span>
                            <span className="text-foreground">{server.tools.join(", ")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="hover:bg-destructive/20 text-destructive"
                      onClick={() => deleteMcpServerMutation.mutate(server.id)}
                      disabled={deleteMcpServerMutation.isPending}
                      data-testid={`button-remove-mcp-server-${server.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              
              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={addMcpServer}
                data-testid="button-add-mcp-server"
              >
                <Plus className="w-4 h-4 mr-2" />
                Register New MCP Server
              </Button>
            </div>
          </section>

          <Separator />

          {/* RAG Configuration */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">RAG Configuration</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label>Chunk Size (tokens)</Label>
                <Input
                  type="number"
                  value={settings.chunkSize}
                  onChange={(e) => setSettings(prev => ({ ...prev, chunkSize: parseInt(e.target.value) }))}
                  min={128}
                  max={2048}
                  step={128}
                  className="mt-2"
                  data-testid="input-chunk-size"
                />
              </div>
              
              <div>
                <Label>Chunk Overlap (tokens)</Label>
                <Input
                  type="number"
                  value={settings.chunkOverlap}
                  onChange={(e) => setSettings(prev => ({ ...prev, chunkOverlap: parseInt(e.target.value) }))}
                  min={0}
                  max={256}
                  step={10}
                  className="mt-2"
                  data-testid="input-chunk-overlap"
                />
              </div>
              
              <div>
                <Label>Top K Results</Label>
                <Input
                  type="number"
                  value={settings.topKResults}
                  onChange={(e) => setSettings(prev => ({ ...prev, topKResults: parseInt(e.target.value) }))}
                  min={1}
                  max={10}
                  className="mt-2"
                  data-testid="input-top-k-results"
                />
              </div>
              
              <div>
                <Label>Similarity Threshold</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Slider
                    value={[settings.similarityThreshold]}
                    onValueChange={([value]) => setSettings(prev => ({ ...prev, similarityThreshold: value }))}
                    max={1}
                    min={0}
                    step={0.05}
                    className="flex-1"
                    data-testid="slider-similarity-threshold"
                  />
                  <span className="text-sm font-mono w-12 text-right">{settings.similarityThreshold}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 pt-6 border-t border-border">
          <Button variant="outline" onClick={resetToDefaults} data-testid="button-reset-settings">
            Reset to Defaults
          </Button>
          <Button
            onClick={() => saveSettingsMutation.mutate(settings)}
            disabled={saveSettingsMutation.isPending}
            data-testid="button-save-settings"
          >
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
