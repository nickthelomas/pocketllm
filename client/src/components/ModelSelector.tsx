import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Model } from "@shared/schema";

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export default function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const { toast } = useToast();

  const { data: models = [] } = useQuery<Model[]>({
    queryKey: ["/api/models"],
  });

  const syncModelsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/models/sync");
      if (!response.ok) throw new Error("Failed to sync models");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
      toast({
        title: "Models Synced",
        description: "Local models have been synchronized from Ollama.",
      });
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    },
  });

  const pullModelMutation = useMutation({
    mutationFn: async (modelName: string) => {
      const response = await fetch("/api/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });

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
          if (data === "[DONE]") break;
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.status) {
              toast({
                title: "Pulling Model",
                description: `${parsed.status} (${Math.round(parsed.progress)}%)`,
              });
            }
          } catch (e) {
            console.error("Failed to parse pull progress:", e);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
      toast({
        title: "Model Downloaded",
        description: "The model is now available for use.",
      });
    },
    onError: (error) => {
      toast({
        title: "Pull Failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    },
  });

  const availableModels = models.filter(model => model.isAvailable);

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-2">
        Active Model
      </label>
      <Select value={selectedModel} onValueChange={onModelChange} data-testid="select-model">
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
          onClick={() => {
            const modelName = prompt("Enter Ollama model name to pull (e.g., llama3.2, mistral):");
            if (modelName) {
              pullModelMutation.mutate(modelName);
            }
          }}
          disabled={pullModelMutation.isPending}
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
    </div>
  );
}
