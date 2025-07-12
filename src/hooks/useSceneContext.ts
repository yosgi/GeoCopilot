import * as Cesium from "cesium";
import { useEffect, useState } from "react";

// Cesium Scene Context
export interface SceneContext {
    // Basic scene information
    location: {
      name: string;
      coordinates: [number, number, number]; // [lng, lat, height]
      bounds: {
        north: number;
        south: number;
        east: number;
        west: number;
      };
    };
    
    // Camera state
    camera: {
      position: [number, number, number];
      orientation: {
        heading: number;
        pitch: number;
        roll: number;
      };
      viewDistance: number;
    };
    
    // Layer information
    layers: Array<{
      id: string;
      name: string;
      type: 'BIM' | 'Terrain' | 'Imagery' | 'Point Cloud' | 'Vector';
      visible: boolean;
      opacity?: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: Record<string, any>;
      assetId?: number;
      description?: string;
    }>;
    
    // Currently selected features
    selectedFeatures: Array<{
      id: string;
      layerId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: Record<string, any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      geometry?: any;
      center?: [number, number, number];
    }>;
    
    // Environment settings
    environment: {
      time: string; // ISO format
      lighting: 'day' | 'night' | 'dawn' | 'dusk';
      weather?: 'clear' | 'cloudy' | 'rainy' | 'snowy';
      shadows: boolean;
    };
    
    // Available interaction capabilities
    capabilities: {
      canFly: boolean;
      canMeasure: boolean;
      canAnalyze: boolean;
      canFilter: boolean;
      canExport: boolean;
      availableViewModes: string[];
    };
}

// layer control result interface
export interface LayerControlResult {
  success: boolean;
  message: string;
  affectedLayers?: string[];
}

// Scene context manager
export class SceneContextManager {
  private context: SceneContext;
  private viewer: Cesium.Viewer | null = null;
  private listeners: Array<(context: SceneContext) => void> = [];
  // store Cesium objects, eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cesiumObjects: Map<string, any> = new Map();

  constructor(initialContext: Partial<SceneContext> = {}) {
    this.context = {
      location: {
        name: 'Unknown Location',
        coordinates: [0, 0, 0],
        bounds: { north: 0, south: 0, east: 0, west: 0 }
      },
      camera: {
        position: [0, 0, 0],
        orientation: { heading: 0, pitch: 0, roll: 0 },
        viewDistance: 1000
      },
      layers: [],
      selectedFeatures: [],
      environment: {
        time: new Date().toISOString(),
        lighting: 'day',
        shadows: true
      },
      capabilities: {
        canFly: true,
        canMeasure: true,
        canAnalyze: true,
        canFilter: true,
        canExport: true,
        availableViewModes: ['3D', 'Columbus', '2D']
      },
      ...initialContext
    };
  }

  // Set Cesium viewer and start listening for changes
  setViewer(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    console.log('set viewer');
    this.setupViewerListeners();
    this.updateContextFromViewer();
  }

  // Get Cesium viewer
  getViewer(): Cesium.Viewer | null {
    return this.viewer;
  }

  // register Cesium object to layer system
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerCesiumObject(layerId: string, cesiumObject: any, metadata?: Partial<SceneContext['layers'][0]>): void {
    this.cesiumObjects.set(layerId, cesiumObject);
    
    // if layer information exists, update it; otherwise, create a new one
    const existingLayerIndex = this.context.layers.findIndex(layer => layer.id === layerId);
    
    const layerInfo: SceneContext['layers'][0] = {
      id: layerId,
      name: metadata?.name || layerId,
      type: metadata?.type || 'BIM',
      visible: cesiumObject.show !== undefined ? cesiumObject.show : true,
      opacity: metadata?.opacity || 1.0,
      properties: metadata?.properties || {},
      assetId: metadata?.assetId,
      description: metadata?.description
    };

    if (existingLayerIndex >= 0) {
      this.context.layers[existingLayerIndex] = layerInfo;
    } else {
      this.context.layers.push(layerInfo);
    }
    
    console.log(`📋 Registered Cesium object for layer: ${layerId}`);
    this.notifyListeners();
  }

  // batch register Cesium objects
  registerCesiumObjects(objects: Array<{
    layerId: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cesiumObject: any;
    metadata?: Partial<SceneContext['layers'][0]>;
  }>): void {
    objects.forEach(({ layerId, cesiumObject, metadata }) => {
      this.registerCesiumObject(layerId, cesiumObject, metadata);
    });
  }

  // unregister Cesium object
  unregisterCesiumObject(layerId: string): boolean {
    const success = this.cesiumObjects.delete(layerId);
    if (success) {
      this.context.layers = this.context.layers.filter(layer => layer.id !== layerId);
      console.log(`🗑️ Unregistered Cesium object for layer: ${layerId}`);
      this.notifyListeners();
    }
    return success;
  }

