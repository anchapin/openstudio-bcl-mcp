import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenStudioMCPServer } from '../../src/services/mcp-server';

// Mock fs
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    access: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock the logger to prevent log output during tests
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock the nlp utilities
vi.mock('../../src/utils/nlp', async () => {
  const actual = await vi.importActual('../../src/utils/nlp');
  return {
    ...actual,
    parseBuildingDescription: vi.fn().mockReturnValue({
      buildingType: 'office',
      location: 'New York, NY',
      floorArea: 5000,
      description: 'A modern office building',
    }),
    validateBuildingParameters: vi.fn().mockReturnValue({
      isValid: true,
      errors: [],
    }),
  };
});

// Mock the exec utilities
vi.mock('../../src/utils/exec', async () => {
  const actual = await vi.importActual('../../src/utils/exec');
  return {
    ...actual,
    createOpenStudioModel: vi.fn().mockResolvedValue({
      modelId: 'test-model-123',
      path: './data/models/test-model-123.osm',
    }),
    runEnergySimulation: vi.fn().mockResolvedValue({
      jobId: 'test-job-123',
      status: 'completed',
      outputPath: './data/results/test-job-123',
    }),
    validateModelASHRAE: vi.fn().mockResolvedValue({
      compliant: true,
      report: 'Model meets ASHRAE 90.1-2019 requirements',
    }),
    exportToRadiance: vi.fn().mockResolvedValue({
      exported: true,
      path: './data/results/radiance_test-model-123',
    }),
    getSimulationResults: vi.fn().mockResolvedValue({
      content: '{"energy": 100, "cost": 5000}',
      format: 'json',
    }),
  };
});

describe('MCP Server Tools Integration', () => {
  let server: OpenStudioMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    // Use a small timeout for tests
    process.env.TIMEOUT_DEFAULT = '5000';
    server = new OpenStudioMCPServer();
  });

  afterEach(() => {
    vi.resetAllMocks();
    // Clean up environment variables
    delete process.env.TIMEOUT_DEFAULT;
  });

  describe('Tool Handlers', () => {
    it.skip('should handle create_energy_model tool call', async () => {
      const result = await (server as any).handleCreateEnergyModel({
        buildingType: 'office',
        location: 'New York, NY',
        floorArea: 5000,
        description: 'A modern office building',
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Created energy model with ID');
    });

    it.skip('should handle run_energy_simulation tool call', async () => {
      const result = await (server as any).handleRunEnergySimulation({
        modelId: 'test-model-123',
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Started energy simulation for model');
    });

    it.skip('should handle validate_model_ashrae tool call', async () => {
      const result = await (server as any).handleValidateModelAshrae({
        modelId: 'test-model-123',
        standard: 'ASHRAE 90.1-2019',
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('ASHRAE 90.1-2019 validation for model');
    });

    it.skip('should handle export_to_radiance tool call', async () => {
      const result = await (server as any).handleExportToRadiance({
        modelId: 'test-model-123',
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Exported model test-model-123 to Radiance format');
    });

    it.skip('should handle get_simulation_results tool call', async () => {
      const result = await (server as any).handleGetSimulationResults({
        jobId: 'test-job-123',
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Simulation Results for Job test-job-123');
    });

    it.skip('should handle create_energy_model_nlp tool call', async () => {
      const result = await (server as any).handleCreateEnergyModelNLP({
        description: 'A 10,000 square foot office building in New York',
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Created energy model with ID');
    });

    it.skip('should handle complete_energy_model_workflow tool call', async () => {
      const result = await (server as any).handleCompleteEnergyModelWorkflow({
        description: 'A 10,000 square foot office building in New York',
        ashraeStandard: 'ASHRAE 90.1-2019',
        exportWindows: true,
        exportMaterials: true,
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Complete Energy Modeling Workflow Results');
    });
  });
});
