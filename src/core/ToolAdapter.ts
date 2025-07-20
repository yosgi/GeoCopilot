import type { CoreTool } from './GeoCopilot';

// tool adapter, convert hooks tool to core tool
export class ToolAdapter {
  /**
   * Map layer name to layer ID
   */
  private static mapLayerNameToId(layerName: string, layers: Array<{ id: string; name: string; type: string; visible: boolean; [key: string]: unknown }>): string {
    const normalizedName = layerName.toLowerCase();
    
    // First try to find by exact name match
    const exactMatch = layers.find(layer => layer.name.toLowerCase() === normalizedName);
    if (exactMatch) {
      return exactMatch.id;
    }
    
    // Then try to find by partial name match
    const partialMatch = layers.find(layer => layer.name.toLowerCase().includes(normalizedName) || normalizedName.includes(layer.name.toLowerCase()));
    if (partialMatch) {
      return partialMatch.id;
    }
    
    // Fallback to common mappings
    const commonMappings: Record<string, string> = {
      'architecture': 'tileset_1',
      'facade': 'tileset_2', 
      'structural': 'tileset_3',
      'electrical': 'tileset_5',
      'hvac': 'tileset_6',
      'plumbing': 'tileset_7',
      'site': 'tileset_8'
    };
    
    const mappedId = commonMappings[normalizedName];
    if (mappedId) {
      return mappedId;
    }
    
    // If no match found, return the original name (might be a direct ID)
    return layerName;
  }

