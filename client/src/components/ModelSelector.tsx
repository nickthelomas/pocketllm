import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, List } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
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

  const pullModelMutation = useMutation({
    mutationFn: async (modelName: string) => {
      // In a real implementation, this would trigger model download
      return apiRequest("POST", "/api/models", {
        name: modelName,
        provider: "ollama",
        isAvailable: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
      toast({
        title: "Model Pull Initiated",
        description: "The model download has started.",
      });
    },
    onError: (error) => {
      toast({
        title: "Pull Failed",
        description: error.message,
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
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((model) => (
            <SelectItem key={model.id} value={model.name}>
              {model.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <div className="flex gap-2 mt-3">
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1"
          onClick={() => {
            const modelName = prompt("Enter model name to pull:");
            if (modelName) {
              pullModelMutation.mutate(modelName);
            }
          }}
          disabled={pullModelMutation.isPending}
          data-testid="button-pull-model"
        >
          <Download className="w-4 h-4 mr-2" />
          Pull Model
        </Button>
        <Button variant="outline" size="sm" className="flex-1" data-testid="button-list-models">
          <List className="w-4 h-4 mr-2" />
          List
        </Button>
      </div>
    </div>
  );
}
