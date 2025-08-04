#!/usr/bin/env node

/**
 * OpenStudio MCP Server 2.0
 *
 * A Model Context Protocol server that enables AI systems to interact
 * with OpenStudio's building energy modeling tools via natural language.
 * 
 * This server supports both MCP protocol over stdio and REST/WebSocket APIs
 * for maximum compatibility with different AI clients.
 */

import { OpenStudioMCPServer } from './services/mcp-server';
import { ExpressServer } from './server';
import { logger } from './utils';
import { appConfig, isDevelopment } from './config';

/**
 * Application orchestrator that manages both MCP and Express servers
 */
class OpenStudioApplication {
  private mcpServer: OpenStudioMCPServer;
  private expressServer: ExpressServer;
  private isRunning = false;

  constructor() {
    this.mcpServer = new OpenStudioMCPServer();
    this.expressServer = new ExpressServer();
  }

  /**
   * Start both servers
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Application is already running');
      return;
    }

    try {
      logger.info('Starting OpenStudio MCP Server 2.0...', {
        environment: process.env.NODE_ENV || 'development',
        version: '0.1.0',
        config: {
          httpPort: appConfig.server.port,
          httpHost: appConfig.server.host,
          logLevel: appConfig.logging.level,
        },
      });

      // Start Express server (HTTP + WebSocket)
      await this.expressServer.start();
      logger.info('Express server with WebSocket support started');

      // In development, also start the MCP server for stdio protocol
      if (isDevelopment || process.env.ENABLE_MCP_STDIO === 'true') {
        await this.mcpServer.start();
        logger.info('MCP stdio server started');
      }

      this.isRunning = true;
      
      logger.info('🚀 OpenStudio MCP Server 2.0 is ready!', {
        httpEndpoint: `http://${appConfig.server.host}:${appConfig.server.port}`,
        healthCheck: `http://${appConfig.server.host}:${appConfig.server.port}/health`,
        apiDocs: `http://${appConfig.server.host}:${appConfig.server.port}/api/v1`,
        websocket: `ws://${appConfig.server.host}:${appConfig.server.port}/socket.io`,
        mcpStdio: isDevelopment || process.env.ENABLE_MCP_STDIO === 'true',
      });

    } catch (error) {
      logger.error('Failed to start application', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Stop both servers
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Application is not running');
      return;
    }

    try {
      logger.info('Stopping OpenStudio MCP Server 2.0...');

      // Stop servers in reverse order
      if (this.mcpServer.isServerRunning()) {
        await this.mcpServer.stop();
        logger.info('MCP stdio server stopped');
      }

      if (this.expressServer.isServerRunning()) {
        await this.expressServer.stop();
        logger.info('Express server stopped');
      }

      this.isRunning = false;
      logger.info('Application shutdown complete');
    } catch (error) {
      logger.error('Error during application shutdown', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Check if application is running
   */
  public isAppRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get Express server instance
   */
  public getExpressServer(): ExpressServer {
    return this.expressServer;
  }

  /**
   * Get MCP server instance
   */
  public getMCPServer(): OpenStudioMCPServer {
    return this.mcpServer;
  }
}

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  const app = new OpenStudioApplication();

  // Handle graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {
      await app.stop();
      logger.info('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during graceful shutdown', error instanceof Error ? error : undefined);
      process.exit(1);
    }
  };

  // Register signal handlers for graceful shutdown
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('❌ Uncaught exception - shutting down', error);
    void shutdown('UNCAUGHT_EXCEPTION');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('❌ Unhandled promise rejection - shutting down', 
      reason instanceof Error ? reason : undefined);
    void shutdown('UNHANDLED_REJECTION');
  });

  try {
    // Start the application
    await app.start();
  } catch (error) {
    logger.error('❌ Failed to start OpenStudio MCP Server 2.0', 
      error instanceof Error ? error : undefined);
    process.exit(1);
  }
}

// Start the application if this file is run directly
if (require.main === module) {
  void main();
}

// Export classes for external use
export { OpenStudioMCPServer } from './services/mcp-server';
export { ExpressServer } from './server';
export { OpenStudioApplication };
export default OpenStudioApplication;