  /**
   * convert LayerControl hook to CoreTool
   */
  static fromLayerControl(layerControl: {
    layers: Array<{ id: string; name: string; type: string; visible: boolean; [key: string]: unknown }>;
    setVisibility: (layerId: string, visible: boolean) => Promise<{ success: boolean; message: string }>;
    setOpacity: (layerId: string, opacity: number) => Promise<{ success: boolean; message: string }>;
    hideAll: () => Promise<{ success: boolean; message: string }>;
    showAll: () => Promise<{ success: boolean; message: string }>;
    showOnly: (layerIds: string[]) => Promise<{ success: boolean; message: string }>;
  }): CoreTool {
    return {
      name: 'layerControl',
      description: 'Control layer visibility, opacity, and other properties',
      execute: async (params: Record<string, unknown>) => {
        const action = params.action as string;
        const layerId = params.layerId as string;
        const layerIds = params.layerIds as string[];
        const opacity = params.opacity as number;

        try {
          switch (action) {
            case 'show':
              if (layerId) {
                const actualLayerId = this.mapLayerNameToId(layerId, layerControl.layers);
                const result = await layerControl.setVisibility(actualLayerId, true);
                return result.message;
              } else {
                const result = await layerControl.showAll();
                return result.message;
              }

            case 'hide':
              if (layerId) {
                const actualLayerId = this.mapLayerNameToId(layerId, layerControl.layers);
                const result = await layerControl.setVisibility(actualLayerId, false);
                return result.message;
              } else {
                const result = await layerControl.hideAll();
                return result.message;
              }

            case 'showAll': {
              const result = await layerControl.showAll();
              return result.message;
            }

            case 'hideAll': {
              const result = await layerControl.hideAll();
              return result.message;
            }

            case 'showOnly': {
              if (layerIds && layerIds.length > 0) {
                const mappedLayerIds = layerIds.map(id => this.mapLayerNameToId(id, layerControl.layers));
                const result = await layerControl.showOnly(mappedLayerIds);
                return result.message;
              } else {
                return 'No layers specified for showOnly operation';
              }
            }

            case 'setOpacity': {
              if (layerId && opacity !== undefined) {
                const actualLayerId = this.mapLayerNameToId(layerId, layerControl.layers);
                const result = await layerControl.setOpacity(actualLayerId, opacity);
                return result.message;
              } else {
                return 'Missing layerId or opacity parameter';
              }
            }

            case 'listLayers': {
              const layers = layerControl.layers;
              if (layers.length === 0) {
                return 'No layers available';
              }
              return layers.map(layer => `${layer.id} (${layer.name})`).join(', ');
            }

            default:
              return `Unknown layer control action: ${action}`;
          }
        } catch (error) {
          return `Layer control error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }
    };
  }

  /**
   * convert CameraControl hook to CoreTool
   */
  static fromCameraControl(cameraControl: {
    flyTo: (options: {
      longitude?: number;
      latitude?: number;
      height?: number;
      heading?: number;
      pitch?: number;
      roll?: number;
      duration?: number;
    }) => Promise<{ success: boolean; message: string }>;
    setPosition: (options: {
      longitude: number;
      latitude: number;
      height?: number;
      heading?: number;
      pitch?: number;
      roll?: number;
    }) => Promise<{ success: boolean; message: string }>;
    zoom: (factor: number) => Promise<{ success: boolean; message: string }>;
    rotate: (heading: number, pitch?: number) => Promise<{ success: boolean; message: string }>;
    lookAt: (options: {
      longitude: number;
      latitude: number;
      height?: number;
      distance?: number;
    }) => Promise<{ success: boolean; message: string }>;
    resetView: () => Promise<{ success: boolean; message: string }>;
  }): CoreTool {
    return {
      name: 'cameraControl',
      description: 'Control camera position, orientation, and movement. For flyTo action, provide longitude, latitude, and height coordinates.',
      execute: async (params: Record<string, unknown>) => {
        const action = params.action as string;

        try {
          switch (action) {
            case 'flyTo': {
              const options = {
                longitude: params.longitude as number,
                latitude: params.latitude as number,
                height: params.height as number,
                heading: params.heading as number,
                pitch: params.pitch as number,
                roll: params.roll as number,
                duration: params.duration as number
              };
              const result = await cameraControl.flyTo(options);
              return result.message;
            }

            case 'setPosition': {
              const options = {
                longitude: params.longitude as number,
                latitude: params.latitude as number,
                height: params.height as number,
                heading: params.heading as number,
                pitch: params.pitch as number,
                roll: params.roll as number
              };
              const result = await cameraControl.setPosition(options);
              return result.message;
            }

            case 'zoom': {
              const factor = params.factor as number;
              const result = await cameraControl.zoom(factor);
              return result.message;
            }

            case 'rotate': {
              const heading = params.heading as number;
              const pitch = params.pitch as number;
              const result = await cameraControl.rotate(heading, pitch);
              return result.message;
            }

            case 'lookAt': {
              const options = {
                longitude: params.longitude as number,
                latitude: params.latitude as number,
                height: params.height as number,
                distance: params.distance as number
              };
              const result = await cameraControl.lookAt(options);
              return result.message;
            }

            case 'resetView': {
              const result = await cameraControl.resetView();
              return result.message;
            }

            default:
              return `Unknown camera control action: ${action}`;
          }
        } catch (error) {
          return `Camera control error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }
    };
  }

  /**
   * convert ClippingControl hook to CoreTool
   */
  static fromClippingControl(clippingControl: [
    {
      planes: Array<{ id: string; normal: unknown; distance: number; enabled: boolean }>;
      selectedPlaneId: string | null;
      isDragging: boolean;
      edgeStylingEnabled: boolean;
      debugBoundingVolumesEnabled: boolean;
    },
    {
      addPlane: (config: { normal: unknown; distance: number; enabled: boolean; edgeWidth?: number; edgeColor?: unknown }) => string;
      removePlane: (id: string) => void;
      updatePlane: (id: string, updates: Partial<{ normal: unknown; distance: number; enabled: boolean; edgeWidth?: number; edgeColor?: unknown }>) => void;
      selectPlane: (id: string | null) => void;
      setEdgeStyling: (enabled: boolean) => void;
      setDebugBoundingVolumes: (enabled: boolean) => void;
      reset: () => void;
      applyToTileset: (tileset: unknown) => void;
      applyToModel: (entity: unknown) => void;
      applyToAllObjects: () => void;
    }
  ]): CoreTool {
    const [state, actions] = clippingControl;

    return {
      name: 'clippingControl',
      description: 'Control clipping planes for 3D models and tilesets. Use this to slice through 3D objects to see their internal structure.',
      execute: async (params: Record<string, unknown>) => {
        const action = params.action as string;

        try {
          switch (action) {
            case 'addPlane': {
              const planeId = actions.addPlane({
                normal: params.normal as unknown,
                distance: params.distance as number || 0.0,
                enabled: true,
                edgeWidth: params.edgeWidth as number || 1.0,
                edgeColor: params.edgeColor as unknown
              });
              actions.applyToAllObjects();
              return `Successfully created clipping plane with ID: ${planeId}. The plane is now visible and applied to all 3D objects.`;
            }

            case 'removePlane': {
              const planeId = params.planeId as string;
              if (planeId) {
                actions.removePlane(planeId);
                return `Successfully removed clipping plane: ${planeId}`;
              } else {
                actions.reset();
                return "Successfully removed all clipping planes.";
              }
            }

            case 'removeAll': {
              actions.reset();
              return "Successfully removed all clipping planes.";
            }

            case 'setEdgeStyling': {
              const enabled = params.enabled as boolean;
              actions.setEdgeStyling(enabled);
              return `Successfully ${enabled ? 'enabled' : 'disabled'} edge styling for clipping planes.`;
            }

            case 'setDebugBoundingVolumes': {
              const enabled = params.enabled as boolean;
              actions.setDebugBoundingVolumes(enabled);
              return `Successfully ${enabled ? 'enabled' : 'disabled'} debug bounding volumes.`;
            }

            case 'applyToAllObjects': {
              actions.applyToAllObjects();
              return "Successfully applied clipping planes to all objects in the scene.";
            }

            case 'status': {
              const planeCount = state.planes.length;
              const edgeEnabled = state.edgeStylingEnabled;
              const debugEnabled = state.debugBoundingVolumesEnabled;
              
              return `Clipping Control Status:
- Active planes: ${planeCount}
- Edge styling: ${edgeEnabled ? 'enabled' : 'disabled'}
- Debug bounding volumes: ${debugEnabled ? 'enabled' : 'disabled'}
- Selected plane: ${state.selectedPlaneId || 'none'}`;
            }

            default:
              return `Unknown clipping control action: ${action}. Available actions: addPlane, removePlane, removeAll, setEdgeStyling, setDebugBoundingVolumes, applyToAllObjects, status`;
          }
        } catch (error) {
          return `Clipping control error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }
    };
  }
} 