import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CloudModelPasswordDialog from "./CloudModelPasswordDialog";
import { RefreshCw, Download, Star, Cloud, Server, Trash2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Model, Settings } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface ModelSelectorProps {
  selectedModel: string | null;
  onModelChange: (modelName: string | null) => void;
}

interface NetworkStatus {
  online: boolean;
  openrouterAvailable: boolean;
  remoteOllamaAvailable: boolean;
}

export default function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("local");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
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

  const isOnline = networkStatus?.online ?? true;
  const hasOpenRouterKey = settings.some(s => s.key === "openrouter_api_key" && s.value && s.value !== "");
  const hasRemoteUrl = settings.some(s => s.key === "remote_ollama_url" && s.value && s.value !== "");

  const availableModels = models.filter(model => model.isAvailable);

  // Deduplicate local models by name, preferring ollama > huggingface > local-file
  const localModelsRaw = availableModels.filter(m => 
    ['ollama', 'huggingface', 'local-file'].includes(m.provider)
  );
  
  // Group models by base name and select the best provider
  const modelsByName = new Map<string, Model>();
  const providerPriority = ['ollama', 'huggingface', 'local-file'];
  
  for (const model of localModelsRaw) {
    // Extract base name (remove version tags like :1b, :Q4_K_M, etc)
    const baseName = model.name.split(':')[0];
    const existing = modelsByName.get(baseName);
    
    if (!existing) {
      modelsByName.set(baseName, model);
    } else {
      // Compare provider priority
      const existingPriority = providerPriority.indexOf(existing.provider);
      const newPriority = providerPriority.indexOf(model.provider);
      
      // Lower index = higher priority
      if (newPriority < existingPriority) {
        modelsByName.set(baseName, model);
      }
    }
  }
  
  const localModels = Array.from(modelsByName.values());
  const cloudModels = availableModels.filter(m => m.provider === 'openrouter');
  const remoteModels = availableModels.filter(m => m.provider === 'remote-ollama');
  
  const favoriteModels = availableModels.filter(m => favorites.includes(m.name));

  const refreshModelsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/models/refresh", {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to refresh models");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
      toast({
        title: "Models Refreshed",
        description: data.message || `Found ${data.modelsFound} models in Downloads folder`,
      });
    },
    onError: (error) => {
      toast({
        title: "Refresh Failed",
        description: error instanceof Error ? error.message : "Could not refresh models",
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
        description: `Found ${modelCount} models from Ollama and Downloads folder.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Could not scan for models",
        variant: "destructive",
      });
    },
  });

  const deleteModelMutation = useMutation({
    mutationFn: async (modelName: string) => {
      const response = await fetch(`/api/models/${encodeURIComponent(modelName)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to hide/unhide model");
      }
      const data = await response.json();
      return { ...data, modelName };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
      toast({
        title: data.action === "hidden" ? "Model Hidden" : "Model Unhidden",
        description: data.message,
      });
      
      // If we hid the currently selected model, clear selection
      if (selectedModel === data.modelName && data.action === "hidden") {
        onModelChange(null);
      }
    },
    onError: (error) => {
      toast({
        title: "Action Failed",
        description: error instanceof Error ? error.message : "Could not hide/unhide model",
        variant: "destructive",
      });
    },
  });

  const loadModelMutation = useMutation({
    mutationFn: async (modelName: string) => {
      const response = await fetch("/api/models/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to load model");
      }
      return response.json();
    },
    onMutate: (modelName) => {
      if (modelName.endsWith(".gguf")) {
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
        description: error instanceof Error ? error.message : "Could not load model",
        variant: "destructive",
      });
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
        title: "Model not found",
        description: "Please refresh models or check Downloads folder.",
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
        // If API fails, fail closed - prevent selection for security
        console.error("Failed to check password protection status:", error);
        toast({
          title: "Security Check Failed",
          description: "Unable to verify access permissions. Please try again.",
          variant: "destructive"
        });
        return; // Block selection if we can't verify
      }
    } else {
      onModelChange(value);
    }
  };

  const getTabContent = (tabModels: Model[], tabName: string, showDeleteButton = false) => {
    if (tabModels.length === 0) {
      return (
        <div className="text-center py-8 text-sm text-muted-foreground" data-testid={`text-no-${tabName}-models`}>
          {tabName === "local" ? (
            <div className="space-y-3">
              <p>No local models found.</p>
              <p className="text-xs">Download GGUF models to your Downloads folder and click Refresh.</p>
            </div>
          ) : (
            `No ${tabName} models available.`
          )}
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
                {model.provider === "local-file" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-700 dark:text-green-300 border border-green-500/30 shrink-0">
                    GGUF
                  </span>
                )}
              </div>
              {model.provider === "openrouter" && (model.parameters as any)?.pricing ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  ${(parseFloat((model.parameters as any).pricing.prompt) * 1000000).toFixed(2)} / ${(parseFloat((model.parameters as any).pricing.completion) * 1000000).toFixed(2)} per 1M tokens
                </p>
              ) : model.provider === "local-file" && (model.parameters as any)?.size ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {((model.parameters as any).size / 1024 / 1024 / 1024).toFixed(1)} GB
                </p>
              ) : model.parameters && typeof model.parameters === 'object' && 'size' in model.parameters && model.parameters.size ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {typeof model.parameters.size === 'number' 
                    ? `${(model.parameters.size / 1024 / 1024 / 1024).toFixed(1)} GB`
                    : model.parameters.size}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-yellow-500/20"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(model.name);
                }}
                data-testid={`button-favorite-${model.name}`}
              >
                <Star className={`w-4 h-4 ${favorites.includes(model.name) ? 'fill-yellow-500 text-yellow-500' : ''}`} />
              </Button>
              {showDeleteButton && model.provider === "local-file" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-destructive/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteModelMutation.mutate(model.name);
                  }}
                  disabled={deleteModelMutation.isPending}
                  data-testid={`button-delete-${model.name}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              )}
              <Button
                variant={selectedModel === model.name ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleModelSelect(model.name)}
                data-testid={`button-select-${model.name}`}
              >
                {selectedModel === model.name ? "Selected" : "Select"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-3" data-testid="model-selector">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Model Selection</h3>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInstructions(true)}
              className="h-8 text-xs"
              data-testid="button-instructions"
            >
              <Info className="w-3.5 h-3.5 mr-1.5" />
              How to Add Models
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshModelsMutation.mutate()}
              disabled={refreshModelsMutation.isPending}
              className="h-8 text-xs"
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshModelsMutation.isPending ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncModelsMutation.mutate()}
              disabled={syncModelsMutation.isPending}
              className="h-8 text-xs"
              data-testid="button-sync"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncModelsMutation.isPending ? 'animate-spin' : ''}`} />
              Sync All
            </Button>
          </div>
        </div>

        {modelsLoading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Loading models...
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="local" className="text-xs flex items-center gap-1">
                <Server className="w-3 h-3" />
                Local ({localModels.length})
              </TabsTrigger>
              <TabsTrigger value="cloud" className="text-xs flex items-center gap-1" disabled={!isOnline || !hasOpenRouterKey}>
                <Cloud className="w-3 h-3" />
                Cloud ({cloudModels.length})
              </TabsTrigger>
              <TabsTrigger value="favorites" className="text-xs flex items-center gap-1">
                <Star className="w-3 h-3" />
                Favs ({favoriteModels.length})
              </TabsTrigger>
              <TabsTrigger value="remote" className="text-xs flex items-center gap-1" disabled={!hasRemoteUrl}>
                <Server className="w-3 h-3" />
                Remote ({remoteModels.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="local" className="mt-3">
              {getTabContent(localModels, "local", true)}
            </TabsContent>

            <TabsContent value="cloud" className="mt-3">
              {!hasOpenRouterKey ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  OpenRouter API key required. Add it in Settings.
                </div>
              ) : !isOnline ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No internet connection. Cloud models unavailable.
                </div>
              ) : (
                getTabContent(cloudModels, "cloud")
              )}
            </TabsContent>

            <TabsContent value="favorites" className="mt-3">
              {getTabContent(favoriteModels, "favorites", favoriteModels.some(m => m.provider === "local-file"))}
            </TabsContent>

            <TabsContent value="remote" className="mt-3">
              {!hasRemoteUrl ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Configure Remote Ollama URL in Settings to use remote models.
                </div>
              ) : (
                getTabContent(remoteModels, "remote")
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <CloudModelPasswordDialog
        isOpen={showPasswordDialog}
        onClose={() => {
          setShowPasswordDialog(false);
          setPendingModel(null);
        }}
        onSuccess={() => {
          if (pendingModel) {
            onModelChange(pendingModel);
          }
          setShowPasswordDialog(false);
          setPendingModel(null);
        }}
      />

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              How to Add Models
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <DialogDescription>
              PocketLLM uses GGUF models that you download directly to your phone's Downloads folder.
            </DialogDescription>
            
            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="font-semibold text-sm mb-2">Step 1: Download a Model</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Use your browser to download GGUF models from:
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground ml-4">
                <li>• HuggingFace (search for ".gguf" files)</li>
                <li>• TheBloke's models (quantized versions)</li>
                <li>• Any direct GGUF download link</li>
              </ul>
            </div>

            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="font-semibold text-sm mb-2">Step 2: Model Goes to Downloads</h4>
              <p className="text-sm text-muted-foreground">
                Your browser will save the model to your Downloads folder automatically.
                No need to move it - PocketLLM scans Downloads directly.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="font-semibold text-sm mb-2">Step 3: Refresh Models</h4>
              <p className="text-sm text-muted-foreground">
                Click the "Refresh" button above to scan for new models.
                They'll appear in the Local tab ready to use.
              </p>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold text-sm mb-2">Recommended Models</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• <strong>Phi-3.5-mini:</strong> 3.8B params, great for mobile</li>
                <li>• <strong>Qwen2.5:</strong> Various sizes, excellent performance</li>
                <li>• <strong>Llama 3.2:</strong> 1B or 3B versions for mobile</li>
                <li>• <strong>Gemma 2:</strong> 2B version, efficient on device</li>
              </ul>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                <strong>Note:</strong> Choose Q4_K_M or Q5_K_M quantization for best balance of quality and performance on mobile.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}