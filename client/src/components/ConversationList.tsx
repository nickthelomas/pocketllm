import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Search, X, Star } from "lucide-react";
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
  const [searchQuery, setSearchQuery] = useState("");

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/conversations", {
        title: "New Conversation",
        userId: null,
      });
    },
    onSuccess: async (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      const newConv = await response.json();
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

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      const response = await apiRequest("PATCH", `/api/conversations/${id}/favorite`, { isFavorite });
      return { id, data: await response.json() };
    },
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", id] });
    },
    onError: (error) => {
      toast({
        title: "Failed to update favorite",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    
    const query = searchQuery.toLowerCase();
    return conversations.filter((conv) => 
      conv.title.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

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

          {/* Search Input */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 bg-background"
              data-testid="input-search-conversations"
            />
            {searchQuery && (
              <Button
                size="sm"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setSearchQuery("")}
                data-testid="button-clear-search"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {filteredConversations.map((conversation) => (
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
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground truncate flex-1">
                        {conversation.title}
                      </h3>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`h-6 w-6 p-0 ${conversation.isFavorite ? 'text-yellow-500' : 'text-muted-foreground'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavoriteMutation.mutate({ 
                            id: conversation.id, 
                            isFavorite: !conversation.isFavorite 
                          });
                        }}
                        disabled={toggleFavoriteMutation.isPending}
                        data-testid={`button-favorite-${conversation.id}`}
                      >
                        <Star className={`w-4 h-4 ${conversation.isFavorite ? 'fill-current' : ''}`} />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs ${selectedConversationId === conversation.id ? 'text-primary' : 'text-muted-foreground'}`}>
                        {formatDate(conversation.updatedAt.toString())}
                      </span>
                      {conversation.tags && conversation.tags.length > 0 && (
                        <div className="flex gap-1">
                          {conversation.tags.slice(0, 2).map((tag, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary"
                              data-testid={`tag-${tag}`}
                            >
                              {tag}
                            </span>
                          ))}
                          {conversation.tags.length > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +{conversation.tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
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

          {filteredConversations.length === 0 && conversations.length > 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No matching conversations</p>
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