  // set layer visibility
  setLayerVisibility(layerId: string, visible: boolean): LayerControlResult {
    const cesiumObject = this.cesiumObjects.get(layerId);
    const layerIndex = this.context.layers.findIndex(layer => layer.id === layerId);

    if (!cesiumObject || layerIndex === -1) {
      return {
        success: false,
        message: `Layer '${layerId}' not found. Available layers: ${this.getLayerIds().join(', ')}`
      };
    }

    try {
      // update Cesium object
      if (cesiumObject.show !== undefined) {
        cesiumObject.show = visible;
      } else if (cesiumObject.visible !== undefined) {
        cesiumObject.visible = visible;
      } else {
        return {
          success: false,
          message: `Layer '${layerId}' does not support visibility control`
        };
      }

      // update layer state in context
      this.context.layers[layerIndex].visible = visible;
      this.notifyListeners();

      console.log(`✅ Layer '${layerId}' visibility set to: ${visible}`);
      return {
        success: true,
        message: `Layer '${layerId}' is now ${visible ? 'visible' : 'hidden'}`,
        affectedLayers: [layerId]
      };
    } catch (error) {
      console.error(`❌ Failed to set visibility for layer '${layerId}':`, error);
      return {
        success: false,
        message: `Failed to set visibility for layer '${layerId}': ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // set layer opacity
  setLayerOpacity(layerId: string, opacity: number): LayerControlResult {
    const cesiumObject = this.cesiumObjects.get(layerId);
    const layerIndex = this.context.layers.findIndex(layer => layer.id === layerId);

    if (!cesiumObject || layerIndex === -1) {
      return {
        success: false,
        message: `Layer '${layerId}' not found`
      };
    }

    opacity = Math.max(0, Math.min(1, opacity));

    try {
      // set opacity based on object type
      if (cesiumObject instanceof Cesium.Cesium3DTileset) {
        cesiumObject.style = new Cesium.Cesium3DTileStyle({
          color: `color('white', ${opacity})`
        });
      } else if (cesiumObject.material) {
        cesiumObject.material.alpha = opacity;
      } else if (cesiumObject.alpha !== undefined) {
        cesiumObject.alpha = opacity;
      }

      // update context
      this.context.layers[layerIndex].opacity = opacity;
      this.notifyListeners();

      return {
        success: true,
        message: `Layer '${layerId}' opacity set to ${(opacity * 100).toFixed(0)}%`,
        affectedLayers: [layerId]
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to set opacity for layer '${layerId}': ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // set layers by type
  setLayersByType(type: string, visible: boolean): LayerControlResult {
    const matchingLayers = this.context.layers.filter(layer => layer.type === type);

    if (matchingLayers.length === 0) {
      return {
        success: false,
        message: `No layers found with type '${type}'. Available types: ${this.getLayerTypes().join(', ')}`
      };
    }

    const results: string[] = [];
    let successCount = 0;

    matchingLayers.forEach(layer => {
      const result = this.setLayerVisibility(layer.id, visible);
      if (result.success) {
        successCount++;
        results.push(layer.id);
      }
    });

    return {
      success: successCount > 0,
      message: `${successCount}/${matchingLayers.length} layers of type '${type}' ${visible ? 'shown' : 'hidden'}`,
      affectedLayers: results
    };
  }

  // set multiple layers visibility
  setMultipleLayersVisibility(layerIds: string[], visible: boolean): LayerControlResult {
    const results: string[] = [];
    const errors: string[] = [];

    layerIds.forEach(layerId => {
      const result = this.setLayerVisibility(layerId, visible);
      if (result.success) {
        results.push(layerId);
      } else {
        errors.push(layerId);
      }
    });

    const message = results.length > 0 
      ? `${results.length}/${layerIds.length} layers ${visible ? 'shown' : 'hidden'}${errors.length > 0 ? `. Failed: ${errors.join(', ')}` : ''}`
      : `Failed to ${visible ? 'show' : 'hide'} any layers`;

    return {
      success: results.length > 0,
      message,
      affectedLayers: results
    };
  }

  // show all layers
  showAllLayers(): LayerControlResult {
    const layerIds = this.getLayerIds();
    return this.setMultipleLayersVisibility(layerIds, true);
  }

  // hide all layers
  hideAllLayers(): LayerControlResult {
    const layerIds = this.getLayerIds();
    return this.setMultipleLayersVisibility(layerIds, false);
  }

  // show only specified layers
  showOnlyLayers(layerIds: string[]): LayerControlResult {
    const allLayerIds = this.getLayerIds();
    const results: string[] = [];
    let successCount = 0;

    allLayerIds.forEach(layerId => {
      const shouldBeVisible = layerIds.includes(layerId);
      const result = this.setLayerVisibility(layerId, shouldBeVisible);
      if (result.success) {
        successCount++;
        if (shouldBeVisible) {
          results.push(layerId);
        }
      }
    });

    return {
      success: successCount > 0,
      message: `Now showing only: ${results.join(', ')}. ${successCount}/${allLayerIds.length} layers updated.`,
      affectedLayers: results
    };
  }

  // toggle layer visibility
  toggleLayerVisibility(layerId: string): LayerControlResult {
    const layer = this.context.layers.find(l => l.id === layerId);
    if (!layer) {
      return {
        success: false,
        message: `Layer '${layerId}' not found`
      };
    }

    return this.setLayerVisibility(layerId, !layer.visible);
  }

  // get layer information
  getLayer(layerId: string): SceneContext['layers'][0] | null {
    return this.context.layers.find(layer => layer.id === layerId) || null;
  }

  getLayerIds(): string[] {
    return this.context.layers.map(layer => layer.id);
  }

  getLayerTypes(): string[] {
    const types = new Set(this.context.layers.map(layer => layer.type));
    return Array.from(types);
  }

  // query layers
  queryLayers(filter: Partial<SceneContext['layers'][0]>): SceneContext['layers'] {
    return this.context.layers.filter(layer => {
      return Object.entries(filter).every(([key, value]) => 
        layer[key as keyof typeof layer] === value
      );
    });
  }

  // get layer summary
  getLayersSummary(): {
    total: number;
    visible: number;
    hidden: number;
    byType: Record<string, { total: number; visible: number }>;
  } {
    const total = this.context.layers.length;
    const visible = this.context.layers.filter(layer => layer.visible).length;
    const hidden = total - visible;

    const byType: Record<string, { total: number; visible: number }> = {};
    this.context.layers.forEach(layer => {
      if (!byType[layer.type]) {
        byType[layer.type] = { total: 0, visible: 0 };
      }
      byType[layer.type].total++;
      if (layer.visible) {
        byType[layer.type].visible++;
      }
    });

    return { total, visible, hidden, byType };
  }

  // Listen for viewer changes
  private setupViewerListeners() {
    if (!this.viewer) return;

    // Listen for camera changes
    this.viewer.camera.changed.addEventListener(() => {
      this.updateCameraContext();
    });

    // Listen for selection changes
    this.viewer.selectedEntityChanged.addEventListener(() => {
      this.updateSelectedFeatures();
    });

    // Listen for time changes
    this.viewer.clock.onTick.addEventListener(() => {
      this.updateEnvironmentContext();
    });
  }

  // Update camera context
  private updateCameraContext() {
    if (!this.viewer) return;

    const camera = this.viewer.camera;
    const position = camera.positionWC;
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    
    this.context.camera = {
      position: [
        Cesium.Math.toDegrees(cartographic.longitude),
        Cesium.Math.toDegrees(cartographic.latitude),
        cartographic.height
      ],
      orientation: {
        heading: camera.heading,
        pitch: camera.pitch,
        roll: camera.roll
      },
      viewDistance: this.calculateViewDistance()
    };

    this.notifyListeners();
  }

  // Update selected features
  private updateSelectedFeatures() {
    if (!this.viewer) return;

    const selectedEntity = this.viewer.selectedEntity;
    if (selectedEntity) {
      // Process selected feature information
      const featureInfo = this.extractFeatureInfo(selectedEntity);
      if (featureInfo) {
        this.context.selectedFeatures = [featureInfo];
        this.notifyListeners();
      }
    } else {
      this.context.selectedFeatures = [];
      this.notifyListeners();
    }
  }

  // Extract feature information
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractFeatureInfo(entity: Cesium.Entity): any {
    // Extract feature information based on actual needs
    return {
      id: entity.id,
      layerId: 'unknown',
      properties: {},
      // Add more information extraction logic if needed
    };
  }

  // Calculate view distance
  private calculateViewDistance(): number {
    if (!this.viewer) return 1000;
    
    const camera = this.viewer.camera;
    const scene = this.viewer.scene;
    const globe = scene.globe;
    
    // Check if globe is available
    if (!globe || !globe.ellipsoid) {
      // Fallback to camera height calculation
      const position = camera.position;
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        return cartographic ? cartographic.height : 1000;
      }
      return 1000;
    }
    
    const ellipsoid = globe.ellipsoid;
    const cameraHeight = ellipsoid.cartesianToCartographic(camera.position).height;
    
    return cameraHeight;
  }

  // Update environment context
  private updateEnvironmentContext() {
    if (!this.viewer) return;

    const currentTime = this.viewer.clock.currentTime;
    this.context.environment.time = Cesium.JulianDate.toIso8601(currentTime);
    
    // Determine lighting conditions based on time
    const hour = new Date(this.context.environment.time).getHours();
    if (hour >= 6 && hour < 18) {
      this.context.environment.lighting = 'day';
    } else {
      this.context.environment.lighting = 'night';
    }
  }

  // Update full context from viewer
  private updateContextFromViewer() {
    if (!this.viewer) return;

    this.updateCameraContext();
    this.updateSelectedFeatures();
    this.updateEnvironmentContext();
  }

  // Get current scene description (for AI understanding)
  getSceneDescription(): string {
    const { location, camera, layers, selectedFeatures, environment } = this.context;
    
    let description = `The current scene is located at ${location.name}`;
    description += `, coordinates (${location.coordinates[0].toFixed(6)}, ${location.coordinates[1].toFixed(6)})`;
    description += `, height ${location.coordinates[2].toFixed(2)} meters.`;
    
    description += `\n\nCamera position: height ${camera.position[2].toFixed(2)} meters,`;
    description += `heading ${(camera.orientation.heading * 180 / Math.PI).toFixed(1)} degrees,`;
    description += `pitch ${(camera.orientation.pitch * 180 / Math.PI).toFixed(1)} degrees.`;
    
    description += `\n\nVisible layers:`;
    const visibleLayers = layers.filter(layer => layer.visible);
    if (visibleLayers.length > 0) {
      description += visibleLayers.map(layer => layer.name).join('、');
    } else {
      description += 'None';
    }
    
    if (selectedFeatures.length > 0) {
      description += `\n\nCurrently selected ${selectedFeatures.length} features.`;
    }
    
    description += `\n\nEnvironment: ${environment.lighting === 'day' ? 'Day' : 'Night'},`;
    description += `time ${new Date(environment.time).toLocaleString()}.`;
    
    // layer summary
    const summary = this.getLayersSummary();
    description += `\n\nLayer summary: ${summary.visible}/${summary.total} layers visible.`;
    
    return description;
  }

  // Get available command list
  getAvailableCommands(): string[] {
    const commands = [];
    
    if (this.context.capabilities.canFly) {
      commands.push('Fly to specified location', 'Change view', 'Zoom to feature');
    }
    
    if (this.context.capabilities.canMeasure) {
      commands.push('Measure distance', 'Measure area', 'Measure height');
    }
    
    if (this.context.capabilities.canAnalyze) {
      commands.push('Analyze feature properties', 'Spatial query', 'Feature filtering');
    }
    
    // layer control commands
    commands.push(
      'Show/hide layers', 
      'Show layers by type', 
      'Show only specific layers',
      'Set layer opacity',
      'Toggle layer visibility',
      'Show/hide all layers'
    );
    
    commands.push('Change time', 'Switch view mode');
    
    return commands;
  }

  // Get full AI context
  getAIContext(): {
    sceneDescription: string;
    availableCommands: string[];
    currentState: SceneContext;
  } {
    return {
      sceneDescription: this.getSceneDescription(),
      availableCommands: this.getAvailableCommands(),
      currentState: { ...this.context }
    };
  }

  // Add context change listener
  addListener(listener: (context: SceneContext) => void) {
    this.listeners.push(listener);
  }

  // Notify listeners
  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.context));
  }

  // Manually update layer information (保持向后兼容)
  updateLayers(layers: SceneContext['layers']) {
    this.context.layers = layers;
    this.notifyListeners();
  }

  // Manually update scene location information
  updateLocation(location: Partial<SceneContext['location']>) {
    this.context.location = { ...this.context.location, ...location };
    this.notifyListeners();
  }

  // Get current context
  getContext(): SceneContext {
    return { ...this.context };
  }
}
  
export const useSceneContext = () => {
  const [contextManager] = useState(() => new SceneContextManager({
    location: {
      name: 'Philadelphia Building Site',
      coordinates: [-79.886626, 40.021649, 235.65],
      bounds: {
        north: 40.025,
        south: 40.020,
        east: -79.884,
        west: -79.890
      }
    },
    capabilities: {
      canFly: true,
      canMeasure: true,
      canAnalyze: true,
      canFilter: true,
      canExport: true,
      availableViewModes: ['3D', 'Columbus', '2D']
    }
  }));

  const [context, setContext] = useState<SceneContext>(contextManager.getContext());

  useEffect(() => {
    contextManager.addListener(setContext);
  }, [contextManager]);

  return {
    contextManager,
    context,
    getAIContext: () => contextManager.getAIContext()
  };
};