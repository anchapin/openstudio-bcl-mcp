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
  exportToRadiance,
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
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;
      const toolArgs = args ?? {};

      try {
        switch (name) {
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

  public isServerRunning(): boolean {
    return this.isRunning;
  }
}
