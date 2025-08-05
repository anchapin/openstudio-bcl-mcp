import { logger } from './logger';

/**
 * Convert natural language building description to structured parameters
 * @param description - Natural language description of the building
 * @returns Structured parameters for energy model creation
 */
export function parseBuildingDescription(description: string): {
  buildingType: string;
  location: string;
  floorArea: number;
  description: string;
} {
  logger.debug('Parsing building description', { description });

  // Initialize default values
  let buildingType = 'office';
  let location = 'New York, NY';
  let floorArea = 5000; // Default to 5000 square meters

  // Convert to lowercase for easier matching
  const lowerDescription = description.toLowerCase();

  // Extract building type keywords
  if (lowerDescription.includes('office')) {
    buildingType = 'office';
  } else if (
    lowerDescription.includes('residential') ||
    lowerDescription.includes('house') ||
    lowerDescription.includes('home')
  ) {
    buildingType = 'residential';
  } else if (
    lowerDescription.includes('retail') ||
    lowerDescription.includes('shop') ||
    lowerDescription.includes('store')
  ) {
    buildingType = 'retail';
  } else if (lowerDescription.includes('school') || lowerDescription.includes('education')) {
    buildingType = 'education';
  } else if (lowerDescription.includes('hospital') || lowerDescription.includes('healthcare')) {
    buildingType = 'healthcare';
  }

  // Extract location information (simplified - in a real implementation this would be more sophisticated)
  // For now, we'll look for common city names
  if (lowerDescription.includes('new york') || lowerDescription.includes('nyc')) {
    location = 'New York, NY';
  } else if (lowerDescription.includes('los angeles') || lowerDescription.includes('la')) {
    location = 'Los Angeles, CA';
  } else if (lowerDescription.includes('chicago')) {
    location = 'Chicago, IL';
  } else if (lowerDescription.includes('houston')) {
    location = 'Houston, TX';
  } else if (lowerDescription.includes('phoenix')) {
    location = 'Phoenix, AZ';
  } else if (lowerDescription.includes('philadelphia')) {
    location = 'Philadelphia, PA';
  } else if (lowerDescription.includes('san antonio') || lowerDescription.includes('san antonio')) {
    location = 'San Antonio, TX';
  } else if (lowerDescription.includes('san diego')) {
    location = 'San Diego, CA';
  } else if (lowerDescription.includes('dallas')) {
    location = 'Dallas, TX';
  } else if (lowerDescription.includes('san jose')) {
    location = 'San Jose, CA';
  }

  // Extract floor area (look for numbers followed by square feet or square meters)
  const areaRegex = /(\d+(?:\.\d+)?)\s*(?:square\s*(?:feet|ft|ft2|meters|m2|metres|m|sq\s*ft))/gi;
  const areaMatches = [...description.matchAll(areaRegex)];

  if (areaMatches.length > 0) {
    // Take the first match
    const match = areaMatches[0];
    const areaValue = parseFloat(match[1]);
    const unit = match[2].toLowerCase();

    // Convert to square meters if needed
    if (unit.includes('feet') || unit.includes('ft')) {
      floorArea = Math.round(areaValue * 0.092903); // Convert square feet to square meters
    } else {
      floorArea = Math.round(areaValue);
    }
  } else {
    // Look for just numbers and assume they're square feet
    const numberRegex = /(\d+(?:\.\d+)?)/g;
    const numberMatches = [...description.matchAll(numberRegex)];

    if (numberMatches.length > 0) {
      const firstNumber = parseFloat(numberMatches[0][1]);
      // Assume it's square feet and convert to square meters
      floorArea = Math.round(firstNumber * 0.092903);
    }
  }

  // Ensure reasonable floor area bounds
  if (floorArea < 100) {
    floorArea = 100; // Minimum 100 square meters
  } else if (floorArea > 1000000) {
    floorArea = 1000000; // Maximum 1,000,000 square meters
  }

  logger.debug('Parsed building parameters', { buildingType, location, floorArea });

  return {
    buildingType,
    location,
    floorArea,
    description,
  };
}

/**
 * Validate parsed building parameters
 * @param params - Parsed building parameters
 * @returns Validation result with any errors
 */
export function validateBuildingParameters(params: {
  buildingType: string;
  location: string;
  floorArea: number;
  description: string;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate building type
  const validBuildingTypes = ['office', 'residential', 'retail', 'education', 'healthcare'];
  if (!validBuildingTypes.includes(params.buildingType)) {
    errors.push(
      `Invalid building type: ${params.buildingType}. Valid types are: ${validBuildingTypes.join(', ')}`
    );
  }

  // Validate floor area
  if (params.floorArea < 100) {
    errors.push('Floor area must be at least 100 square meters');
  } else if (params.floorArea > 1000000) {
    errors.push('Floor area must be no more than 1,000,000 square meters');
  }

  // Validate location (basic check)
  if (!params.location || params.location.trim().length === 0) {
    errors.push('Location is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
