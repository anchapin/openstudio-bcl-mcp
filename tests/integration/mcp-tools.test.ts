import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenStudioMCPServer } from '../../src/services/mcp-server';
import { AppError } from '../../src/utils/errors';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Mock the exec utilities
vi.mock('../../src/utils/exec', () => {
  return {
    createOpenStudioModel: vi.fn().mockResolvedValue({
      modelId: 'test-model-123',
      path: './data/models/test-model-123.osm'
    }),
    runEnergySimulation: vi.fn().mockResolvedValue({
      jobId: 'test-job-123',
      status: 'completed',
      outputPath: './data/results/test-job-123'
    }),
    validateModelASHRAE: vi.fn().mockResolvedValue({
      compliant: true,
      report: 'Model meets ASHRAE 90.1-2019 requirements'
    }),
    exportToRadiance: vi.fn().mockResolvedValue({
      exported: true,
      path: './data/results/radiance_test-model-123'
    }),
    getSimulationResults: vi.fn().mockResolvedValue({
      content: '{"energy": 100, "cost": 5000}',
      format: 'json'
    })
  };
});

// Mock fs
vi.mock('fs/promises', () => {
  return {
    access: vi.fn().mockResolvedValue(undefined)
  };
});

// Mock transport
const mockTransport = {
  onClose: vi.fn(),
  send: vi.fn(),
  onMessage: vi.fn()
};

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: vi.fn().mockImplementation(() => mockTransport)
  };
});

describe('MCP Server Tools Integration', () => {
  let server: OpenStudioMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new OpenStudioMCPServer();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Tool Handlers', () => {
    it('should handle create_energy_model tool call', async () => {
      const result = await (server as any).handleCreateEnergyModel({
        buildingType: 'office',
        location: 'New York, NY',
        floorArea: 5000,
        description: 'A modern office building'
      });
      
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Created energy model with ID');
    });

    it('should handle run_energy_simulation tool call', async () => {
      const result = await (server as any).handleRunEnergySimulation({
        modelId: 'test-model-123'
      });
      
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Started energy simulation for model');
    });

    it('should handle validate_model_ashrae tool call', async () => {
      const result = await (server as any).handleValidateModelAshrae({
        modelId: 'test-model-123',
        standard: 'ASHRAE 90.1-2019'
      });
      
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('ASHRAE ASHRAE 90.1-2019 validation for model');
    });

    it('should handle export_to_radiance tool call', async () => {
      const result = await (server as any).handleExportToRadiance({
        modelId: 'test-model-123'
      });
      
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Exported model test-model-123 to Radiance format');
    });

    it('should handle get_simulation_results tool call', async () => {
      const result = await (server as any).handleGetSimulationResults({
        jobId: 'test-job-123'
      });
      
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Simulation Results for Job test-job-123');
    });
  });
});