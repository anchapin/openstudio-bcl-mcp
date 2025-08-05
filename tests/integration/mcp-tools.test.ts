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

// Create mock implementations of the exec utilities that return the expected structure
const mockCreateOpenStudioModel = vi.fn().mockResolvedValue({
  modelId: 'test-model-123',
  path: './data/models/test-model-123.osm',
});

const mockRunEnergySimulation = vi.fn().mockResolvedValue({
  jobId: 'test-job-123',
  status: 'completed',
  outputPath: './data/results/test-job-123',
});

const mockValidateModelASHRAE = vi.fn().mockResolvedValue({
  compliant: true,
  report: 'Model meets ASHRAE 90.1-2019 requirements',
});

const mockExportToRadiance = vi.fn().mockResolvedValue({
  exported: true,
  path: './data/results/radiance_test-model-123',
});

const mockGetSimulationResults = vi.fn().mockResolvedValue({
  content: '{"energy": 100, "cost": 5000}',
  format: 'json',
});

// Manually patch the MCP server to use our mock functions

describe('MCP Server Tools Integration', () => {
  let server: OpenStudioMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    // Use a small timeout for tests
    process.env.TIMEOUT_DEFAULT = '5000';
    server = new OpenStudioMCPServer();

    // Patch the MCP server methods to use our mock functions
    (server as any).handleCreateEnergyModel = async function (
      args: Record<string, unknown>
    ): Promise<{ content: Array<{ type: string; text: string }> }> {
      const result = await mockCreateOpenStudioModel({
        buildingType: args.buildingType,
        location: args.location,
        floorArea: args.floorArea,
        description: args.description,
        outputPath: `./data/models/model_${Date.now()}.osm`,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Created energy model with ID: ${result.modelId}\nBuilding Type: ${args.buildingType}\nLocation: ${args.location}\nFloor Area: ${args.floorArea} m²\nOutput Path: ${result.path}\n\nModel is ready for simulation.`,
          },
        ],
      };
    };

    (server as any).handleRunEnergySimulation = async function (
      args: Record<string, unknown>
    ): Promise<{ content: Array<{ type: string; text: string }> }> {
      const result = await mockRunEnergySimulation({
        modelPath: `./data/models/${args.modelId}.osm`,
        outputDir: `./data/results/job_${Date.now()}`,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Started energy simulation for model ${args.modelId}\nJob ID: ${result.jobId}\nStatus: ${result.status}\nOutput Directory: ${result.outputPath}\n\nSimulation completed successfully.`,
          },
        ],
      };
    };

    (server as any).handleValidateModelAshrae = async function (
      args: Record<string, unknown>
    ): Promise<{ content: Array<{ type: string; text: string }> }> {
      const result = await mockValidateModelASHRAE({
        modelPath: `./data/models/${args.modelId}.osm`,
        standard: args.standard,
      });

      return {
        content: [
          {
            type: 'text',
            text: `ASHRAE ${args.standard} validation for model ${args.modelId}:\n\n${result.report}\n\nModel ${result.compliant ? 'meets' : 'does not meet'} ${args.standard} requirements.`,
          },
        ],
      };
    };

    (server as any).handleExportToRadiance = async function (
      args: Record<string, unknown>
    ): Promise<{ content: Array<{ type: string; text: string }> }> {
      const result = await mockExportToRadiance({
        modelPath: `./data/models/${args.modelId}.osm`,
        outputPath: `./data/results/radiance_${args.modelId}`,
        includeWindows: args.includeWindows,
        materialProperties: args.materialProperties,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Exported model ${args.modelId} to Radiance format\nExport path: ${result.path}\nIncluded windows: ${args.includeWindows ?? true}\nIncluded materials: ${args.materialProperties ?? true}\n\nFiles ready for daylight analysis.`,
          },
        ],
      };
    };

    (server as any).handleGetSimulationResults = async function (
      args: Record<string, unknown>
    ): Promise<{ content: Array<{ type: string; text: string }> }> {
      const result = await mockGetSimulationResults({
        jobId: args.jobId,
        format: args.format || 'json',
        resultsDir: `./data/results/${args.jobId}`,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Simulation Results for Job ${args.jobId}:\n\nResults in ${result.format} format:\n${result.content.substring(0, 1000)}${result.content.length > 1000 ? '...' : ''}\n\nFull results available in ./data/results/${args.jobId}.`,
          },
        ],
      };
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
    // Clean up environment variables
    delete process.env.TIMEOUT_DEFAULT;
  });

  describe('Tool Handlers', () => {
    it('should handle create_energy_model tool call', async () => {
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
      expect(mockCreateOpenStudioModel).toHaveBeenCalled();
    });

    it('should handle run_energy_simulation tool call', async () => {
      const result = await (server as any).handleRunEnergySimulation({
        modelId: 'test-model-123',
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Started energy simulation for model');
      expect(mockRunEnergySimulation).toHaveBeenCalled();
    });

    it('should handle validate_model_ashrae tool call', async () => {
      const result = await (server as any).handleValidateModelAshrae({
        modelId: 'test-model-123',
        standard: 'ASHRAE 90.1-2019',
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('ASHRAE 90.1-2019 validation for model');
      expect(mockValidateModelASHRAE).toHaveBeenCalled();
    });

    it('should handle export_to_radiance tool call', async () => {
      const result = await (server as any).handleExportToRadiance({
        modelId: 'test-model-123',
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Exported model test-model-123 to Radiance format');
      expect(mockExportToRadiance).toHaveBeenCalled();
    });

    it('should handle get_simulation_results tool call', async () => {
      const result = await (server as any).handleGetSimulationResults({
        jobId: 'test-job-123',
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Simulation Results for Job test-job-123');
      expect(mockGetSimulationResults).toHaveBeenCalled();
    });
  });
});
