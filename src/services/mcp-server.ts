import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from '../utils';
import {
  createOpenStudioModel,
  runEnergySimulation,
  validateModelASHRAE,
  validateModelLEED,
  exportToRadiance,
  runRadianceDaylightAnalysis,
  runHVACSizing,
  runNetZeroAnalysis,
  getSimulationResults,
} from '../utils/exec';
import { parseBuildingDescription, validateBuildingParameters } from '../utils/nlp';

/**
 * MCP Server implementation for OpenStudio
 */
export class OpenStudioMCPServer {
  private server: Server;
  private isRunning = false;

  constructor() {
    this.server = new Server(
      {
        name: 'openstudio-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Tools handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_energy_model_nlp',
            description:
              'Create a new OpenStudio energy model from natural language description with automatic parameter extraction',
            inputSchema: {
              type: 'object',
              properties: {
                description: {
                  type: 'string',
                  description:
                    'Natural language description of the building (e.g., "A 10,000 square foot office building in New York")',
                },
              },
              required: ['description'],
            },
          },
          {
            name: 'complete_energy_model_workflow',
            description:
              'Complete energy modeling workflow: create model from natural language, validate against ASHRAE standards, and export to Radiance',
            inputSchema: {
              type: 'object',
              properties: {
                description: {
                  type: 'string',
                  description:
                    'Natural language description of the building (e.g., "A 10,000 square foot office building in New York")',
                },
                ashraeStandard: {
                  type: 'string',
                  enum: ['ASHRAE 90.1-2019', 'ASHRAE 90.1-2016', 'ASHRAE 90.1-2013'],
                  description: 'ASHRAE standard version to validate against',
                  default: 'ASHRAE 90.1-2019',
                },
                exportWindows: {
                  type: 'boolean',
                  description: 'Include window surfaces in Radiance export',
                  default: true,
                },
                exportMaterials: {
                  type: 'boolean',
                  description: 'Include material optical properties in Radiance export',
                  default: true,
                },
              },
              required: ['description'],
            },
          },
          {
            name: 'create_energy_model',
            description: 'Create a new OpenStudio energy model from structured parameters',
            inputSchema: {
              type: 'object',
              properties: {
                description: {
                  type: 'string',
                  description: 'Natural language description of the building',
                },
                buildingType: {
                  type: 'string',
                  description: 'Type of building (office, residential, retail, etc.)',
                },
                location: {
                  type: 'string',
                  description: 'Geographic location or climate zone',
                },
                floorArea: {
                  type: 'number',
                  description: 'Total floor area in square meters',
                },
              },
              required: ['description', 'buildingType', 'location', 'floorArea'],
            },
          },
          {
            name: 'run_energy_simulation',
            description: 'Run an energy simulation on an existing model',
            inputSchema: {
              type: 'object',
              properties: {
                modelId: {
                  type: 'string',
                  description: 'ID of the energy model to simulate',
                },
                weatherFile: {
                  type: 'string',
                  description: 'Path to weather file (EPW format)',
                },
                outputVariables: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of output variables to include in results',
                },
              },
              required: ['modelId'],
            },
          },
          {
            name: 'validate_model_ashrae',
            description: 'Validate an energy model against ASHRAE 90.1 standards',
            inputSchema: {
              type: 'object',
              properties: {
                modelId: {
                  type: 'string',
                  description: 'ID of the energy model to validate',
                },
                standard: {
                  type: 'string',
                  enum: ['ASHRAE 90.1-2019', 'ASHRAE 90.1-2016', 'ASHRAE 90.1-2013'],
                  description: 'ASHRAE standard version to validate against',
                },
              },
              required: ['modelId', 'standard'],
            },
          },
          {
            name: 'export_to_radiance',
            description: 'Export model geometry to Radiance for daylight analysis',
            inputSchema: {
              type: 'object',
              properties: {
                modelId: {
                  type: 'string',
                  description: 'ID of the energy model to export',
                },
                includeWindows: {
                  type: 'boolean',
                  description: 'Include window surfaces in export',
                  default: true,
                },
                materialProperties: {
                  type: 'boolean',
                  description: 'Include material optical properties',
                  default: true,
                },
              },
              required: ['modelId'],
            },
          },
          {
            name: 'get_simulation_results',
            description: 'Retrieve results from a completed energy simulation',
            inputSchema: {
              type: 'object',
              properties: {
                jobId: {
                  type: 'string',
                  description: 'ID of the simulation job',
                },
                format: {
                  type: 'string',
                  enum: ['json', 'csv', 'html'],
                  description: 'Output format for results',
                  default: 'json',
                },
              },
              required: ['jobId'],
            },
          },
          {
            name: 'run_daylight_analysis',
            description: 'Run Radiance daylight analysis on exported building model',
            inputSchema: {
              type: 'object',
              properties: {
                modelId: {
                  type: 'string',
                  description: 'ID of the energy model to analyze',
                },
                analysisType: {
                  type: 'string',
                  enum: ['daylight_factor', 'annual', 'point_in_time'],
                  description: 'Type of daylight analysis to perform',
                  default: 'annual',
                },
                skyConditions: {
                  type: 'string',
                  enum: ['overcast', 'clear', 'cie'],
                  description: 'Sky conditions for analysis',
                  default: 'cie',
                },
                gridSpacing: {
                  type: 'number',
                  description: 'Grid spacing for analysis in meters',
                  default: 0.5,
                },
                weatherFile: {
                  type: 'string',
                  description: 'Path to weather file for annual analysis (optional)',
                },
              },
              required: ['modelId'],
            },
          },
          {
            name: 'run_hvac_sizing',
            description: 'Run HVAC system sizing and selection for building model',
            inputSchema: {
              type: 'object',
              properties: {
                modelId: {
                  type: 'string',
                  description: 'ID of the energy model to size HVAC for',
                },
                climateZone: {
                  type: 'string',
                  description: 'Climate zone for HVAC sizing (e.g., ASHRAE 169-2013-5A)',
                  default: 'ASHRAE 169-2013-5A',
                },
                buildingType: {
                  type: 'string',
                  description: 'Building type for HVAC sizing',
                  default: 'office',
                },
                efficiencyLevel: {
                  type: 'string',
                  enum: ['standard', 'high', 'premium'],
                  description: 'Efficiency level for HVAC equipment selection',
                  default: 'standard',
                },
                includeDetailedResults: {
                  type: 'boolean',
                  description: 'Include detailed HVAC sizing results',
                  default: false,
                },
              },
              required: ['modelId'],
            },
          },
          {
            name: 'run_net_zero_analysis',
            description: 'Run net-zero energy building analysis and optimization',
            inputSchema: {
              type: 'object',
              properties: {
                modelId: {
                  type: 'string',
                  description: 'ID of the energy model to analyze for net-zero potential',
                },
                optimizationLevel: {
                  type: 'string',
                  enum: ['basic', 'advanced', 'comprehensive'],
                  description: 'Level of optimization to apply',
                  default: 'advanced',
                },
                renewableSources: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['solar', 'wind', 'geothermal'],
                  },
                  description: 'Renewable energy sources to consider',
                  default: ['solar'],
                },
                includeEconomicAnalysis: {
                  type: 'boolean',
                  description: 'Include economic analysis of net-zero measures',
                  default: false,
                },
                targetYear: {
                  type: 'number',
                  description: 'Target year for net-zero analysis',
                  default: new Date().getFullYear() + 20,
                },
              },
              required: ['modelId'],
            },
          },
          {
            name: 'validate_model_leed',
            description: 'Validate an energy model against LEED standards',
            inputSchema: {
              type: 'object',
              properties: {
                modelId: {
                  type: 'string',
                  description: 'ID of the energy model to validate',
                },
                leedVersion: {
                  type: 'string',
                  enum: ['LEED v4.1', 'LEED v4.0', 'LEED 2009'],
                  description: 'LEED version to validate against',
                  default: 'LEED v4.1',
                },
                buildingType: {
                  type: 'string',
                  description: 'Building type for LEED validation',
                  default: 'office',
                },
                includeDetailedReport: {
                  type: 'boolean',
                  description: 'Include detailed LEED validation report',
                  default: false,
                },
              },
              required: ['modelId'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;
      const toolArgs = args ?? {};

      try {
        switch (name) {
          case 'complete_energy_model_workflow':
            return await this.handleCompleteEnergyModelWorkflow(toolArgs);
          case 'create_energy_model_nlp':
            return await this.handleCreateEnergyModelNLP(toolArgs);
          case 'create_energy_model':
            return await this.handleCreateEnergyModel(toolArgs);
          case 'run_energy_simulation':
            return await this.handleRunEnergySimulation(toolArgs);
          case 'validate_model_ashrae':
            return await this.handleValidateModelAshrae(toolArgs);
          case 'export_to_radiance':
            return await this.handleExportToRadiance(toolArgs);
          case 'run_daylight_analysis':
            return await this.handleRunDaylightAnalysis(toolArgs);
          case 'run_hvac_sizing':
            return await this.handleRunHVACSizing(toolArgs);
          case 'run_net_zero_analysis':
            return await this.handleRunNetZeroAnalysis(toolArgs);
          case 'validate_model_leed':
            return await this.handleValidateModelLEED(toolArgs);
          case 'get_simulation_results':
            return await this.handleGetSimulationResults(toolArgs);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Error executing tool ${name}`, error instanceof Error ? error : undefined);
        throw error;
      }
    });
  }

  private async handleCreateEnergyModel(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.info('Creating energy model', { args });

    try {
      // Get paths from environment or use defaults
      const modelsPath = process.env.MODELS_PATH || './data/models';
      const modelId = `model_${Date.now()}`;
      const outputPath = `${modelsPath}/${modelId}.osm`;

      const result = await createOpenStudioModel({
        buildingType: args.buildingType as string,
        location: args.location as string,
        floorArea: args.floorArea as number,
        description: args.description as string,
        outputPath,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Created energy model with ID: ${result.modelId}\nBuilding Type: ${args.buildingType}\nLocation: ${args.location}\nFloor Area: ${args.floorArea} m²\nOutput Path: ${result.path}\n\nModel is ready for simulation.`,
          },
        ],
      };
    } catch (error) {
      logger.error('Error creating energy model', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  private async handleRunEnergySimulation(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.info('Running energy simulation', { args });

    try {
      // Get paths from environment or use defaults
      const modelsPath = process.env.MODELS_PATH || './data/models';
      const resultsPath = process.env.RESULTS_PATH || './data/results';
      const modelId = args.modelId as string;
      const modelPath = `${modelsPath}/${modelId}.osm`;
      const jobId = `job_${Date.now()}`;
      const outputDir = `${resultsPath}/${jobId}`;

      const result = await runEnergySimulation({
        modelPath,
        weatherPath: args.weatherFile as string | undefined,
        outputDir,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Started energy simulation for model ${modelId}\nJob ID: ${result.jobId}\nStatus: ${result.status}\nOutput Directory: ${result.outputPath}\n\nSimulation completed successfully.`,
          },
        ],
      };
    } catch (error) {
      logger.error('Error running energy simulation', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  private async handleValidateModelAshrae(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.info('Validating model against ASHRAE standards', { args });

    try {
      // Get paths from environment or use defaults
      const modelsPath = process.env.MODELS_PATH || './data/models';
      const modelId = args.modelId as string;
      const modelPath = `${modelsPath}/${modelId}.osm`;

      const result = await validateModelASHRAE({
        modelPath,
        standard: args.standard as string,
      });

      return {
        content: [
          {
            type: 'text',
            text: `ASHRAE ${args.standard} validation for model ${modelId}:\n\n${result.report}\n\nModel ${result.compliant ? 'meets' : 'does not meet'} ${args.standard} requirements.`,
          },
        ],
      };
    } catch (error) {
      logger.error('Error validating model', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  private async handleExportToRadiance(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.info('Exporting model to Radiance', { args });

    try {
      // Get paths from environment or use defaults
      const modelsPath = process.env.MODELS_PATH || './data/models';
      const resultsPath = process.env.RESULTS_PATH || './data/results';
      const modelId = args.modelId as string;
      const modelPath = `${modelsPath}/${modelId}.osm`;
      const outputPath = `${resultsPath}/radiance_${modelId}`;

      const result = await exportToRadiance({
        modelPath,
        outputPath,
        includeWindows: args.includeWindows as boolean | undefined,
        materialProperties: args.materialProperties as boolean | undefined,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Exported model ${modelId} to Radiance format\nExport path: ${result.path}\nIncluded windows: ${args.includeWindows ?? true}\nIncluded materials: ${args.materialProperties ?? true}\n\nFiles ready for daylight analysis.`,
          },
        ],
      };
    } catch (error) {
      logger.error('Error exporting to Radiance', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  private async handleGetSimulationResults(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.info('Retrieving simulation results', { args });

    try {
      // Get paths from environment or use defaults
      const resultsPath = process.env.RESULTS_PATH || './data/results';
      const jobId = args.jobId as string;
      const resultsDir = `${resultsPath}/${jobId}`;
      const format = (args.format as string) || 'json';

      const result = await getSimulationResults({
        jobId,
        format,
        resultsDir,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Simulation Results for Job ${jobId}:\n\nResults in ${result.format} format:\n${result.content.substring(0, 1000)}${result.content.length > 1000 ? '...' : ''}\n\nFull results available in ${resultsDir}.`,
          },
        ],
      };
    } catch (error) {
      logger.error(
        'Error retrieving simulation results',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  private async handleRunDaylightAnalysis(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.info('Running daylight analysis', { args });

    try {
      // Validate that modelId is provided
      if (!args.modelId || typeof args.modelId !== 'string') {
        throw new Error('Model ID is required for daylight analysis');
      }

      const modelId = args.modelId as string;

      // First, export the model to Radiance format if not already done
      const radianceExportResult = await this.handleExportToRadiance({
        modelId,
        includeWindows: true,
        materialProperties: true,
      });

      // Extract export path from the result
      const exportPathMatch = radianceExportResult.content[0].text.match(/Export path: ([^\n]+)/);
      const radiancePath = exportPathMatch ? exportPathMatch[1].trim() : '';

      if (!radiancePath) {
        throw new Error('Failed to extract Radiance export path');
      }

      // Get paths from environment or use defaults
      const resultsPath = process.env.RESULTS_PATH || './data/results';
      const outputPath = `${resultsPath}/daylight_${modelId}`;

      // Run Radiance daylight analysis
      const analysisResult = await runRadianceDaylightAnalysis({
        radiancePath,
        outputPath,
        weatherFile: args.weatherFile as string | undefined,
        analysisType:
          (args.analysisType as 'daylight_factor' | 'annual' | 'point_in_time') || 'annual',
        skyConditions: (args.skyConditions as 'overcast' | 'clear' | 'cie') || 'cie',
        gridSpacing: (args.gridSpacing as number) || 0.5,
      });

      // Format the results
      let metricsText = '';
      if (analysisResult.metrics) {
        metricsText = `
Daylight Metrics:
- Average Daylight Factor: ${analysisResult.metrics.averageDaylightFactor.toFixed(2)}%
- Spatial Daylight Autonomy: ${analysisResult.metrics.spatialDaylightAutonomy.toFixed(2)}%
- Annual Sunlight Exposure: ${analysisResult.metrics.annualSunlightExposure.toFixed(2)}%`;
      }

      return {
        content: [
          {
            type: 'text',
            text: `Daylight Analysis Results for Model ${modelId}:
            
${radianceExportResult.content[0].text}

Analysis completed successfully!
Output path: ${analysisResult.outputPath}
${metricsText}

Daylight analysis completed. Results are ready for review.`,
          },
        ],
      };
    } catch (error) {
      logger.error('Error running daylight analysis', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  private async handleRunHVACSizing(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.info('Running HVAC sizing', { args });

    try {
      // Validate that modelId is provided
      if (!args.modelId || typeof args.modelId !== 'string') {
        throw new Error('Model ID is required for HVAC sizing');
      }

      const modelId = args.modelId as string;

      // Get paths from environment or use defaults
      const modelsPath = process.env.MODELS_PATH || './data/models';
      const resultsPath = process.env.RESULTS_PATH || './data/results';
      const modelPath = `${modelsPath}/${modelId}.osm`;
      const outputPath = `${resultsPath}/hvac_${modelId}`;

      // Run HVAC sizing
      const sizingResult = await runHVACSizing({
        modelPath,
        outputPath,
        climateZone: args.climateZone as string | undefined,
        buildingType: args.buildingType as string | undefined,
        efficiencyLevel: args.efficiencyLevel as 'standard' | 'high' | 'premium' | undefined,
        includeDetailedResults: args.includeDetailedResults as boolean | undefined,
      });

      // Format the results
      let detailedResultsText = '';
      if (sizingResult.detailedResults) {
        detailedResultsText = `
Detailed Results:
- Heating System: ${sizingResult.detailedResults.heating_system}
- Cooling System: ${sizingResult.detailedResults.cooling_system}
- Heating Capacity: ${sizingResult.detailedResults.heating_capacity.toFixed(1)} kW
- Cooling Capacity: ${sizingResult.detailedResults.cooling_capacity.toFixed(1)} kW
- Annual Heating Cost: $${sizingResult.detailedResults.annual_heating_cost.toLocaleString()}
- Annual Cooling Cost: $${sizingResult.detailedResults.annual_cooling_cost.toLocaleString()}
- System Efficiency: ${(sizingResult.detailedResults.system_efficiency * 100).toFixed(1)}%`;
      }

      return {
        content: [
          {
            type: 'text',
            text: `HVAC Sizing Results for Model ${modelId}:

Analysis completed successfully!
Output path: ${sizingResult.outputPath}

HVAC System Selection:
- Recommended System: ${sizingResult.hvacSystem}
- System Capacity: ${sizingResult.capacity?.toFixed(1)} kW
- System Efficiency: ${(sizingResult.efficiency ? sizingResult.efficiency * 100 : 0).toFixed(1)}%
- Estimated Annual Cost: $${sizingResult.annualCost?.toLocaleString()}
${detailedResultsText}

HVAC sizing completed. Results are ready for review.`,
          },
        ],
      };
    } catch (error) {
      logger.error('Error running HVAC sizing', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  private async handleRunNetZeroAnalysis(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.info('Running net-zero analysis', { args });

    try {
      // Validate that modelId is provided
      if (!args.modelId || typeof args.modelId !== 'string') {
        throw new Error('Model ID is required for net-zero analysis');
      }

      const modelId = args.modelId as string;

      // Get paths from environment or use defaults
      const modelsPath = process.env.MODELS_PATH || './data/models';
      const resultsPath = process.env.RESULTS_PATH || './data/results';
      const modelPath = `${modelsPath}/${modelId}.osm`;
      const outputPath = `${resultsPath}/netzero_${modelId}`;

      // Run net-zero analysis
      const netZeroResult = await runNetZeroAnalysis({
        modelPath,
        outputPath,
        optimizationLevel: args.optimizationLevel as
          | 'basic'
          | 'advanced'
          | 'comprehensive'
          | undefined,
        renewableSources: args.renewableSources as
          | Array<'solar' | 'wind' | 'geothermal'>
          | undefined,
        includeEconomicAnalysis: args.includeEconomicAnalysis as boolean | undefined,
        targetYear: args.targetYear as number | undefined,
      });

      // Format the results
      let economicResultsText = '';
      if (netZeroResult.detailedResults) {
        economicResultsText = `
Economic Analysis:
- Current Energy Use: ${netZeroResult.detailedResults.current_energy_use.toFixed(1)} kWh/m²/year
- Optimized Energy Use: ${netZeroResult.detailedResults.optimized_energy_use.toFixed(1)} kWh/m²/year
- Renewable Energy Generation: ${netZeroResult.detailedResults.renewable_energy_generation.toFixed(1)} kWh/m²/year
- Energy Balance: ${netZeroResult.detailedResults.energy_balance.toFixed(1)} kWh/m²/year (${netZeroResult.detailedResults.energy_balance > 0 ? 'export' : 'import'})
- Required Solar Capacity: ${netZeroResult.detailedResults.solar_capacity.toFixed(1)} kW
- Payback Period: ${netZeroResult.detailedResults.payback_period.toFixed(1)} years
- Net Present Value: $${netZeroResult.detailedResults.npv.toLocaleString()}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: `Net-Zero Analysis Results for Model ${modelId}:

Analysis completed successfully!
Output path: ${netZeroResult.outputPath}

Net-Zero Potential:
- Building is Net-Zero Capable: ${netZeroResult.isNetZeroCapable ? 'Yes' : 'No'}
- Energy Balance: ${netZeroResult.energyBalance.toFixed(1)} kWh/m²/year (${netZeroResult.energyBalance > 0 ? 'export' : 'import'})
- Renewable Energy Potential: ${netZeroResult.renewableEnergyPotential.toFixed(1)} kWh/m²/year
- Required Renewable Capacity: ${netZeroResult.requiredRenewableCapacity.toFixed(1)} kW
${netZeroResult.paybackPeriod ? `- Payback Period: ${netZeroResult.paybackPeriod.toFixed(1)} years` : ''}
${netZeroResult.npv ? `- Net Present Value: $${netZeroResult.npv.toLocaleString()}` : ''}
${economicResultsText}

Net-zero analysis completed. Results are ready for review.`,
          },
        ],
      };
    } catch (error) {
      logger.error('Error running net-zero analysis', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  private async handleCompleteEnergyModelWorkflow(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.info('Executing complete energy model workflow', { args });

    try {
      // Validate that description is provided
      if (!args.description || typeof args.description !== 'string') {
        throw new Error('Description is required for the energy model workflow');
      }

      // Step 1: Create energy model from natural language
      const createModelResult = await this.handleCreateEnergyModelNLP({
        description: args.description,
      });

      // Extract model ID from the result
      const modelIdMatch = createModelResult.content[0].text.match(
        /Created energy model with ID: ([^\n]+)/
      );
      if (!modelIdMatch || modelIdMatch.length < 2) {
        throw new Error('Failed to extract model ID from creation result');
      }

      const modelId = modelIdMatch[1].trim();
      logger.info('Created energy model', { modelId });

      // Step 2: Validate model against ASHRAE standards
      const ashraeStandard = (args.ashraeStandard as string) || 'ASHRAE 90.1-2019';
      const validateResult = await this.handleValidateModelAshrae({
        modelId,
        standard: ashraeStandard,
      });

      // Extract validation result
      const validationMatch = validateResult.content[0].text.match(
        /Model (meets|does not meet) ([^\n]+)/
      );
      const isCompliant = validationMatch && validationMatch[1] === 'meets';
      logger.info('Validated energy model', { modelId, isCompliant });

      // Step 3: Export to Radiance
      const exportWindows =
        args.exportWindows !== undefined ? (args.exportWindows as boolean) : true;
      const exportMaterials =
        args.exportMaterials !== undefined ? (args.exportMaterials as boolean) : true;

      const exportResult = await this.handleExportToRadiance({
        modelId,
        includeWindows: exportWindows,
        materialProperties: exportMaterials,
      });

      // Extract export path
      const exportPathMatch = exportResult.content[0].text.match(/Export path: ([^\n]+)/);
      const exportPath = exportPathMatch ? exportPathMatch[1].trim() : 'unknown';
      logger.info('Exported energy model to Radiance', { modelId, exportPath });

      return {
        content: [
          {
            type: 'text',
            text: `Complete Energy Modeling Workflow Results:
            
1. Model Creation:
${createModelResult.content[0].text}

2. ASHRAE Validation:
${validateResult.content[0].text}

3. Radiance Export:
${exportResult.content[0].text}

Workflow completed successfully!`,
          },
        ],
      };
    } catch (error) {
      logger.error(
        'Error executing complete energy model workflow',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  private async handleCreateEnergyModelNLP(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.info('Creating energy model from natural language', { args });

    try {
      // Validate that description is provided
      if (!args.description || typeof args.description !== 'string') {
        throw new Error('Description is required for natural language processing');
      }

      // Parse the natural language description into structured parameters
      const parsedParams = parseBuildingDescription(args.description as string);

      // Validate the parsed parameters
      const validation = validateBuildingParameters(parsedParams);
      if (!validation.isValid) {
        throw new Error(
          `Invalid parameters parsed from description: ${validation.errors.join(', ')}`
        );
      }

      // Get paths from environment or use defaults
      const modelsPath = process.env.MODELS_PATH || './data/models';
      const modelId = `model_${Date.now()}`;
      const outputPath = `${modelsPath}/${modelId}.osm`;

      const result = await createOpenStudioModel({
        buildingType: parsedParams.buildingType,
        location: parsedParams.location,
        floorArea: parsedParams.floorArea,
        description: parsedParams.description,
        outputPath,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Created energy model with ID: ${result.modelId}
Building Type: ${parsedParams.buildingType}
Location: ${parsedParams.location}
Floor Area: ${parsedParams.floorArea} m²
Description: ${parsedParams.description}
Output Path: ${result.path}

Model is ready for simulation.`,
          },
        ],
      };
    } catch (error) {
      logger.error(
        'Error creating energy model from natural language',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('MCP server is already running');
      return;
    }

    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.isRunning = true;
      logger.info('OpenStudio MCP server started successfully');
    } catch (error) {
      logger.error('Failed to start MCP server', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('MCP server is not running');
      return;
    }

    try {
      await this.server.close();
      this.isRunning = false;
      logger.info('OpenStudio MCP server stopped successfully');
    } catch (error) {
      logger.error('Error stopping MCP server', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  private async handleValidateModelLEED(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.info('Validating model against LEED standards', { args });

    try {
      // Validate that modelId is provided
      if (!args.modelId || typeof args.modelId !== 'string') {
        throw new Error('Model ID is required for LEED validation');
      }

      const modelId = args.modelId as string;

      // Get paths from environment or use defaults
      const modelsPath = process.env.MODELS_PATH || './data/models';
      const resultsPath = process.env.RESULTS_PATH || './data/results';
      const modelPath = `${modelsPath}/${modelId}.osm`;
      const outputPath = `${resultsPath}/leed_${modelId}`;

      // Run LEED validation
      const leedResult = await validateModelLEED({
        modelPath,
        outputPath,
        leedVersion: args.leedVersion as string | undefined,
        buildingType: args.buildingType as string | undefined,
        includeDetailedReport: args.includeDetailedReport as boolean | undefined,
      });

      // Format the results
      let detailedReportText = '';
      if (leedResult.detailedReport && leedResult.detailedReport) {
        detailedReportText = `
Detailed LEED Report:
`;
        for (const [category, data] of Object.entries(leedResult.detailedReport)) {
          if (typeof data === 'object' && data !== null) {
            detailedReportText += `- ${category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}:
`;
            for (const [key, value] of Object.entries(data)) {
              detailedReportText += `  - ${key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}: ${value}
`;
            }
          }
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `LEED Validation Results for Model ${modelId}:

Analysis completed successfully!
Output path: ${leedResult.outputPath}

LEED Certification Status:
- Compliant: ${leedResult.compliant ? 'Yes' : 'No'}
- LEED Score: ${leedResult.leedScore || 'N/A'}
- Certification Level: ${leedResult.certificationLevel || 'None'}
- Credits Earned: ${leedResult.creditsEarned || 'N/A'}
- Credits Required: ${leedResult.creditsRequired || 'N/A'}
${detailedReportText}

LEED validation completed. Results are ready for review.`,
          },
        ],
      };
    } catch (error) {
      logger.error('Error running LEED validation', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  public isServerRunning(): boolean {
    return this.isRunning;
  }
}
