import { Router, type Request, type Response } from 'express';
import { appConfig } from '../config';
import { logger } from '../utils';

const router = Router();

/**
 * Health check endpoint
 * GET /health
 */
router.get('/', (req: Request, res: Response) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '0.1.0',
    memory: {
      used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
      total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
      external: Math.round((process.memoryUsage().external / 1024 / 1024) * 100) / 100,
    },
    pid: process.pid,
  };

  logger.debug('Health check requested', { requestId: req.id });
  res.json(healthCheck);
});

/**
 * Readiness check endpoint
 * GET /health/ready
 */
router.get('/ready', (req: Request, res: Response) => {
  // Check if all required services are ready
  const checks = {
    server: true, // Express server is running if we got here
    openStudio: checkOpenStudioCLI(),
    storage: checkStorageDirectories(),
  };

  const isReady = Object.values(checks).every(check => check === true);
  const status = isReady ? 200 : 503;

  const readinessCheck = {
    status: isReady ? 'ready' : 'not ready',
    checks,
    timestamp: new Date().toISOString(),
  };

  logger.debug('Readiness check requested', { 
    requestId: req.id, 
    isReady, 
    checks 
  });

  res.status(status).json(readinessCheck);
});

/**
 * Liveness check endpoint
 * GET /health/live
 */
router.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - if we can respond, we're alive
  const livenessCheck = {
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  res.json(livenessCheck);
});

/**
 * Detailed health metrics endpoint
 * GET /health/metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: {
      process: process.uptime(),
      system: require('os').uptime(),
    },
    memory: {
      rss: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
      heapTotal: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
      heapUsed: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
      external: Math.round((memUsage.external / 1024 / 1024) * 100) / 100,
      arrayBuffers: Math.round((memUsage.arrayBuffers / 1024 / 1024) * 100) / 100,
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid,
    },
    config: {
      port: appConfig.server.port,
      host: appConfig.server.host,
      logLevel: appConfig.logging.level,
      environment: process.env.NODE_ENV || 'development',
    },
  };

  logger.debug('Metrics requested', { requestId: req.id });
  res.json(metrics);
});

/**
 * Check if OpenStudio CLI is available
 */
function checkOpenStudioCLI(): boolean {
  try {
    // This is a placeholder - in a real implementation,
    // you would actually check if the OpenStudio CLI is accessible
    // For now, we'll assume it's available if the path is configured
    return !!appConfig.openStudio.cliPath;
  } catch (error) {
    logger.warn('OpenStudio CLI check failed', error instanceof Error ? { error: error.message } : undefined);
    return false;
  }
}

/**
 * Check if storage directories are accessible
 */
function checkStorageDirectories(): boolean {
  try {
    const fs = require('fs');
    const paths = [
      appConfig.storage.modelsPath,
      appConfig.storage.resultsPath,
      appConfig.storage.tempPath,
    ];

    // Check if directories exist and are writable
    for (const path of paths) {
      try {
        fs.accessSync(path, fs.constants.F_OK | fs.constants.W_OK);
      } catch {
        // Try to create directory if it doesn't exist
        fs.mkdirSync(path, { recursive: true });
      }
    }
    return true;
  } catch (error) {
    logger.warn('Storage directory check failed', error instanceof Error ? { error: error.message } : undefined);
    return false;
  }
}

export { router as healthRouter };
