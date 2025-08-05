import winston from 'winston';

import { appConfig, isDevelopment } from '../config';
import type { Logger } from '../types';

// Winston logger configuration
const createWinstonLogger = (): winston.Logger => {
  const formats = [winston.format.timestamp(), winston.format.errors({ stack: true })];

  if (appConfig.logging.format === 'json') {
    formats.push(winston.format.json());
  } else {
    formats.push(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        const stackStr = stack ? `\n${stack}` : '';
        return `${timestamp} [${level}]: ${message}${metaStr}${stackStr}`;
      })
    );
  }

  return winston.createLogger({
    level: appConfig.logging.level,
    format: winston.format.combine(...formats),
    transports: [
      new winston.transports.Console({
        silent: process.env.NODE_ENV === 'test',
      }),
      // Add file transports in production
      ...(isDevelopment
        ? []
        : [
            new winston.transports.File({
              filename: 'logs/error.log',
              level: 'error',
            }),
            new winston.transports.File({
              filename: 'logs/combined.log',
            }),
          ]),
    ],
    exceptionHandlers: [new winston.transports.File({ filename: 'logs/exceptions.log' })],
    rejectionHandlers: [new winston.transports.File({ filename: 'logs/rejections.log' })],
  });
};

// Create logger instance
const winstonLogger = createWinstonLogger();

// Logger implementation
export const logger: Logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    winstonLogger.debug(message, meta);
  },

  info(message: string, meta?: Record<string, unknown>): void {
    winstonLogger.info(message, meta);
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    winstonLogger.warn(message, meta);
  },

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    winstonLogger.error(message, { error: error?.stack || error, ...meta });
  },
};

export default logger;
