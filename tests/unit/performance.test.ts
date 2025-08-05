import { describe, it, expect } from 'vitest';
import { escapeArgument } from '../../src/utils/exec';

describe('Utility Function Tests', () => {
  describe('Argument Escaping', () => {
    it('should escape arguments correctly', () => {
      // Test that the escapeArgument function works correctly
      expect(escapeArgument('simple')).toBe('simple');
      expect(escapeArgument('arg with spaces')).toBe('"arg with spaces"');
      expect(escapeArgument('arg;rm -rf /')).toBe('"arg\\;rm -rf /"');
    });
  });
});