/**
 * Test setup configuration for Vitest
 */

import { beforeAll, afterAll, beforeEach } from 'vitest';

import { logger } from '@/utils';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

beforeAll(() => {
  logger.info('Setting up test environment');
});

afterAll(() => {
  logger.info('Tearing down test environment');
});

beforeEach(() => {
  // Reset any global state between tests if needed
});