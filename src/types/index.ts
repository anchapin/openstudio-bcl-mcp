/**
 * Core types for OpenStudio MCP Server
 */

// MCP Protocol Types
export interface MCPRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  id: string;
  result?: unknown;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

// OpenStudio Types
export interface OpenStudioConfig {
  cliPath: string;
  workingDirectory: string;
  timeout: number;
  maxConcurrentJobs: number;
}

export interface EnergyModel {
  id: string;
  name: string;
  format: ModelFormat;
  path: string;
  metadata: ModelMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export type ModelFormat = 'osm' | 'idf' | 'gbxml';

export interface ModelMetadata {
  buildingType?: string;
  climateZone?: string;
  location?: string;
  floorArea?: number;
  version?: string;
  tags?: string[];
}

// Simulation Types
export interface SimulationJob {
  id: string;
  modelId: string;
  status: JobStatus;
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  results?: SimulationResults;
  error?: string;
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SimulationResults {
  energyUse: EnergyUseResults;
  comfort: ComfortResults;
  daylighting?: DaylightingResults;
  outputFiles: OutputFile[];
}

export interface EnergyUseResults {
  totalEnergyUse: number; // kWh
  heatingEnergyUse: number;
  coolingEnergyUse: number;
  lightingEnergyUse: number;
  equipmentEnergyUse: number;
  monthlyData: MonthlyEnergyData[];
}

export interface ComfortResults {
  unmetHeatingHours: number;
  unmetCoolingHours: number;
  avgTemperature: number;
  avgHumidity: number;
}

export interface DaylightingResults {
  averageDaylightFactor: number;
  spatialDaylightAutonomy: number;
  annualSunlightExposure: number;
}

export interface MonthlyEnergyData {
  month: number;
  heating: number;
  cooling: number;
  lighting: number;
  equipment: number;
  total: number;
}

export interface OutputFile {
  name: string;
  path: string;
  type: 'csv' | 'html' | 'sql' | 'json';
  size: number;
}

// API Types
export interface CreateModelRequest {
  name: string;
  buildingType: string;
  climateZone: string;
  location: string;
  floorArea: number;
  description?: string;
}

export interface RunSimulationRequest {
  modelId: string;
  weatherFile?: string;
  measures?: MeasureConfig[];
  outputVariables?: string[];
}

export interface MeasureConfig {
  name: string;
  arguments: Record<string, unknown>;
}

// Service Types
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
}

export interface DatabaseConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

// Configuration Types
export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

export interface AppConfig {
  server: ServerConfig;
  openStudio: OpenStudioConfig;
  logging: {
    level: string;
    format: string;
  };
  storage: {
    modelsPath: string;
    resultsPath: string;
    tempPath: string;
  };
}

// Utility Types
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
