import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ModelSelector from "@/components/ModelSelector";
import ConversationList from "@/components/ConversationList";
import ChatArea from "@/components/ChatArea";
import RAGPanel from "@/components/RAGPanel";
import SettingsModal from "@/components/SettingsModal";
import ThemeToggle from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarProvider, Sidebar, SidebarContent, SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  Settings, 
  Download, 
  Upload,
  Lightbulb
} from "lucide-react";
import type { RagDocument } from "@shared/schema";

export default function Chat() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("llama3.2:3b-instruct");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isMobile = useIsMobile();

  // Health check
  const { data: health } = useQuery({
    queryKey: ["/api/health"],
    refetchInterval: 30000, // Check every 30 seconds
  });

  // RAG documents count
  const { data: ragDocuments = [] } = useQuery<RagDocument[]>({
    queryKey: ["/api/rag/documents"],
  });

  const handleExport = async () => {
    try {
      const response = await fetch("/api/export");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = "pocket-llm-export.json";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);

      try {
        await fetch("/api/import", {
          method: "POST",
          body: formData,
        });
        // Refresh the page to show imported conversations
        window.location.reload();
      } catch (error) {
        console.error("Import failed:", error);
      }
    };
    input.click();
  };

  const totalChunks = ragDocuments?.reduce((sum, doc) => sum + doc.chunksCount, 0) || 0;

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="h-screen flex flex-col bg-background text-foreground w-full">
        {/* Top Navigation Bar */}
        <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 md:gap-4">
            {/* Mobile Menu Trigger */}
            <SidebarTrigger className="md:hidden" data-testid="button-mobile-menu" />
            
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Lightbulb className="w-5 h-5 text-primary-foreground" />
              </div>
              <h1 className="text-lg md:text-xl font-semibold text-foreground">Pocket LLM</h1>
            </div>
            
            {/* Server Status Badge - Hidden on very small screens */}
            <Badge 
              variant="secondary" 
              className={`hidden sm:flex ${health ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-destructive/10 border-destructive/30 text-destructive'}`}
              data-testid="server-status-badge"
            >
              <div className={`w-2 h-2 rounded-full mr-2 ${health ? 'bg-accent animate-pulse' : 'bg-destructive'}`} />
              {health ? 'Server Online' : 'Server Offline'}
            </Badge>
            
            {/* RAG Status Badge - Hidden on mobile */}
            {!isMobile && (
              <Badge variant="secondary" className="bg-primary/10 border-primary/30 text-primary" data-testid="rag-status-badge">
                {ragDocuments?.length || 0} docs / {totalChunks} chunks
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2 md:gap-3">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleExport} data-testid="button-export">
              <Download className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleImport} data-testid="button-import">
              <Upload className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsSettingsOpen(true)} data-testid="button-settings">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Responsive */}
          <Sidebar side="left" collapsible="offcanvas">
            <SidebarContent className="flex flex-col h-full">
              <div className="p-4 border-b border-border">
                <ModelSelector 
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                />
              </div>
              <ConversationList 
                selectedConversationId={selectedConversationId}
                onSelectConversation={setSelectedConversationId}
              />
            </SidebarContent>
          </Sidebar>

          {/* Main Chat Area */}
          <main className="flex-1 flex flex-col bg-background min-w-0">
            <ChatArea 
              conversationId={selectedConversationId}
              selectedModel={selectedModel}
              onConversationCreated={setSelectedConversationId}
            />
          </main>

          {/* Right Sidebar - RAG Panel - Hidden on mobile */}
          {!isMobile && <RAGPanel />}
        </div>

        {/* Settings Modal */}
        <SettingsModal 
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>
    </SidebarProvider>
  );
}
