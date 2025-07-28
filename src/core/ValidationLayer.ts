import type { Intent } from './IntentParser';
import type { EntityMetadata } from './EntityRegistry';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  confidence: number;
  alternativeCommands?: string[];
}

export interface ValidationContext {
  availableEntities: EntityMetadata[];
  currentScene: {
    bounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
    camera: {
      position: [number, number, number];
      orientation: {
        heading: number;
        pitch: number;
        roll: number;
      };
    };
  };
  userPermissions: string[];
  systemCapabilities: string[];
}

export class ValidationLayer {
  private context: ValidationContext;

  constructor(context: ValidationContext) {
    this.context = context;
  }

  public validateIntent(intent: Intent): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      confidence: intent.confidence,
      alternativeCommands: []
    };

    // Validate based on intent type
    switch (intent.type) {
      case 'layer_show':
      case 'layer_hide':
        this.validateLayerOperation(intent, result);
        break;
      case 'layer_show_only':
        this.validateShowOnlyOperation(intent, result);
        break;
      case 'camera_fly':
        this.validateCameraOperation(intent, result);
        break;
      case 'camera_zoom':
      case 'camera_rotate':
        this.validateCameraControl(intent, result);
        break;
      default:
        this.validateUnknownIntent(intent, result);
    }

    // General validation
    this.validatePermissions(intent, result);
    this.validateSystemCapabilities(intent, result);
    this.validateSpatialConstraints(intent, result);

    // Update overall validity
    result.isValid = result.errors.length === 0;
    result.confidence = this.calculateOverallConfidence(intent, result);

    return result;
  }

  private validateLayerOperation(intent: Intent, result: ValidationResult): void {
    const { layerId, layerNames } = intent.parameters;

    if (layerId && typeof layerId === 'string') {
      // Single layer operation
      const entity = this.findEntity(layerId);
      if (!entity) {
        result.errors.push(`Layer "${layerId}" not found`);
        result.suggestions.push('Use "list layers" to see available layers');
        
        // Suggest similar layer names
        const similarLayers = this.findSimilarLayers(layerId);
        if (similarLayers.length > 0) {
          result.alternativeCommands = similarLayers.map(layer => 
            `${intent.type === 'layer_show' ? 'show' : 'hide'} ${layer.name}`
          );
        }
      }
    } else if (layerNames && Array.isArray(layerNames)) {
      // Multiple layer operation
      const missingLayers: string[] = [];
      const foundLayers: EntityMetadata[] = [];

      for (const layerName of layerNames) {
        if (typeof layerName === 'string') {
          const entity = this.findEntity(layerName);
          if (entity) {
            foundLayers.push(entity);
          } else {
            missingLayers.push(layerName);
          }
        }
      }

      if (missingLayers.length > 0) {
        result.warnings.push(`Some layers not found: ${missingLayers.join(', ')}`);
        result.suggestions.push('Only found layers will be affected');
      }

      if (foundLayers.length === 0) {
        result.errors.push('No valid layers found');
        result.suggestions.push('Use "list layers" to see available layers');
      }
    }
  }

  private validateShowOnlyOperation(intent: Intent, result: ValidationResult): void {
    const { layerNames } = intent.parameters;

    if (!layerNames || !Array.isArray(layerNames) || layerNames.length === 0) {
      result.errors.push('No layers specified for show-only operation');
      result.suggestions.push('Specify which layers to show, e.g., "show only architecture and structural"');
      return;
    }

    const missingLayers: string[] = [];
    const foundLayers: EntityMetadata[] = [];

    for (const layerName of layerNames) {
      if (typeof layerName === 'string') {
        const entity = this.findEntity(layerName);
        if (entity) {
          foundLayers.push(entity);
        } else {
          missingLayers.push(layerName);
        }
      }
    }

    if (missingLayers.length > 0) {
      result.warnings.push(`Some specified layers not found: ${missingLayers.join(', ')}`);
      result.suggestions.push('Only found layers will be shown');
    }

    if (foundLayers.length === 0) {
      result.errors.push('No valid layers found for show-only operation');
      result.suggestions.push('Use "list layers" to see available layers');
    } else if (foundLayers.length === 1) {
      result.suggestions.push('Consider using "show layer" instead of "show only" for single layer');
    }
  }

  private validateCameraOperation(intent: Intent, result: ValidationResult): void {
    const { target } = intent.parameters;

    if (!target || typeof target !== 'string') {
      result.errors.push('No target specified for camera operation');
      result.suggestions.push('Specify a target, e.g., "fly to building" or "fly to entrance"');
      return;
    }

    // Try to find the target entity
    const targetEntity = this.findEntity(target);
    if (!targetEntity) {
      result.warnings.push(`Target "${target}" not found in scene`);
      result.suggestions.push('Camera will fly to approximate location based on scene bounds');
    } else {
      // Validate if target is within scene bounds
      const isInBounds = this.isEntityInSceneBounds(targetEntity);
      if (!isInBounds) {
        result.warnings.push(`Target "${target}" is outside current scene bounds`);
        result.suggestions.push('Consider adjusting scene bounds or using a different target');
      }
    }
  }

  private validateCameraControl(intent: Intent, result: ValidationResult): void {
    const { direction, factor } = intent.parameters;

    if (intent.type === 'camera_zoom') {
      if (factor !== undefined && typeof factor === 'number' && (factor <= 0 || factor > 10)) {
        result.warnings.push('Zoom factor should be between 0 and 10');
        result.suggestions.push('Using default zoom factor');
      }
    }

    if (intent.type === 'camera_rotate') {
      if (direction && typeof direction === 'string' && !['left', 'right', 'up', 'down', 'clockwise', 'counterclockwise'].includes(direction.toLowerCase())) {
        result.warnings.push(`Unrecognized rotation direction: "${direction}"`);
        result.suggestions.push('Use: left, right, up, down, clockwise, or counterclockwise');
      }
    }
  }

  private validateUnknownIntent(intent: Intent, result: ValidationResult): void {
    result.errors.push(`Unknown intent type: ${intent.type}`);
    result.suggestions.push('Try using standard commands like "show layers", "hide layers", or "fly to"');
    result.confidence = 0;
  }

  private validatePermissions(intent: Intent, result: ValidationResult): void {
    // Check if user has required permissions
    const requiredPermissions = this.getRequiredPermissions(intent);
    
    for (const permission of requiredPermissions) {
      if (!this.context.userPermissions.includes(permission)) {
        result.errors.push(`Permission required: ${permission}`);
        result.suggestions.push('Contact administrator for access');
      }
    }
  }

  private validateSystemCapabilities(intent: Intent, result: ValidationResult): void {
    // Check if system supports the operation
    const requiredCapabilities = this.getRequiredCapabilities(intent);
    
    for (const capability of requiredCapabilities) {
      if (!this.context.systemCapabilities.includes(capability)) {
        result.errors.push(`System capability required: ${capability}`);
        result.suggestions.push('Operation not supported in current system configuration');
      }
    }
  }

  private validateSpatialConstraints(intent: Intent, result: ValidationResult): void {
    // Validate spatial constraints for camera operations
    if (intent.type.startsWith('camera_')) {
      const currentCamera = this.context.currentScene.camera;
      const sceneBounds = this.context.currentScene.bounds;

      // Check if camera operation would take us too far from scene
      if (intent.type === 'camera_fly') {
        // This would be validated in validateCameraOperation
        return;
      }

      // For other camera operations, check if we're already at scene boundaries
      const isAtBoundary = this.isCameraAtBoundary(currentCamera, sceneBounds);
      if (isAtBoundary) {
        result.warnings.push('Camera is at scene boundary');
        result.suggestions.push('Some camera movements may be limited');
      }
    }
  }

  private findEntity(identifier: string): EntityMetadata | undefined {
    return this.context.availableEntities.find(entity => 
      entity.id.toLowerCase() === identifier.toLowerCase() ||
      entity.name.toLowerCase() === identifier.toLowerCase() ||
      entity.aliases.some(alias => alias.toLowerCase() === identifier.toLowerCase())
    );
  }

  private findSimilarLayers(name: string): EntityMetadata[] {
    const normalizedName = name.toLowerCase();
    return this.context.availableEntities
      .filter(entity => 
        entity.name.toLowerCase().includes(normalizedName) ||
        entity.aliases.some(alias => alias.toLowerCase().includes(normalizedName))
      )
      .slice(0, 3); // Return top 3 matches
  }

  private isEntityInSceneBounds(entity: EntityMetadata): boolean {
    const bounds = this.context.currentScene.bounds;
    const entityBounds = entity.spatial.bounds;

    return entityBounds.north <= bounds.north &&
           entityBounds.south >= bounds.south &&
           entityBounds.east <= bounds.east &&
           entityBounds.west >= bounds.west;
  }

  private isCameraAtBoundary(camera: ValidationContext['currentScene']['camera'], bounds: ValidationContext['currentScene']['bounds']): boolean {
    // Simplified boundary check - in practice, this would be more sophisticated
    const tolerance = 0.001; // degrees
    return Math.abs(camera.position[0] - bounds.east) < tolerance ||
           Math.abs(camera.position[0] - bounds.west) < tolerance ||
           Math.abs(camera.position[1] - bounds.north) < tolerance ||
           Math.abs(camera.position[1] - bounds.south) < tolerance;
  }

  private getRequiredPermissions(intent: Intent): string[] {
    const permissions: string[] = [];

    if (intent.type.startsWith('layer_')) {
      permissions.push('layer_control');
    }

    if (intent.type.startsWith('camera_')) {
      permissions.push('camera_control');
    }

    return permissions;
  }

  private getRequiredCapabilities(intent: Intent): string[] {
    const capabilities: string[] = [];

    if (intent.type.startsWith('layer_')) {
      capabilities.push('layer_management');
    }

    if (intent.type.startsWith('camera_')) {
      capabilities.push('camera_control');
    }

    return capabilities;
  }

  private calculateOverallConfidence(intent: Intent, result: ValidationResult): number {
    let confidence = intent.confidence;

    // Reduce confidence based on validation issues
    if (result.errors.length > 0) {
      confidence *= 0.5;
    }

    if (result.warnings.length > 0) {
      confidence *= 0.8;
    }

    // Boost confidence if we have good suggestions
    if (result.suggestions.length > 0 && result.errors.length === 0) {
      confidence = Math.min(confidence * 1.1, 1.0);
    }

    return confidence;
  }

  public updateContext(newContext: Partial<ValidationContext>): void {
    this.context = { ...this.context, ...newContext };
  }

  public getContext(): ValidationContext {
    return this.context;
  }
} 