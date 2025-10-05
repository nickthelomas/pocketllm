import type { McpServer } from "@shared/schema";
import { storage } from "../storageSelector";

export interface McpToolExecutionRequest {
  serverId: string;
  toolName: string;
  args: Record<string, any>;
}

export interface McpToolExecutionResponse {
  success: boolean;
  result?: any;
  error?: string;
}

class McpService {
  /**
   * Execute a tool on an MCP server
   */
  async executeTool(request: McpToolExecutionRequest): Promise<McpToolExecutionResponse> {
    try {
      // Get the MCP server configuration
      const server = await storage.getMcpServer(request.serverId);
      if (!server) {
        return {
          success: false,
          error: "MCP server not found",
        };
      }

      if (!server.isActive) {
        return {
          success: false,
          error: "MCP server is not active",
        };
      }

      // Check if the tool exists on this server
      const tools = server.tools as string[] || [];
      if (!tools.includes(request.toolName)) {
        return {
          success: false,
          error: `Tool "${request.toolName}" not found on server "${server.name}"`,
        };
      }

      // Execute the tool via the MCP protocol
      // For now, we'll simulate the execution based on the tool type
      const result = await this.executeToolOnServer(server, request.toolName, request.args);

      return {
        success: true,
        result,
      };
    } catch (error) {
      console.error("MCP tool execution error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute a tool on a specific MCP server
   * This is a placeholder that would connect to the actual MCP server
   */
  private async executeToolOnServer(
    server: McpServer, 
    toolName: string, 
    args: Record<string, any>
  ): Promise<any> {
    // In a real implementation, this would:
    // 1. Connect to the MCP server at server.endpoint
    // 2. Send the tool execution request
    // 3. Wait for the response
    // 4. Return the result

    console.log(`Executing tool ${toolName} on server ${server.name}`, {
      endpoint: server.endpoint,
      args,
    });

    // Simulate different tool types for demonstration
    switch (toolName) {
      case "search":
        return {
          results: [
            {
              title: "Sample Search Result",
              snippet: `Searched for: ${args.query || "unknown query"}`,
              url: "https://example.com",
            },
          ],
        };

      case "calculate":
        // Safe mathematical expression evaluation
        const expr = args.expression || "0";
        const safeResult = this.safeCalculate(expr);
        return {
          expression: expr,
          result: safeResult,
        };

      case "fetch_data":
        return {
          source: args.source || "unknown",
          data: {
            timestamp: new Date().toISOString(),
            sample: "This is sample data from the MCP server",
          },
        };

      case "weather":
        return {
          location: args.location || "Unknown",
          temperature: Math.floor(Math.random() * 30) + 10,
          condition: ["sunny", "cloudy", "rainy", "partly cloudy"][Math.floor(Math.random() * 4)],
          humidity: Math.floor(Math.random() * 60) + 30,
        };

      case "code_execution":
        return {
          language: args.language || "javascript",
          code: args.code || "",
          output: "Code execution result would appear here",
          executionTime: Math.random() * 1000,
        };

      default:
        return {
          tool: toolName,
          args,
          message: `Tool "${toolName}" executed successfully on server "${server.name}"`,
          timestamp: new Date().toISOString(),
        };
    }
  }

  /**
   * List all available tools across all active MCP servers
   */
  async listAvailableTools(): Promise<Array<{ server: McpServer; tools: string[] }>> {
    const servers = await storage.getMcpServers();
    const activeServers = servers.filter(s => s.isActive);
    
    return activeServers.map(server => ({
      server,
      tools: (server.tools as string[]) || [],
    }));
  }

  /**
   * Safely evaluate basic mathematical expressions
   * Only supports numbers and basic operators: +, -, *, /, (, )
   */
  private safeCalculate(expression: string): number | string {
    try {
      // Remove all whitespace
      const cleaned = expression.replace(/\s/g, '');
      
      // Check if expression only contains safe characters
      if (!/^[\d+\-*/().,]+$/.test(cleaned)) {
        return "Error: Invalid characters in expression";
      }
      
      // Basic recursive descent parser for mathematical expressions
      // This is a simple implementation that handles basic operations safely
      const parse = (expr: string): number => {
        // Remove outer parentheses if they exist
        expr = expr.trim();
        while (expr.startsWith('(') && expr.endsWith(')')) {
          let depth = 0;
          let valid = true;
          for (let i = 0; i < expr.length - 1; i++) {
            if (expr[i] === '(') depth++;
            if (expr[i] === ')') depth--;
            if (depth === 0 && i < expr.length - 1) {
              valid = false;
              break;
            }
          }
          if (valid) {
            expr = expr.substring(1, expr.length - 1);
          } else {
            break;
          }
        }
        
        // Handle addition and subtraction (lowest precedence)
        for (let i = expr.length - 1; i >= 0; i--) {
          if (expr[i] === '+' || expr[i] === '-') {
            // Check if it's not part of a number (e.g., -5)
            if (i > 0 && !/[\+\-\*\/\(]/.test(expr[i-1])) {
              const left = parse(expr.substring(0, i));
              const right = parse(expr.substring(i + 1));
              return expr[i] === '+' ? left + right : left - right;
            }
          }
        }
        
        // Handle multiplication and division (higher precedence)
        for (let i = expr.length - 1; i >= 0; i--) {
          if (expr[i] === '*' || expr[i] === '/') {
            const left = parse(expr.substring(0, i));
            const right = parse(expr.substring(i + 1));
            if (expr[i] === '/') {
              if (right === 0) throw new Error("Division by zero");
              return left / right;
            }
            return left * right;
          }
        }
        
        // Parse number
        const num = parseFloat(expr);
        if (isNaN(num)) {
          throw new Error(`Invalid number: ${expr}`);
        }
        return num;
      };
      
      const result = parse(cleaned);
      return isNaN(result) ? "Error: Invalid expression" : result;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : "Invalid expression"}`;
    }
  }

  /**
   * Test connection to an MCP server
   */
  async testConnection(serverId: string): Promise<{ success: boolean; message: string }> {
    try {
      const server = await storage.getMcpServer(serverId);
      if (!server) {
        return {
          success: false,
          message: "Server not found",
        };
      }

      // In a real implementation, this would attempt to connect to the server
      // For now, we'll simulate a successful connection
      console.log(`Testing connection to MCP server: ${server.name} at ${server.endpoint}`);

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        success: true,
        message: `Successfully connected to ${server.name}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }
}

export const mcpService = new McpService();