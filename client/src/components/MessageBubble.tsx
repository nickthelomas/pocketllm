import { Bot, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Message } from "@shared/schema";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export default function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  if (message.role === "user") {
    return (
      <div className="flex justify-end" data-testid={`message-${message.id}`}>
        <div className="max-w-[80%]">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 mt-1.5">
            <span className="text-xs text-muted-foreground">
              {formatTime(message.createdAt)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start" data-testid={`message-${message.id}`}>
      <div className="max-w-[80%]">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center shrink-0 mt-1">
            <Bot className="w-5 h-5 text-accent-foreground" />
          </div>
          <div className="flex-1">
            <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {message.content}
                {isStreaming && <span className="animate-pulse">▊</span>}
              </div>
              
              {/* Citations */}
              {message.citations && Array.isArray(message.citations) && (message.citations as any[]).length > 0 && (
                <div className="mt-3 space-y-2">
                  {(message.citations as any[]).map((citation: any, index: number) => (
                    <div
                      key={index}
                      className="p-3 bg-primary/5 border border-primary/30 rounded-lg"
                      data-testid={`citation-${index}`}
                    >
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-primary shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1">
                          <div className="text-xs font-medium text-primary mb-1">
                            Source: {String(citation.source || "Unknown")}
                          </div>
                          <p className="text-xs text-muted-foreground italic">
                            "{String(citation.content || "")}"
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-muted-foreground">
                {formatTime(message.createdAt)}
              </span>
              {message.model && (
                <Badge variant="secondary" className="text-xs">
                  {message.model}
                </Badge>
              )}
              {isStreaming && (
                <span className="text-xs text-accent">Generating...</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
