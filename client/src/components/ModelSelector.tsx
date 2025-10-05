import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Loader2, RefreshCw, Wifi, WifiOff, Star } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CloudModelPasswordDialog from "@/components/CloudModelPasswordDialog";
import DownloadsPanel from "@/components/DownloadsPanel";
import type { Model } from "@shared/schema";

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

interface CatalogModel {
  name: string;
  size: string;
  description: string;
  source: string;
  provider: string;
  downloadUrl?: string;
}

interface NetworkStatus {
  online: boolean;
  openrouter: boolean;
}

interface Settings {
  id: string;
  key: string;
  value: any;
}

export default function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const { toast } = useToast();
  const [showCatalog, setShowCatalog] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("local");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem("favoriteModels");
    return saved ? JSON.parse(saved) : [];
  });

  const { data: models = [], isLoading: modelsLoading } = useQuery<Model[]>({
    queryKey: ["/api/models"],
  });

  const { data: networkStatus } = useQuery<NetworkStatus>({
    queryKey: ["/api/system/network"],
    refetchInterval: 30000,
  });

  const { data: settings = [] } = useQuery<Settings[]>({
    queryKey: ["/api/settings"],
  });

  const { data: catalogData, isError: catalogError } = useQuery<{ catalog: CatalogModel[] }>({
    queryKey: ["/api/models/catalog"],
    enabled: showCatalog,
    retry: false,
  });

  const isOnline = networkStatus?.online ?? true;
  const hasOpenRouterKey = settings.some(s => s.key === "openrouter_api_key" && s.value && s.value !== "");
  const hasRemoteUrl = settings.some(s => s.key === "remote_ollama_url" && s.value && s.value !== "");

  const availableModels = models.filter(model => model.isAvailable);

  const localModels = availableModels.filter(m => 
    ['ollama', 'huggingface', 'local-file'].includes(m.provider)
  );
  const cloudModels = availableModels.filter(m => m.provider === 'openrouter');
  const remoteModels = availableModels.filter(m => m.provider === 'remote-ollama');
  const favoriteModels = cloudModels.filter(m => favorites.includes(m.name));

  const catalogLocalModels = catalogData?.catalog?.filter(m => 
    ['ollama', 'huggingface', 'local-file'].includes(m.provider)
  ) || [];
  const catalogCloudModels = catalogData?.catalog?.filter(m => m.provider === 'openrouter') || [];
  const catalogRemoteModels = catalogData?.catalog?.filter(m => m.provider === 'remote-ollama') || [];

  useEffect(() => {
    if (!modelsLoading && availableModels.length > 0 && !selectedModel) {
      const savedModel = localStorage.getItem("selectedModel");
      
      if (savedModel && availableModels.some(m => m.name === savedModel)) {
        onModelChange(savedModel);
      } else {
        const sortedBySize = [...availableModels].sort((a, b) => {
          const sizeA = (a.parameters as any)?.size || Infinity;
          const sizeB = (b.parameters as any)?.size || Infinity;
          return sizeA - sizeB;
        });
        
        const smallestModel = sortedBySize[0];
        if (smallestModel) {
          onModelChange(smallestModel.name);
          localStorage.setItem("selectedModel", smallestModel.name);
        }
      }
    }
  }, [modelsLoading, availableModels, selectedModel, onModelChange]);

  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem("selectedModel", selectedModel);
      // Only load model if it's changed from the previous value
      const previousModel = localStorage.getItem("previousModel");
      if (selectedModel !== previousModel) {
        localStorage.setItem("previousModel", selectedModel);
        loadModelMutation.mutate(selectedModel);
      }
    }
  }, [selectedModel]);

  const loadModelMutation = useMutation({
    mutationFn: async (modelName: string) => {
      const response = await fetch("/api/models/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load model");
      }
      return response.json();
    },
    onMutate: (modelName) => {
      // Show loading toast when mutation starts
      const model = availableModels.find(m => m.name === modelName);
      if (model && ['ollama', 'huggingface', 'local-file'].includes(model.provider)) {
        toast({
          title: "Loading Model",
          description: `Loading ${modelName}... This may take up to 60 seconds for larger models.`,
        });
      }
    },
    onSuccess: (data) => {
      console.log(`✅ ${data.message}`);
      toast({
        title: "Model Ready",
        description: data.message,
      });
      // Invalidate health status to show the loaded model
      queryClient.invalidateQueries({ queryKey: ["/api/system/health"] });
    },
    onError: (error) => {
      console.error("Model load failed:", error);
      toast({
        title: "Model Load Failed",
        description: error instanceof Error ? error.message : "Could not load model in Ollama",
        variant: "destructive",
      });
    },
  });

  const syncModelsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/models/sync");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to sync models");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
      const modelCount = data.models?.length || 0;
      toast({
        title: "Models Synced",
        description: `Found ${modelCount} local models from Ollama and GGUF directories.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Could not connect to Ollama or scan local directories",
        variant: "destructive",
      });
    },
  });

  const pullModelMutation = useMutation({
    mutationFn: async ({ name, source, downloadUrl }: { name: string; source: string; downloadUrl?: string }) => {
      const downloadId = `${name}-${Date.now()}`;
      
      // Emit initial download event
      window.dispatchEvent(new CustomEvent('download-update', {
        detail: { id: downloadId, name, status: 'downloading', progress: 0 }
      }));

      const response = await fetch("/api/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, source, downloadUrl }),
      });

      if (response.status === 503) {
        const error = await response.json();
        window.dispatchEvent(new CustomEvent('download-update', {
          detail: { id: downloadId, name, status: 'error', progress: 0, error: error.message }
        }));
        throw new Error(error.message || "Network unavailable");
      }

      if (!response.ok) {
        window.dispatchEvent(new CustomEvent('download-update', {
          detail: { id: downloadId, name, status: 'error', progress: 0, error: 'Failed to start download' }
        }));
        throw new Error("Failed to start download");
      }

      // Read SSE progress stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim() || !line.startsWith("data: ")) continue;
              
              const data = line.slice(6);
              if (data === "[DONE]") {
                window.dispatchEvent(new CustomEvent('download-update', {
                  detail: { id: downloadId, name, status: 'complete', progress: 100 }
                }));
                break;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.status && parsed.progress !== undefined) {
                  window.dispatchEvent(new CustomEvent('download-update', {
                    detail: { 
                      id: downloadId, 
                      name, 
                      status: parsed.status, 
                      progress: Math.min(parsed.progress, 100) 
                    }
                  }));
                }
                if (parsed.error) {
                  window.dispatchEvent(new CustomEvent('download-update', {
                    detail: { id: downloadId, name, status: 'error', progress: 0, error: parsed.error }
                  }));
                  throw new Error(parsed.error);
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        } catch (error) {
          window.dispatchEvent(new CustomEvent('download-update', {
            detail: { id: downloadId, name, status: 'error', progress: 0, error: 'Download interrupted' }
          }));
          throw error;
        }
      }

      return { name, downloadId };
    },
    onSuccess: (data) => {
      setShowCatalog(false);
      toast({
        title: "Download Complete",
        description: `${data.name} downloaded successfully. Syncing models...`,
        duration: 3000,
      });
      setPullError(null);
      // Auto-sync after download completes
      setTimeout(() => syncModelsMutation.mutate(), 500);
    },
    onError: (error) => {
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Could not start download",
        variant: "destructive",
      });
      setPullError(error instanceof Error ? error.message : "Could not download model");
    },
  });

  const toggleFavorite = (modelName: string) => {
    const newFavorites = favorites.includes(modelName)
      ? favorites.filter(f => f !== modelName)
      : [...favorites, modelName];
    
    setFavorites(newFavorites);
    localStorage.setItem("favoriteModels", JSON.stringify(newFavorites));
  };

  const handleModelSelect = async (value: string) => {
    const modelExists = availableModels.some(m => m.name === value);
    if (!modelExists) {
      toast({
        title: "Model not found locally",
        description: "Please sync or pull the model first.",
        variant: "destructive",
      });
      return;
    }

    // Check if password protection is enabled for cloud models
    const model = availableModels.find(m => m.name === value);
    const isCloudModel = model?.provider === "openrouter";

    if (isCloudModel) {
      try {
        const response = await fetch("/api/auth/cloud-password-enabled");
        const data = await response.json();
        
        if (data.enabled) {
          setPendingModel(value);
          setShowPasswordDialog(true);
        } else {
          onModelChange(value);
        }
      } catch (error) {
        // If API fails, allow selection (fail open)
        onModelChange(value);
      }
    } else {
      onModelChange(value);
    }
  };

  const getTabContent = (tabModels: Model[], tabName: string, showFavoriteButton = false) => {
    if (tabModels.length === 0) {
      return (
        <div className="text-center py-8 text-sm text-muted-foreground" data-testid={`text-no-${tabName}-models`}>
          No {tabName} models available. Click Pull to add models.
        </div>
      );
    }

    return (
      <div className="space-y-2" data-testid={`list-${tabName}-models`}>
        {tabModels.map((model) => (
          <div
            key={model.id}
            className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors"
            data-testid={`card-model-${model.name}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-medium break-all">{model.name}</h4>
                {model.provider === "huggingface" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/30 shrink-0">
                    HF
                  </span>
                )}
                {model.provider === "openrouter" && (
                  <>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 shrink-0">
                      OR
                    </span>
                    {(model.parameters as any)?.brand && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 shrink-0">
                        {(model.parameters as any).brand}
                      </span>
                    )}
                  </>
                )}
              </div>
              {model.provider === "openrouter" && (model.parameters as any)?.pricing ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  ${(parseFloat((model.parameters as any).pricing.prompt) * 1000000).toFixed(2)} / ${(parseFloat((model.parameters as any).pricing.completion) * 1000000).toFixed(2)} per 1M tokens
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">{model.provider}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {showFavoriteButton && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleFavorite(model.name)}
                  data-testid={`button-favorite-${model.name}`}
                  className="p-2"
                >
                  <Star 
                    className={`w-4 h-4 ${favorites.includes(model.name) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                  />
                </Button>
              )}
              <Button
                size="sm"
                variant={selectedModel === model.name ? "default" : "outline"}
                onClick={() => handleModelSelect(model.name)}
                data-testid={`button-select-${model.name}`}
              >
                {selectedModel === model.name ? "Active" : "Select"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-medium text-muted-foreground">
          Active Model
        </label>
        <div className="flex items-center gap-1" data-testid="indicator-network-status">
          {isOnline ? (
            <Wifi className="w-3 h-3 text-green-600 dark:text-green-400" />
          ) : (
            <WifiOff className="w-3 h-3 text-destructive" />
          )}
          <span className="text-[10px] text-muted-foreground">
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      <Select value={selectedModel} onValueChange={handleModelSelect} disabled={loadModelMutation.isPending} data-testid="select-model">
        <SelectTrigger className="relative">
          {loadModelMutation.isPending && (
            <Loader2 className="absolute left-3 w-4 h-4 animate-spin text-muted-foreground" />
          )}
          <SelectValue 
            placeholder={loadModelMutation.isPending ? "Loading model..." : "Select a model..."} 
            className={loadModelMutation.isPending ? "ml-6" : ""}
          />
        </SelectTrigger>
        <SelectContent>
          {availableModels.length > 0 ? (
            availableModels.map((model) => (
              <SelectItem key={model.id} value={model.name}>
                {model.name}
              </SelectItem>
            ))
          ) : (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No models available. Click Sync or Pull to add models.
            </div>
          )}
        </SelectContent>
      </Select>
      
      <div className="flex gap-2 mt-3">
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1"
          onClick={() => setShowCatalog(true)}
          data-testid="button-pull-model"
        >
          <Download className="w-4 h-4 mr-2" />
          Pull
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1"
          onClick={() => syncModelsMutation.mutate()}
          disabled={syncModelsMutation.isPending}
          data-testid="button-sync-models"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Sync
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4" data-testid="tabs-provider">
        <TabsList className="inline-flex w-auto min-w-full overflow-x-auto">
          <TabsTrigger value="local" data-testid="tab-local" className="flex-shrink-0">
            Local
          </TabsTrigger>
          <TabsTrigger 
            value="cloud" 
            data-testid="tab-cloud"
            className="flex-shrink-0"
          >
            Cloud
          </TabsTrigger>
          <TabsTrigger 
            value="favourites" 
            data-testid="tab-favourites"
            className="flex-shrink-0"
          >
            Favourites
          </TabsTrigger>
          <TabsTrigger 
            value="remote" 
            data-testid="tab-remote"
            className="flex-shrink-0"
          >
            Remote
          </TabsTrigger>
        </TabsList>

        <TabsContent value="local" className="mt-3">
          <Tabs defaultValue="models" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-3">
              <TabsTrigger value="models" data-testid="tab-local-models">
                Models
              </TabsTrigger>
              <TabsTrigger value="downloads" data-testid="tab-local-downloads">
                Downloads
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="models" className="mt-0" data-testid="content-local-models">
              {getTabContent(localModels, "local")}
            </TabsContent>
            
            <TabsContent value="downloads" className="mt-0" data-testid="content-local-downloads">
              <div className="max-h-[400px] overflow-y-auto">
                <DownloadsPanel />
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="cloud" className="mt-3">
          {!hasOpenRouterKey ? (
            <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-configure-openrouter">
              Configure OpenRouter API key in Settings to use cloud models.
            </div>
          ) : !isOnline ? (
            <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-cloud-offline">
              Network offline. Cloud models require internet connectivity.
            </div>
          ) : (
            getTabContent(cloudModels, "cloud", true)
          )}
        </TabsContent>

        <TabsContent value="favourites" className="mt-3">
          {!hasOpenRouterKey ? (
            <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-configure-openrouter-favourites">
              Configure OpenRouter API key in Settings to use cloud models.
            </div>
          ) : !isOnline ? (
            <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-favourites-offline">
              Network offline. Cloud models require internet connectivity.
            </div>
          ) : favoriteModels.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-no-favourites">
              No favourites yet. Star your favorite cloud models from the Cloud tab.
            </div>
          ) : (
            getTabContent(favoriteModels, "favourites", true)
          )}
        </TabsContent>

        <TabsContent value="remote" className="mt-3">
          {!hasRemoteUrl ? (
            <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-configure-remote">
              Configure Remote Ollama URL in Settings to use remote models.
            </div>
          ) : (
            getTabContent(remoteModels, "remote")
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showCatalog} onOpenChange={(open) => {
        setShowCatalog(open);
        if (!open) {
          setPullError(null);
        }
      }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col" data-testid="dialog-pull-catalog">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {pullError ? "Download Failed" : "Pull Model"}
            </DialogTitle>
          </DialogHeader>

          {catalogError ? (
            <div className="space-y-4">
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium">Network unavailable</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ollama is not running or network is down. Start Ollama to pull models.
                </p>
              </div>
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => setShowCatalog(false)}
                data-testid="button-close-catalog"
              >
                Close
              </Button>
            </div>
          ) : pullError ? (
            <div className="space-y-4">
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium">Pull Failed</p>
                <p className="text-xs text-muted-foreground mt-1">{pullError}</p>
              </div>
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => {
                  setPullError(null);
                }}
                data-testid="button-try-again"
              >
                Try Again
              </Button>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col" data-testid="tabs-pull-catalog">
              <TabsList className="grid w-full grid-cols-3 shrink-0">
                <TabsTrigger value="local" data-testid="tab-pull-local">
                  Local
                </TabsTrigger>
                <TabsTrigger 
                  value="cloud" 
                  disabled={!isOnline || !hasOpenRouterKey}
                  className="disabled:opacity-50"
                  data-testid="tab-pull-cloud"
                >
                  Cloud
                </TabsTrigger>
                <TabsTrigger 
                  value="remote" 
                  disabled={!hasRemoteUrl}
                  className="disabled:opacity-50"
                  data-testid="tab-pull-remote"
                >
                  Remote
                </TabsTrigger>
              </TabsList>

              <TabsContent value="local" className="flex-1 mt-3">
                <div className="max-h-[50vh] overflow-y-auto pr-2">
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Select a model to download:
                    </p>
                    
                    {catalogLocalModels.map((model: CatalogModel) => (
                      <div 
                        key={model.name}
                        className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium truncate">{model.name}</h4>
                            {model.provider === "huggingface" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/30 shrink-0">
                                HF
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{model.description}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          <span className="text-xs font-mono text-muted-foreground">{model.size}</span>
                          <Button
                            size="sm"
                            onClick={() => pullModelMutation.mutate({ name: model.name, source: model.source, downloadUrl: model.downloadUrl })}
                            disabled={pullModelMutation.isPending}
                            data-testid={`button-pull-${model.name}`}
                          >
                            Pull
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="cloud" className="flex-1 mt-3">
                <div className="max-h-[50vh] overflow-y-auto pr-2">
                  <div className="space-y-3">
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">☁️ Cloud Models Ready</p>
                      <p className="text-xs text-muted-foreground">
                        OpenRouter models are instantly available - no download needed! Click <span className="font-semibold">Sync</span> to load them, then select from the Cloud tab on the main screen.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="remote" className="flex-1 mt-3">
                <div className="max-h-[50vh] overflow-y-auto pr-2">
                {!hasRemoteUrl ? (
                  <div className="p-4 bg-muted/50 border border-border rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Configure Remote Ollama URL in Settings to pull remote models.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Select a remote model to download:
                    </p>
                    
                    {catalogRemoteModels.map((model: CatalogModel) => (
                      <div 
                        key={model.name}
                        className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium truncate">{model.name}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{model.description}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          <span className="text-xs font-mono text-muted-foreground">{model.size}</span>
                          <Button
                            size="sm"
                            onClick={() => pullModelMutation.mutate({ name: model.name, source: model.source, downloadUrl: model.downloadUrl })}
                            disabled={pullModelMutation.isPending}
                            data-testid={`button-pull-${model.name}`}
                          >
                            Pull
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Password Protection Dialog */}
      <CloudModelPasswordDialog
        isOpen={showPasswordDialog}
        onClose={() => {
          setShowPasswordDialog(false);
          setPendingModel(null);
        }}
        onSuccess={() => {
          if (pendingModel) {
            onModelChange(pendingModel);
            setPendingModel(null);
          }
        }}
        modelName={pendingModel || ""}
      />
    </div>
  );
}
