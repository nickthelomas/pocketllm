import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, CheckCircle, XCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DownloadItem {
  id: string;
  name: string;
  status: string;
  progress: number;
  error?: string;
  completedAt?: number;
}

export default function DownloadsPanel() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  useEffect(() => {
    // Load downloads from localStorage
    const savedDownloads = localStorage.getItem("downloads");
    if (savedDownloads) {
      setDownloads(JSON.parse(savedDownloads));
    }

    // Listen for download events
    const handleDownloadUpdate = (event: CustomEvent) => {
      const { id, name, status, progress, error } = event.detail;
      
      setDownloads(prev => {
        const existing = prev.find(d => d.id === id);
        const updated = existing 
          ? prev.map(d => d.id === id 
              ? { ...d, status, progress, error, completedAt: status === 'complete' ? Date.now() : d.completedAt }
              : d)
          : [...prev, { id, name, status, progress, error }];
        
        // Save to localStorage
        localStorage.setItem("downloads", JSON.stringify(updated));
        
        // Remove completed downloads after 30 seconds
        if (status === 'complete') {
          setTimeout(() => {
            setDownloads(prev => {
              const filtered = prev.filter(d => d.id !== id);
              localStorage.setItem("downloads", JSON.stringify(filtered));
              return filtered;
            });
          }, 30000);
        }
        
        return updated;
      });
    };

    window.addEventListener('download-update' as any, handleDownloadUpdate);
    
    return () => {
      window.removeEventListener('download-update' as any, handleDownloadUpdate);
    };
  }, []);

  const activeDownloads = downloads.filter(d => d.status === 'downloading');
  const completedDownloads = downloads.filter(d => d.status === 'complete');
  const failedDownloads = downloads.filter(d => d.status === 'error');

  return (
    <div className="flex flex-col h-full" data-testid="downloads-panel">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Download className="w-5 h-5" />
          Downloads
        </h2>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {downloads.length === 0 ? (
            <div className="text-center text-muted-foreground py-8" data-testid="text-no-downloads">
              <Download className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No active downloads</p>
            </div>
          ) : (
            <>
              {activeDownloads.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Active</h3>
                  {activeDownloads.map(download => (
                    <Card key={download.id} data-testid={`download-${download.id}`}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Download className="w-4 h-4 text-primary animate-bounce" />
                          {download.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <Progress value={download.progress} data-testid={`progress-${download.id}`} />
                          <p className="text-xs text-muted-foreground">
                            {download.status} - {Math.round(download.progress)}%
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {completedDownloads.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Completed</h3>
                  {completedDownloads.map(download => (
                    <Card key={download.id} className="bg-accent/5" data-testid={`download-complete-${download.id}`}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-accent" />
                          {download.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground">Download complete</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {failedDownloads.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Failed</h3>
                  {failedDownloads.map(download => (
                    <Card key={download.id} className="bg-destructive/5" data-testid={`download-error-${download.id}`}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-destructive" />
                          {download.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-destructive">{download.error || 'Download failed'}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
