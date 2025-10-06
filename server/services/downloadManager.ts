// Download Manager Service - Manages model downloads with queue and progress tracking
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';

export interface DownloadTask {
  id: string;
  name: string;
  source: 'ollama' | 'huggingface' | 'remote-ollama';
  downloadUrl?: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number;
  statusMessage: string;
  totalSize?: number;
  downloadedSize?: number;
  startTime?: number;
  endTime?: number;
  error?: string;
  targetPath?: string;
}

class DownloadManager extends EventEmitter {
  private downloads: Map<string, DownloadTask> = new Map();
  private activeDownloads = 0;
  private maxConcurrent = 2; // Max concurrent downloads
  private queue: string[] = [];

  constructor() {
    super();
  }

  // Add a download to the queue
  async addDownload(task: Omit<DownloadTask, 'id' | 'status' | 'progress' | 'statusMessage'>): Promise<string> {
    const id = `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const downloadTask: DownloadTask = {
      ...task,
      id,
      status: 'pending',
      progress: 0,
      statusMessage: 'Queued for download',
    };

    this.downloads.set(id, downloadTask);
    this.queue.push(id);
    
    // Emit event for new download
    this.emit('download-added', downloadTask);
    
    // Process queue
    this.processQueue();
    
    return id;
  }

  // Get all downloads
  getDownloads(): DownloadTask[] {
    return Array.from(this.downloads.values());
  }

  // Get specific download
  getDownload(id: string): DownloadTask | undefined {
    return this.downloads.get(id);
  }

  // Get active downloads
  getActiveDownloads(): DownloadTask[] {
    return Array.from(this.downloads.values()).filter(d => d.status === 'downloading');
  }

  // Get download statistics
  getStats() {
    const downloads = this.getDownloads();
    return {
      total: downloads.length,
      pending: downloads.filter(d => d.status === 'pending').length,
      downloading: downloads.filter(d => d.status === 'downloading').length,
      completed: downloads.filter(d => d.status === 'completed').length,
      failed: downloads.filter(d => d.status === 'failed').length,
      activeDownloads: this.activeDownloads,
      queueLength: this.queue.length,
    };
  }

  // Update download progress
  updateProgress(id: string, progress: number, statusMessage: string, additionalData?: Partial<DownloadTask>) {
    const download = this.downloads.get(id);
    if (!download) return;

    download.progress = progress;
    download.statusMessage = statusMessage;
    
    if (additionalData) {
      Object.assign(download, additionalData);
    }

    this.emit('progress', download);
  }

  // Mark download as completed
  completeDownload(id: string, targetPath?: string) {
    const download = this.downloads.get(id);
    if (!download) return;

    download.status = 'completed';
    download.progress = 100;
    download.statusMessage = 'Download complete';
    download.endTime = Date.now();
    
    if (targetPath) {
      download.targetPath = targetPath;
    }

    this.activeDownloads--;
    this.emit('completed', download);
    this.processQueue();
  }

  // Mark download as failed
  failDownload(id: string, error: string) {
    const download = this.downloads.get(id);
    if (!download) return;

    download.status = 'failed';
    download.error = error;
    download.statusMessage = `Failed: ${error}`;
    download.endTime = Date.now();

    this.activeDownloads--;
    this.emit('failed', download);
    this.processQueue();
  }

  // Cancel a download
  async cancelDownload(id: string): Promise<boolean> {
    const download = this.downloads.get(id);
    if (!download) return false;

    if (download.status === 'pending') {
      // Remove from queue
      const index = this.queue.indexOf(id);
      if (index > -1) {
        this.queue.splice(index, 1);
      }
    }

    // Check if was downloading before marking as failed
    const wasDownloading = download.status === 'downloading';
    
    download.status = 'failed';
    download.error = 'Cancelled by user';
    download.statusMessage = 'Download cancelled';
    download.endTime = Date.now();

    if (wasDownloading) {
      this.activeDownloads--;
    }

    this.emit('cancelled', download);
    this.processQueue();
    return true;
  }

  // Clear completed/failed downloads
  clearHistory() {
    const toRemove: string[] = [];
    
    // Use Array.from to avoid iteration issues
    Array.from(this.downloads.entries()).forEach(([id, download]) => {
      if (download.status === 'completed' || download.status === 'failed') {
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => this.downloads.delete(id));
    this.emit('history-cleared', toRemove.length);
  }

  // Process download queue
  private async processQueue() {
    while (this.activeDownloads < this.maxConcurrent && this.queue.length > 0) {
      const id = this.queue.shift();
      if (!id) continue;

      const download = this.downloads.get(id);
      if (!download || download.status !== 'pending') continue;

      download.status = 'downloading';
      download.startTime = Date.now();
      download.statusMessage = 'Starting download...';
      this.activeDownloads++;

      this.emit('download-started', download);
    }
  }

  // Download a file with progress tracking
  async downloadFile(
    url: string, 
    targetPath: string, 
    onProgress?: (progress: number, downloaded: number, total: number) => void
  ): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    const totalSize = parseInt(response.headers.get('content-length') || '0');
    let downloadedSize = 0;

    // Ensure directory exists
    const dir = path.dirname(targetPath);
    await fs.mkdir(dir, { recursive: true });

    const fileHandle = await fs.open(targetPath, 'w');
    const reader = response.body?.getReader();
    
    if (!reader) throw new Error('No response body');

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        await fileHandle.write(value);
        downloadedSize += value.length;
        
        if (onProgress) {
          const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
          onProgress(progress, downloadedSize, totalSize);
        }
      }
    } finally {
      await fileHandle.close();
    }
  }

  // Validate HuggingFace URL
  validateHuggingFaceUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      
      // Only allow HTTPS
      if (parsedUrl.protocol !== 'https:') {
        return false;
      }
      
      // Only allow huggingface.co and *.huggingface.co subdomains
      return hostname === 'huggingface.co' || hostname.endsWith('.huggingface.co');
    } catch {
      return false;
    }
  }

  // Get download speed
  calculateSpeed(download: DownloadTask): string {
    if (!download.startTime || !download.downloadedSize) {
      return '0 MB/s';
    }

    const elapsed = (Date.now() - download.startTime) / 1000; // seconds
    const speed = download.downloadedSize / elapsed / (1024 * 1024); // MB/s
    
    return `${speed.toFixed(1)} MB/s`;
  }

  // Get estimated time remaining
  calculateETA(download: DownloadTask): string {
    if (!download.startTime || !download.downloadedSize || !download.totalSize) {
      return 'Unknown';
    }

    const elapsed = (Date.now() - download.startTime) / 1000;
    const speed = download.downloadedSize / elapsed;
    const remaining = download.totalSize - download.downloadedSize;
    const eta = remaining / speed;

    if (eta < 60) {
      return `${Math.round(eta)}s`;
    } else if (eta < 3600) {
      return `${Math.round(eta / 60)}m`;
    } else {
      return `${Math.round(eta / 3600)}h`;
    }
  }
}

// Export singleton instance
export const downloadManager = new DownloadManager();