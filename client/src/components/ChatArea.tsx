import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Paperclip, Square, RotateCcw, Settings, Mic, MicOff, Volume2 } from "lucide-react";
import MessageBubble from "@/components/MessageBubble";
import TagsEditor from "@/components/TagsEditor";
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
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/api/conversations", conversationId, "messages"],
    enabled: !!conversationId,
  });

  const { data: conversation } = useQuery<{ id: string; title: string; tags: string[]; isFavorite: boolean }>({
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
      if (!conversationId) throw new Error("No conversation selected");
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

    let currentConversationId: string = conversationId || "";

    // Create conversation if none exists
    if (!conversationId) {
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
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
        return;
      }
    } else {
      currentConversationId = conversationId;
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
        description: error instanceof Error ? error.message : String(error),
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

  // Voice input using Web Speech API
  const toggleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      toast({
        title: "Voice input not supported",
        description: "Your browser doesn't support voice recognition",
        variant: "destructive",
      });
      return;
    }

    if (recognitionRef.current) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const finalTranscript = Array.from(event.results)
        .filter((result: any) => result.isFinal)
        .map((result: any) => result[0].transcript)
        .join('');
      
      if (finalTranscript) {
        setMessage(prev => prev ? `${prev} ${finalTranscript}` : finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      recognitionRef.current = null;
      
      if (event.error === 'not-allowed') {
        toast({
          title: "Microphone permission denied",
          description: "Please allow microphone access in your browser settings",
          variant: "destructive",
        });
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        toast({
          title: "Voice input error",
          description: 'Error: ' + event.error,
          variant: "destructive",
        });
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (error) {
      setIsListening(false);
      recognitionRef.current = null;
      toast({
        title: "Voice input failed",
        description: "Could not start voice recognition",
        variant: "destructive",
      });
    }
  };

  // Voice output using Web Speech Synthesis API
  const speakMessage = (text: string, messageId: string) => {
    if (!window.speechSynthesis) {
      toast({
        title: "Text-to-speech not supported",
        description: "Your browser doesn't support text-to-speech",
        variant: "destructive",
      });
      return;
    }

    if (speakingMessageId === messageId && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setSpeakingMessageId(messageId);
    };

    utterance.onend = () => {
      setSpeakingMessageId(null);
    };

    utterance.onerror = (event) => {
      setSpeakingMessageId(null);
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        toast({
          title: "Speech error",
          description: "Failed to speak the message",
          variant: "destructive",
        });
      }
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      setSpeakingMessageId(null);
      toast({
        title: "Speech error",
        description: "Failed to start speech synthesis",
        variant: "destructive",
      });
    }
  };

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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
                  variant="ghost"
                  size="sm"
                  onClick={toggleVoiceInput}
                  disabled={isStreaming}
                  data-testid="button-voice-input"
                  className={isListening ? 'text-red-500' : ''}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
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
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
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
        {conversation && (
          <TagsEditor 
            conversationId={conversationId!} 
            tags={conversation.tags || []} 
          />
        )}
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
              {messages.map((msg) => (
                <MessageBubble 
                  key={msg.id} 
                  message={msg} 
                  onSpeak={speakMessage}
                  speakingMessageId={speakingMessageId}
                />
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
                  onSpeak={speakMessage}
                  speakingMessageId={speakingMessageId}
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
                variant="ghost"
                size="sm"
                onClick={toggleVoiceInput}
                disabled={isStreaming}
                data-testid="button-voice-input-main"
                className={isListening ? 'text-red-500' : ''}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
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
    </>
  );
}
