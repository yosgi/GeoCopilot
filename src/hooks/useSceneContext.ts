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
  
  // Scene context manager
export class SceneContextManager {
  private context: SceneContext;
  private viewer: Cesium.Viewer | null = null;
  private listeners: Array<(context: SceneContext) => void> = [];

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
    this.setupViewerListeners();
    this.updateContextFromViewer();
  }

  // Get Cesium viewer
  getViewer(): Cesium.Viewer | null {
    return this.viewer;
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
    
    commands.push('Show/hide layers', 'Change time', 'Switch view mode');
    
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

  // Manually update layer information
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