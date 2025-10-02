import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Conversation } from "@shared/schema";

interface ConversationListProps {
  selectedConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
}

export default function ConversationList({ selectedConversationId, onSelectConversation }: ConversationListProps) {
  const { toast } = useToast();

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["/api/conversations"],
  });

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/conversations", {
        title: "New Conversation",
        userId: null,
      });
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      const newConv = response.json();
      onSelectConversation(newConv.id);
    },
    onError: (error) => {
      toast({
        title: "Failed to create conversation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (selectedConversationId === deletedId) {
        onSelectConversation(null);
      }
      toast({
        title: "Conversation deleted",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete conversation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      // Delete all conversations
      await Promise.all(
        conversations.map((conv: Conversation) => 
          apiRequest("DELETE", `/api/conversations/${conv.id}`)
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      onSelectConversation(null);
      toast({
        title: "All conversations cleared",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to clear conversations",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatDate = (date: string) => {
    const now = new Date();
    const messageDate = new Date(date);
    const diffInHours = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return `${Math.floor(diffInHours)} hours ago`;
    } else if (diffInHours < 48) {
      return "Yesterday";
    } else {
      return `${Math.floor(diffInHours / 24)} days ago`;
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-3/4"></div>
          <div className="h-16 bg-muted rounded"></div>
          <div className="h-16 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => createConversationMutation.mutate()}
              disabled={createConversationMutation.isPending}
              data-testid="button-new-chat"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-2">
            {conversations.map((conversation: Conversation) => (
              <div
                key={conversation.id}
                className={`group cursor-pointer rounded-lg p-3 transition-colors ${
                  selectedConversationId === conversation.id
                    ? "bg-primary/10 border border-primary/30"
                    : "bg-background/50 hover:bg-muted/10 border border-transparent hover:border-border"
                }`}
                onClick={() => onSelectConversation(conversation.id)}
                data-testid={`conversation-${conversation.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-foreground truncate">
                      {conversation.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs ${selectedConversationId === conversation.id ? 'text-primary' : 'text-muted-foreground'}`}>
                        {formatDate(conversation.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 hover:bg-destructive/20 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversationMutation.mutate(conversation.id);
                    }}
                    disabled={deleteConversationMutation.isPending}
                    data-testid={`button-delete-conversation-${conversation.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {conversations.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No conversations yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => createConversationMutation.mutate()}
                disabled={createConversationMutation.isPending}
                data-testid="button-create-first-chat"
              >
                Start your first chat
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Clear All Button */}
      {conversations.length > 0 && (
        <div className="p-3 border-t border-border">
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => {
              if (confirm("Are you sure you want to clear all conversations?")) {
                clearAllMutation.mutate();
              }
            }}
            disabled={clearAllMutation.isPending}
            data-testid="button-clear-all-chats"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All Chats
          </Button>
        </div>
      )}
    </>
  );
}
