import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TagsEditorProps {
  conversationId: string;
  tags: string[];
}

export default function TagsEditor({ conversationId, tags }: TagsEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTag, setNewTag] = useState("");
  const { toast } = useToast();

  const updateTagsMutation = useMutation({
    mutationFn: async (updatedTags: string[]) => {
      const response = await apiRequest("PATCH", `/api/conversations/${conversationId}/tags`, { tags: updatedTags });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
    },
    onError: (error) => {
      toast({
        title: "Failed to update tags",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    if (tags.includes(newTag.trim())) {
      toast({
        title: "Tag already exists",
        variant: "destructive",
      });
      return;
    }
    updateTagsMutation.mutate([...tags, newTag.trim()]);
    setNewTag("");
    setIsAdding(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    updateTagsMutation.mutate(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="tags-editor">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary"
          data-testid={`tag-${tag}`}
        >
          {tag}
          <button
            onClick={() => handleRemoveTag(tag)}
            className="hover:bg-primary/30 rounded-full p-0.5"
            disabled={updateTagsMutation.isPending}
            data-testid={`button-remove-tag-${tag}`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      
      {isAdding ? (
        <div className="flex items-center gap-1">
          <Input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddTag();
              if (e.key === "Escape") {
                setIsAdding(false);
                setNewTag("");
              }
            }}
            placeholder="Tag name..."
            className="h-7 w-24 text-xs"
            autoFocus
            data-testid="input-new-tag"
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={handleAddTag}
            disabled={updateTagsMutation.isPending}
            data-testid="button-confirm-tag"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => setIsAdding(true)}
          disabled={updateTagsMutation.isPending}
          data-testid="button-add-tag"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Tag
        </Button>
      )}
    </div>
  );
}
