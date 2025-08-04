import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { createServer, type Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { RateLimiterMemory } from 'rate-limiter-flexible';

import { appConfig } from './config';
import { logger } from './utils';
import {
  AppError,
  getErrorStatusCode,
  formatErrorResponse,
  isOperationalError,
} from './utils/errors';
import { healthRouter } from './routes/health';
import { mcpRouter } from './routes/mcp';
import { modelsRouter } from './routes/models';
import { simulationsRouter } from './routes/simulations';
import { webSocketHandler } from './websocket/handler';
import type { ServerConfig } from './types';

/**
 * Express.js server with MCP protocol support, WebSocket capabilities,
 * and comprehensive middleware stack for the OpenStudio MCP Server.
 */
export class ExpressServer {
  private app: Application;
  private httpServer: HTTPServer;
  private io: SocketIOServer;
  private rateLimiter: RateLimiterMemory;
  private isRunning = false;

  constructor(private config: ServerConfig = appConfig.server) {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: this.config.cors.origin,
        credentials: this.config.cors.credentials,
      },
      transports: ['websocket', 'polling'],
    });

    this.rateLimiter = new RateLimiterMemory({
      points: this.config.rateLimit.max,
      duration: Math.floor(this.config.rateLimit.windowMs / 1000),
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  /**
   * Configure Express middleware stack
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", 'ws:', 'wss:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS middleware
    this.app.use(cors({
      origin: this.config.cors.origin,
      credentials: this.config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Compression middleware
    this.app.use(compression({
      filter: (req: Request, res: Response) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      level: 6,
      threshold: 1024,
    }));

    // Request parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging middleware
    this.app.use(this.requestLogger.bind(this));

    // Rate limiting middleware
    this.app.use(this.rateLimitMiddleware.bind(this));

    // Request ID middleware
    this.app.use(this.requestIdMiddleware.bind(this));
  }

  /**
   * Configure API routes
   */
  private setupRoutes(): void {
    // Health check routes (no auth required)
    this.app.use('/health', healthRouter);

    // API routes with versioning
    const apiRouter = express.Router();
    
    // MCP protocol routes
    apiRouter.use('/mcp', mcpRouter);
    
    // RESTful API routes
    apiRouter.use('/models', modelsRouter);
    apiRouter.use('/simulations', simulationsRouter);

    this.app.use('/api/v1', apiRouter);

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'OpenStudio MCP Server 2.0',
        version: '0.1.0',
        status: 'running',
        endpoints: {
          health: '/health',
          api: '/api/v1',
          mcp: '/api/v1/mcp',
          websocket: '/socket.io',
        },
        timestamp: new Date().toISOString(),
      });
    });

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        statusCode: 404,
      });
    });
  }

  /**
   * Configure WebSocket handling
   */
  private setupWebSocket(): void {
    webSocketHandler(this.io);
  }

  /**
   * Configure error handling middleware
   */
  private setupErrorHandling(): void {
    // Error handling middleware (must be last)
    this.app.use(this.errorHandler.bind(this));

    // Uncaught exception handler
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', error);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled rejection', reason instanceof Error ? reason : undefined);
      this.gracefulShutdown('UNHANDLED_REJECTION');
    });
  }

  /**
   * Request logging middleware
   */
  private requestLogger(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const { method, url, ip } = req;
    const userAgent = req.get('User-Agent') || 'unknown';

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;
      const contentLength = res.get('content-length') || '0';

      logger.info('HTTP Request', {
        method,
        url,
        statusCode,
        duration: `${duration}ms`,
        contentLength,
        ip,
        userAgent,
        requestId: req.id,
      });
    });

    next();
  }

  /**
   * Rate limiting middleware
   */
  private async rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      await this.rateLimiter.consume(req.ip || 'default');
      next();
    } catch (rateLimiterRes: any) {
      const remainingPoints = rateLimiterRes?.remainingPoints || 0;
      const msBeforeNext = rateLimiterRes?.msBeforeNext || 0;

      res.set({
        'Retry-After': Math.round(msBeforeNext / 1000) || 1,
        'X-RateLimit-Limit': this.config.rateLimit.max,
        'X-RateLimit-Remaining': remainingPoints,
        'X-RateLimit-Reset': new Date(Date.now() + msBeforeNext).toISOString(),
      });

      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        statusCode: 429,
        retryAfter: Math.round(msBeforeNext / 1000) || 1,
      });
    }
  }

  /**
   * Request ID middleware
   */
  private requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const requestId = req.get('X-Request-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.id = requestId;
    res.set('X-Request-ID', requestId);
    next();
  }

  /**
   * Global error handling middleware
   */
  private errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // If response already sent, delegate to default Express error handler
    if (res.headersSent) {
      return next(error);
    }

    const statusCode = getErrorStatusCode(error);
    const errorResponse = formatErrorResponse(error);

    // Log error
    if (statusCode >= 500) {
      logger.error('Server error', error, {
        requestId: req.id,
        method: req.method,
        url: req.url,
        ip: req.ip,
      });
    } else {
      logger.warn('Client error', {
        message: error.message,
        requestId: req.id,
        method: req.method,
        url: req.url,
        statusCode,
      });
    }

    // Send error response
    res.status(statusCode).json({
      ...errorResponse,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Start the Express server
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Express server is already running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.config.port, this.config.host, () => {
        this.isRunning = true;
        logger.info(`Express server started successfully`, {
          host: this.config.host,
          port: this.config.port,
          environment: process.env.NODE_ENV || 'development',
          pid: process.pid,
        });
        resolve();
      });

      this.httpServer.on('error', (error: Error) => {
        logger.error('Failed to start Express server', error);
        reject(error);
      });

      // Setup graceful shutdown handlers
      process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    });
  }

  /**
   * Stop the Express server
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Express server is not running');
      return;
    }

    return new Promise((resolve, reject) => {
      // Close WebSocket connections
      this.io.close(() => {
        logger.debug('WebSocket server closed');
      });

      // Close HTTP server
      this.httpServer.close((error) => {
        if (error) {
          logger.error('Error stopping Express server', error);
          reject(error);
          return;
        }

        this.isRunning = false;
        logger.info('Express server stopped successfully');
        resolve();
      });
    });
  }

  /**
   * Graceful shutdown handler
   */
  private async gracefulShutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {
      await this.stop();
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', error instanceof Error ? error : undefined);
      process.exit(1);
    }
  }

  /**
   * Check if server is running
   */
  public isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get Express app instance
   */
  public getApp(): Application {
    return this.app;
  }

  /**
   * Get HTTP server instance
   */
  public getHTTPServer(): HTTPServer {
    return this.httpServer;
  }

  /**
   * Get Socket.IO server instance
   */
  public getSocketIOServer(): SocketIOServer {
    return this.io;
  }
}

// Add request ID to Express Request interface
declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export default ExpressServer;
