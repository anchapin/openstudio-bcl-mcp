import { config } from 'dotenv';
import { z } from 'zod';

import type { AppConfig } from '../types';

// Load environment variables
config();

// Environment validation schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  HOST: z.string().default('localhost'),

  // OpenStudio Configuration
  OPENSTUDIO_CLI_PATH: z.string().default('openstudio'),
  OPENSTUDIO_WORKING_DIR: z.string().default('./workspace'),
  OPENSTUDIO_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).default('300000'),
  OPENSTUDIO_MAX_CONCURRENT_JOBS: z.string().regex(/^\d+$/).transform(Number).default('3'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('simple'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  CORS_CREDENTIALS: z
    .string()
    .transform(val => val === 'true')
    .default('true'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX: z.string().regex(/^\d+$/).transform(Number).default('100'),

  // Storage
  MODELS_PATH: z.string().default('./data/models'),
  RESULTS_PATH: z.string().default('./data/results'),
  TEMP_PATH: z.string().default('./data/temp'),
});

// Validate environment variables
const env = envSchema.parse(process.env);

// Application configuration
export const appConfig: AppConfig = {
  server: {
    port: env.PORT,
    host: env.HOST,
    cors: {
      origin: env.CORS_ORIGINS.split(',').map(origin => origin.trim()),
      credentials: env.CORS_CREDENTIALS,
    },
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
    },
  },
  openStudio: {
    cliPath: env.OPENSTUDIO_CLI_PATH,
    workingDirectory: env.OPENSTUDIO_WORKING_DIR,
    timeout: env.OPENSTUDIO_TIMEOUT,
    maxConcurrentJobs: env.OPENSTUDIO_MAX_CONCURRENT_JOBS,
  },
  logging: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT,
  },
  storage: {
    modelsPath: env.MODELS_PATH,
    resultsPath: env.RESULTS_PATH,
    tempPath: env.TEMP_PATH,
  },
};

// Environment utilities
export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

// Export environment for direct access if needed
export { env };
