export interface RAGChunk {
  id: string;
  content: string;
  source: string;
  similarity: number;
}

export class RAGClient {
  async searchSimilarChunks(query: string, topK = 3, threshold = 0.7): Promise<RAGChunk[]> {
    try {
      // In a real implementation, this would:
      // 1. Generate embedding for the query
      // 2. Search for similar chunks in the vector store
      // 3. Return relevant chunks with similarity scores
      
      const response = await fetch("/api/rag/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          topK,
          threshold,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to search RAG chunks");
      }

      return await response.json();
    } catch (error) {
      console.error("RAG search error:", error);
      return [];
    }
  }

  async uploadDocument(file: File): Promise<{ success: boolean; documentId?: string; error?: string }> {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/rag/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();
      return { success: true, documentId: result.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteDocument(documentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`/api/rag/documents/${documentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Delete failed");
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export const ragClient = new RAGClient();
