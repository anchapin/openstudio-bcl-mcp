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
    runRadianceDaylightAnalysis: vi.fn().mockResolvedValue({
      success: true,
      outputPath: './data/results/daylight_test-model-123',
      metrics: {
        averageDaylightFactor: 2.5,
        spatialDaylightAutonomy: 45.0,
        annualSunlightExposure: 8.2,
      },
    }),
    runHVACSizing: vi.fn().mockResolvedValue({
      success: true,
      outputPath: './data/results/hvac_test-model-123',
      hvacSystem: 'Variable Refrigerant Flow (VRF)',
      capacity: 320.8,
      efficiency: 0.85,
      annualCost: 21000,
      detailedResults: {
        heating_system: 'Gas Boiler',
        cooling_system: 'Air-cooled Chiller',
        heating_capacity: 250.5,
        cooling_capacity: 320.8,
        annual_heating_cost: 12500,
        annual_cooling_cost: 8500,
        system_efficiency: 0.85,
      },
    }),
    runNetZeroAnalysis: vi.fn().mockResolvedValue({
      success: true,
      outputPath: './data/results/netzero_test-model-123',
      isNetZeroCapable: true,
      energyBalance: 134.8,
      renewableEnergyPotential: 180.0,
      requiredRenewableCapacity: 25.5,
      paybackPeriod: 8.5,
      npv: 45000,
      detailedResults: {
        current_energy_use: 150.5,
        optimized_energy_use: 45.2,
        renewable_energy_generation: 180.0,
        energy_balance: 134.8,
        solar_capacity: 25.5,
        payback_period: 8.5,
        npv: 45000,
      },
    }),
    getSimulationResults: vi.fn().mockResolvedValue({
      content: '{"energy": 100, "cost": 5000}',
      format: 'json',
    }),
    validateModelLEED: vi.fn().mockResolvedValue({
      success: true,
      outputPath: './data/results/leed_test-model-123',
      compliant: true,
      leedScore: 75,
      certificationLevel: 'Gold',
      creditsEarned: 75,
      creditsRequired: 40,
      detailedReport: {
        energy_performance: {
          points_earned: 18,
          points_possible: 19,
          prerequisite_met: true,
        },
        water_efficiency: {
          points_earned: 10,
          points_possible: 10,
          prerequisite_met: true,
        },
        indoor_environmental_quality: {
          points_earned: 15,
          points_possible: 16,
          prerequisite_met: true,
        },
        sustainable_sites: {
          points_earned: 10,
          points_possible: 10,
          prerequisite_met: true,
        },
        materials_resources: {
          points_earned: 8,
          points_possible: 10,
          prerequisite_met: true,
        },
        innovation: {
          points_earned: 4,
          points_possible: 6,
          prerequisite_met: true,
        },
      },
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

    it.skip('should handle run_daylight_analysis tool call', async () => {
      const result = await (server as any).handleRunDaylightAnalysis({
        modelId: 'test-model-123',
        analysisType: 'annual',
        skyConditions: 'cie',
        gridSpacing: 0.5,
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain(
        'Daylight Analysis Results for Model test-model-123'
      );
    });

    it.skip('should handle run_hvac_sizing tool call', async () => {
      const result = await (server as any).handleRunHVACSizing({
        modelId: 'test-model-123',
        climateZone: 'ASHRAE 169-2013-5A',
        buildingType: 'office',
        efficiencyLevel: 'standard',
        includeDetailedResults: true,
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('HVAC Sizing Results for Model test-model-123');
    });

    it.skip('should handle run_net_zero_analysis tool call', async () => {
      const result = await (server as any).handleRunNetZeroAnalysis({
        modelId: 'test-model-123',
        optimizationLevel: 'advanced',
        renewableSources: ['solar'],
        includeEconomicAnalysis: true,
        targetYear: 2045,
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain(
        'Net-Zero Analysis Results for Model test-model-123'
      );
    });

    it.skip('should handle validate_model_leed tool call', async () => {
      const result = await (server as any).handleValidateModelLEED({
        modelId: 'test-model-123',
        leedVersion: 'LEED v4.1',
        buildingType: 'office',
        includeDetailedReport: true,
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('LEED Validation Results for Model test-model-123');
      expect(result.content[0].text).toContain('Certification Level: Gold');
    });
  });
});
