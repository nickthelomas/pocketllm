import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Paperclip, Square, RotateCcw, Settings } from "lucide-react";
import MessageBubble from "./MessageBubble";
import MCPToolsDialog from "./MCPToolsDialog";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Message } from "@shared/schema";

interface ChatAreaProps {
  conversationId: string | null;
  selectedModel: string;
  onConversationCreated: (id: string) => void;
}

export default function ChatArea({ conversationId, selectedModel, onConversationCreated }: ChatAreaProps) {
  const [message, setMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [showMCPTools, setShowMCPTools] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["/api/conversations", conversationId, "messages"],
    enabled: !!conversationId,
  });

  const { data: conversation } = useQuery({
    queryKey: ["/api/conversations", conversationId],
    enabled: !!conversationId,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const clearChatMutation = useMutation({
    mutationFn: async () => {
      if (!conversationId) return;
      return apiRequest("DELETE", `/api/conversations/${conversationId}/messages`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      toast({
        title: "Chat cleared",
      });
    },
  });

  const sendMessage = async () => {
    if (!message.trim() || isStreaming) return;

    let currentConversationId = conversationId;

    // Create conversation if none exists
    if (!currentConversationId) {
      try {
        const response = await apiRequest("POST", "/api/conversations", {
          title: message.slice(0, 50) + (message.length > 50 ? "..." : ""),
          userId: null,
        });
        const newConv = await response.json();
        currentConversationId = newConv.id;
        onConversationCreated(currentConversationId);
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      } catch (error) {
        toast({
          title: "Failed to create conversation",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
    }

    const userMessage = message;
    setMessage("");
    setIsStreaming(true);
    setStreamingMessage("");

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
          conversationId: currentConversationId,
          model: selectedModel,
          context: [],
          ragSources: [],
          settings: {},
        }),
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              setIsStreaming(false);
              setStreamingMessage("");
              // Refresh messages
              queryClient.invalidateQueries({ 
                queryKey: ["/api/conversations", currentConversationId, "messages"] 
              });
              break;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.fullResponse) {
                setStreamingMessage(parsed.fullResponse);
              }
            } catch (e) {
              // Ignore parsing errors for incomplete JSON
            }
          }
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
      setIsStreaming(false);
      setStreamingMessage("");
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const stopGeneration = () => {
    setIsStreaming(false);
    setStreamingMessage("");
    // In a real implementation, we'd abort the fetch request
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-2">Welcome to Pocket LLM</h2>
          <p className="text-muted-foreground mb-4">Start a conversation to begin</p>
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask a question or type a message..."
                className="pr-16 resize-none"
                rows={3}
                data-testid="input-new-message"
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={sendMessage}
                  disabled={!message.trim() || isStreaming}
                  data-testid="button-send-message"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Chat Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground" data-testid="text-conversation-title">
            {conversation?.title || "Loading..."}
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-message-count">
            {messages.length} messages
          </Badge>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (confirm("Are you sure you want to clear this chat?")) {
              clearChatMutation.mutate();
            }
          }}
          disabled={clearChatMutation.isPending}
          data-testid="button-clear-current-chat"
        >
          Clear Chat
        </Button>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-6 py-6" data-testid="messages-container">
        <div className="max-w-4xl mx-auto space-y-6">
          {isLoading ? (
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex justify-start">
                    <div className="max-w-[80%]">
                      <div className="h-20 bg-muted rounded-2xl"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {messages.map((msg: Message) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              
              {/* Streaming message */}
              {isStreaming && streamingMessage && (
                <MessageBubble
                  message={{
                    id: "streaming",
                    role: "assistant",
                    content: streamingMessage,
                    conversationId: conversationId!,
                    model: selectedModel,
                    citations: null,
                    createdAt: new Date(),
                  }}
                  isStreaming={true}
                />
              )}
            </>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Message Composer */}
      <div className="border-t border-border p-4">
        <div className="max-w-4xl mx-auto">
          {/* Quick Actions */}
          <div className="flex items-center gap-2 mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMCPTools(true)}
              data-testid="button-mcp-tools"
            >
              <Settings className="w-3.5 h-3.5 mr-1.5" />
              MCP Tools
            </Button>
            <Button variant="outline" size="sm" data-testid="button-adjust-context">
              <Settings className="w-3.5 h-3.5 mr-1.5" />
              Context: Last 10 turns
            </Button>
            <div className="flex-1"></div>
            <div className="text-xs text-muted-foreground">
              Tokens: <span className="font-mono">1,247 / 4,096</span>
            </div>
          </div>

          {/* Input Area */}
          <div className="relative">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask a question or type a message..."
              className="pr-24 resize-none"
              rows={3}
              disabled={isStreaming}
              data-testid="input-message"
            />

            <div className="absolute right-3 bottom-3 flex items-center gap-2">
              <Button variant="ghost" size="sm" data-testid="button-attach-file">
                <Paperclip className="w-5 h-5" />
              </Button>
              <Button
                size="sm"
                onClick={sendMessage}
                disabled={!message.trim() || isStreaming}
                data-testid="button-send"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Stop/Reset Buttons */}
          {isStreaming && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={stopGeneration}
                data-testid="button-stop-generation"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop Generation
              </Button>
              <Button variant="outline" size="sm" data-testid="button-reset-input">
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          )}
        </div>
      </div>

      <MCPToolsDialog open={showMCPTools} onOpenChange={setShowMCPTools} />
    </>
  );
}
