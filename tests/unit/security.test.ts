import { describe, it, expect } from 'vitest';
import { escapeArgument } from '../../src/utils/exec';

describe('Security Tests', () => {
  describe('Argument Escaping', () => {
    it('should not escape simple arguments', () => {
      expect(escapeArgument('simple')).toBe('simple');
      expect(escapeArgument('test123')).toBe('test123');
      expect(escapeArgument('file.txt')).toBe('file.txt');
      expect(escapeArgument('path/to/file')).toBe('path/to/file');
      expect(escapeArgument('value@domain')).toBe('value@domain');
      expect(escapeArgument('number=42')).toBe('number=42');
    });

    it('should escape arguments with spaces', () => {
      expect(escapeArgument('arg with spaces')).toBe('"arg with spaces"');
    });

    it('should escape arguments with special characters', () => {
      expect(escapeArgument('arg;rm -rf /')).toBe('"arg\\;rm -rf /"');
      expect(escapeArgument('arg`command`')).toBe('"arg\\`command\\`"');
      expect(escapeArgument('arg$HOME')).toBe('"arg\\$HOME"');
      expect(escapeArgument('arg"quotes"')).toBe('"arg\\"quotes\\""');
      expect(escapeArgument('arg\\backslash')).toBe('"arg\\\\backslash"');
    });

    it('should handle null and undefined values', () => {
      expect(escapeArgument(null)).toBe('');
      expect(escapeArgument(undefined)).toBe('');
    });

    it('should handle numeric values', () => {
      expect(escapeArgument(42)).toBe('42');
      expect(escapeArgument(3.14)).toBe('3.14');
    });
  });
});