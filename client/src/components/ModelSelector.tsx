import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

export default function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const { toast } = useToast();
  const [showCatalog, setShowCatalog] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<{ status: string; progress: number } | null>(null);

  const { data: models = [], isLoading: modelsLoading } = useQuery<Model[]>({
    queryKey: ["/api/models"],
  });

  const { data: catalogData, isError: catalogError } = useQuery({
    queryKey: ["/api/models/catalog"],
    enabled: showCatalog,
    retry: false,
  });

  const availableModels = models.filter(model => model.isAvailable);

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
      loadModelMutation.mutate(selectedModel);
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
        throw new Error("Failed to load model");
      }
      return response.json();
    },
    onSuccess: (data) => {
      console.log(`✅ ${data.message}`);
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
    mutationFn: async ({ name, source }: { name: string; source: string }) => {
      setIsPulling(true);
      setPullProgress({ status: "Starting download...", progress: 0 });
      
      const response = await fetch("/api/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, source }),
      });

      if (response.status === 503) {
        const error = await response.json();
        throw new Error(error.message || "Network unavailable");
      }

      if (!response.ok) throw new Error("Failed to pull model");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

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
            setPullProgress(null);
            return; // Success
          }
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.status) {
              setPullProgress({
                status: parsed.status,
                progress: Math.round(parsed.progress || 0)
              });
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
              throw e;
            }
          }
        }
      }
    },
    onSuccess: () => {
      setIsPulling(false);
      setPullProgress(null);
      setShowCatalog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
      toast({
        title: "Pull Completed",
        description: "Model downloaded and ready to use.",
      });
    },
    onError: (error) => {
      setIsPulling(false);
      setPullProgress(null);
      toast({
        title: "Pull Failed",
        description: error instanceof Error ? error.message : "Could not download model",
        variant: "destructive",
      });
    },
  });

  const handleModelSelect = (value: string) => {
    const modelExists = availableModels.some(m => m.name === value);
    if (modelExists) {
      onModelChange(value);
    } else {
      toast({
        title: "Model not found locally",
        description: "Please sync or pull the model first.",
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-2">
        Active Model
      </label>
      <Select value={selectedModel} onValueChange={handleModelSelect} data-testid="select-model">
        <SelectTrigger>
          <SelectValue placeholder="Select a model..." />
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
          disabled={isPulling}
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
          disabled={syncModelsMutation.isPending || isPulling}
          data-testid="button-sync-models"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Sync
        </Button>
      </div>

      <Dialog open={showCatalog} onOpenChange={setShowCatalog}>
        <DialogContent className="max-w-md" data-testid="dialog-pull-catalog">
          <DialogHeader>
            <DialogTitle>Pull Model from Ollama</DialogTitle>
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
          ) : (
            <div className="space-y-3">
              {pullProgress ? (
                <div className="space-y-3">
                  <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                    <p className="text-sm font-medium mb-2">{pullProgress.status}</p>
                    <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-primary h-full transition-all duration-300"
                        style={{ width: `${pullProgress.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{pullProgress.progress}% complete</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Select a model to download from Ollama:
                  </p>
                  
                  {catalogData?.catalog?.map((model: CatalogModel) => (
                    <div 
                      key={model.name}
                      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium">{model.name}</h4>
                          {model.source === "huggingface" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/30">
                              HF
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-muted-foreground">{model.size}</span>
                        <Button
                          size="sm"
                          onClick={() => pullModelMutation.mutate({ name: model.name, source: model.source })}
                          disabled={isPulling}
                          data-testid={`button-pull-${model.name}`}
                        >
                          Pull
                        </Button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
