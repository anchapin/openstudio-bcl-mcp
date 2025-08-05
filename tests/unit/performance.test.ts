import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeCommand } from '../../src/utils/exec';

// Mock child_process
const mockExec = vi.fn();
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...actual,
    exec: mockExec
  };
});

vi.mock('util', async () => {
  return {
    promisify: () => mockExec
  };
});

describe('Performance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the cache between tests
    const commandCache = (executeCommand as any).commandCache;
    if (commandCache && commandCache.clear) {
      commandCache.clear();
    }
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Command Caching', () => {
    it('should cache repeated command executions', async () => {
      mockExec.mockImplementation((command, options, callback) => {
        callback(null, { stdout: 'result1', stderr: '', code: 0 });
      });

      // Execute the same command twice
      const result1 = await executeCommand('echo test', { useCache: true });
      const result2 = await executeCommand('echo test', { useCache: true });

      // Should only call exec once due to caching
      expect(mockExec).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    it('should not cache when useCache is false', async () => {
      mockExec.mockImplementation((command, options, callback) => {
        callback(null, { stdout: 'result1', stderr: '', code: 0 });
      });

      // Execute the same command twice with caching disabled
      await executeCommand('echo test', { useCache: false });
      await executeCommand('echo test', { useCache: false });

      // Should call exec twice since caching is disabled
      expect(mockExec).toHaveBeenCalledTimes(2);
    });

    it('should handle cache expiration', async () => {
      vi.useFakeTimers();
      
      mockExec.mockImplementation((command, options, callback) => {
        callback(null, { stdout: 'result1', stderr: '', code: 0 });
      });

      // Execute command
      await executeCommand('echo test', { useCache: true });
      
      // Fast forward time beyond cache TTL
      vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes
      
      // Execute same command again
      await executeCommand('echo test', { useCache: true });

      // Should call exec twice due to cache expiration
      expect(mockExec).toHaveBeenCalledTimes(2);
      
      vi.useRealTimers();
    });
  });
});