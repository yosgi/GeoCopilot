import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import * as Cesium from 'cesium';
import { DynamicTool } from "@langchain/core/tools";

export interface ClippingPlaneConfig {
  id: string;
  normal: Cesium.Cartesian3;
  distance: number;
  enabled: boolean;
  edgeWidth?: number;
  edgeColor?: Cesium.Color;
}

export interface ClippingControlState {
  planes: ClippingPlaneConfig[];
  selectedPlaneId: string | null;
  isDragging: boolean;
  edgeStylingEnabled: boolean;
  debugBoundingVolumesEnabled: boolean;
}

export interface ClippingControlActions {
  addPlane: (config: Omit<ClippingPlaneConfig, 'id'>) => string;
  removePlane: (id: string) => void;
  updatePlane: (id: string, updates: Partial<ClippingPlaneConfig>) => void;
  selectPlane: (id: string | null) => void;
  setEdgeStyling: (enabled: boolean) => void;
  setDebugBoundingVolumes: (enabled: boolean) => void;
  reset: () => void;
  applyToTileset: (tileset: Cesium.Cesium3DTileset) => void;
  applyToModel: (entity: Cesium.Entity) => void;
  applyToAllObjects: () => void;
}

// Create clipping control tool for LangChain Agent
export function createClippingControlTool(clippingControl: ReturnType<typeof useClippingControl>) {
  return new DynamicTool({
    name: "clippingControl",
    description: "Control clipping planes for 3D models and tilesets. Use this to slice through 3D objects to see their internal structure.",
    func: async (input: string) => {
      try {
        const [state, actions] = clippingControl;
        const inputLower = input.toLowerCase();
        
        // Parse the input to determine the action
        if (inputLower.includes('add') || inputLower.includes('create')) {
          // Add a new clipping plane positioned in front of the camera
          const planeId = actions.addPlane({
            normal: new Cesium.Cartesian3(0.0, 0.0, -1.0), // Will be overridden by camera position
            distance: 0.0, // Will be calculated based on camera position
            enabled: true,
            edgeWidth: 1.0,
            edgeColor: Cesium.Color.WHITE
          });
          
          // Apply to all objects in the scene
          actions.applyToAllObjects();
          
          return `Successfully created clipping plane with ID: ${planeId}. The plane is now visible and applied to all 3D objects. You can drag it to adjust the slice position.`;
        }
        
        if (inputLower.includes('remove') || inputLower.includes('delete')) {
          // Remove all planes or specific plane
          if (inputLower.includes('all')) {
            actions.reset();
            return "Successfully removed all clipping planes.";
          } else {
            // Try to extract plane ID from input
            const planeIdMatch = input.match(/plane[_-](\d+)/i);
            if (planeIdMatch && state.planes.length > 0) {
              const planeId = state.planes[0].id; // Remove first plane for now
              actions.removePlane(planeId);
              return `Successfully removed clipping plane: ${planeId}`;
            } else {
              return "Please specify which plane to remove or use 'remove all' to remove all planes.";
            }
          }
        }
        
        if (inputLower.includes('edge') || inputLower.includes('styling')) {
          // Toggle edge styling
          const enable = !inputLower.includes('disable') && !inputLower.includes('off');
          actions.setEdgeStyling(enable);
          return `Successfully ${enable ? 'enabled' : 'disabled'} edge styling for clipping planes.`;
        }
        
        if (inputLower.includes('debug') || inputLower.includes('bounding')) {
          // Toggle debug bounding volumes
          const enable = !inputLower.includes('disable') && !inputLower.includes('off');
          actions.setDebugBoundingVolumes(enable);
          return `Successfully ${enable ? 'enabled' : 'disabled'} debug bounding volumes.`;
        }
        
        if (inputLower.includes('apply') || inputLower.includes('to')) {
          // Apply clipping planes to objects in the scene
          // This would need to be implemented based on the current scene state
          return "Clipping planes are ready to be applied. Use 'add plane' to create a clipping plane first, then drag it to adjust the slice position.";
        }
        
                if (inputLower.includes('status') || inputLower.includes('info')) {
          // Return current status
          const planeCount = state.planes.length;
          const edgeEnabled = state.edgeStylingEnabled;
          const debugEnabled = state.debugBoundingVolumesEnabled;
          
          return `Clipping Control Status:
- Active planes: ${planeCount}
- Edge styling: ${edgeEnabled ? 'enabled' : 'disabled'}
- Debug bounding volumes: ${debugEnabled ? 'enabled' : 'disabled'}
- Selected plane: ${state.selectedPlaneId || 'none'}`;
        }
        
        if (inputLower.includes('test')) {
          // Create a simple test plane
          const testPlaneId = actions.addPlane({
            normal: new Cesium.Cartesian3(0.0, 0.0, 1.0), // Simple vertical plane
            distance: 0.0,
            enabled: true,
            edgeWidth: 1.0,
            edgeColor: Cesium.Color.WHITE
          });
          
          return `Test plane created with ID: ${testPlaneId}. Check console for debug info.`;
        }
        
                return `Clipping control command not recognized. Available commands:
- "add plane" or "create plane" - Add a new clipping plane
- "remove all" - Remove all clipping planes
- "edge styling on/off" - Toggle edge styling
- "debug bounding volumes on/off" - Toggle debug mode
- "status" - Show current status
- "apply to model" - Apply clipping to current model
- "test plane" - Create a test plane for debugging`;
                
      } catch (error) {
        return `Error in clipping control: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
  });
}

export function useClippingControl(viewer: Cesium.Viewer | null): [ClippingControlState, ClippingControlActions] {
  const [state, setState] = useState<ClippingControlState>({
    planes: [],
    selectedPlaneId: null,
    isDragging: false,
    edgeStylingEnabled: true,
    debugBoundingVolumesEnabled: false
  });

  const planeEntitiesRef = useRef<Cesium.Entity[]>([]);
  const clippingPlanesRef = useRef<Cesium.ClippingPlaneCollection | null>(null);
  const selectedPlaneRef = useRef<Cesium.ClippingPlane | null>(null);
  const targetDistanceRef = useRef<number>(0);
  const downHandlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const upHandlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const moveHandlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  // Generate unique ID
  const generateId = useCallback(() => {
    return `plane_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);



  // Create plane entity for visualization
  const createPlaneEntity = useCallback((plane: ClippingPlaneConfig, boundingSphere: Cesium.BoundingSphere) => {
    const radius = boundingSphere.radius;
    
    // Create a clipping plane for this entity
    const clippingPlane = new Cesium.ClippingPlane(plane.normal, plane.distance);
    
    // Store the clipping plane for later reference
    if (!clippingPlanesRef.current) {
      clippingPlanesRef.current = new Cesium.ClippingPlaneCollection({
        planes: [clippingPlane],
        edgeWidth: state.edgeStylingEnabled ? 1.0 : 0.0,
        edgeColor: Cesium.Color.WHITE
      });
    } else {
      clippingPlanesRef.current.add(clippingPlane);
    }

    const planeUpdateFunction = () => {
      clippingPlane.distance = plane.distance;
      return clippingPlane;
    };

    console.log('Creating plane entity with dimensions:', {
      radius,
      dimensions: new Cesium.Cartesian2(radius * 3.0, radius * 3.0),
      position: boundingSphere.center.toString(),
      normal: plane.normal.toString(),
      distance: plane.distance
    });

    return viewer?.entities.add({
      id: plane.id,
      position: boundingSphere.center,
      plane: {
        dimensions: new Cesium.Cartesian2(radius * 3.0, radius * 3.0), // Much larger for better visibility
        material: Cesium.Color.RED.withAlpha(0.5), // Bright red for maximum visibility
        plane: new Cesium.CallbackProperty(
          planeUpdateFunction,
          false
        ),
        outline: true,
        outlineColor: Cesium.Color.RED,
        outlineWidth: 5.0, // Very thick outline
      },
    });
  }, [viewer, state.edgeStylingEnabled]);

  // Setup mouse event handlers
  const setupEventHandlers = useCallback(() => {
    if (!viewer) return;

    // Remove existing handlers
    if (downHandlerRef.current) downHandlerRef.current.destroy();
    if (upHandlerRef.current) upHandlerRef.current.destroy();
    if (moveHandlerRef.current) moveHandlerRef.current.destroy();

    // Mouse down handler
    downHandlerRef.current = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    downHandlerRef.current.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const pickedObject = viewer.scene.pick(movement.position);
      if (pickedObject?.id?.plane) {
        const planeId = pickedObject.id.id;
        setState(prev => ({ ...prev, selectedPlaneId: planeId, isDragging: true }));
        
        // Find the corresponding clipping plane instance
        if (clippingPlanesRef.current) {
          const planeIndex = clippingPlanesRef.current.length - 1; // Get the last added plane
          selectedPlaneRef.current = clippingPlanesRef.current.get(planeIndex);
        }
        
        viewer.scene.screenSpaceCameraController.enableInputs = false;
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    // Mouse up handler
    upHandlerRef.current = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    upHandlerRef.current.setInputAction(() => {
      if (selectedPlaneRef.current) {
        selectedPlaneRef.current = null;
      }
      setState(prev => ({ ...prev, selectedPlaneId: null, isDragging: false }));
      viewer.scene.screenSpaceCameraController.enableInputs = true;
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    // Mouse move handler
    moveHandlerRef.current = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    moveHandlerRef.current.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      if (selectedPlaneRef.current) {
        const deltaY = movement.startPosition.y - movement.endPosition.y;
        targetDistanceRef.current += deltaY;
        
        // Update plane distance in state
        setState(prev => ({
          ...prev,
          planes: prev.planes.map(plane => 
            plane.id === prev.selectedPlaneId 
              ? { ...plane, distance: targetDistanceRef.current }
              : plane
          )
        }));
        
        // Update the actual clipping plane distance
        selectedPlaneRef.current.distance = targetDistanceRef.current;
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }, [viewer]);

  // Individual action functions
  const addPlane = useCallback((config: Omit<ClippingPlaneConfig, 'id'>) => {
    const id = generateId();
    
    // Calculate camera-relative position for the plane
    let normal = config.normal;
    let distance = config.distance;
    
    if (viewer) {
      const camera = viewer.camera;
      const cameraPosition = camera.position;
      const cameraDirection = camera.direction;
      
      // Use camera direction as plane normal (facing the camera)
      normal = Cesium.Cartesian3.negate(cameraDirection, new Cesium.Cartesian3());
      
      // Calculate distance based on camera position and a reasonable offset
      const cameraHeight = cameraPosition.z;
      const offset = 50; // Distance in front of camera
      distance = cameraHeight + offset;
      
      console.log('Adding plane:', {
        id,
        normal: normal.toString(),
        distance,
        cameraPosition: cameraPosition.toString(),
        cameraDirection: cameraDirection.toString()
      });
    }
    
    const newPlane: ClippingPlaneConfig = {
      id,
      normal,
      distance,
      enabled: config.enabled,
      edgeWidth: config.edgeWidth,
      edgeColor: config.edgeColor
    };

    setState(prev => ({
      ...prev,
      planes: [...prev.planes, newPlane]
    }));

    // Create visual entity for the plane immediately
    if (viewer) {
      // Create a default bounding sphere at camera position for visualization
      const cameraPosition = viewer.camera.position;
      const defaultRadius = 5000; // Much larger for better visibility
      const boundingSphere = new Cesium.BoundingSphere(cameraPosition, defaultRadius);
      
      console.log('Creating plane entity with bounding sphere:', {
        center: boundingSphere.center.toString(),
        radius: boundingSphere.radius
      });
      
      const entity = createPlaneEntity(newPlane, boundingSphere);
      if (entity) {
        planeEntitiesRef.current.push(entity);
        console.log('Plane entity created successfully:', entity.id);
      } else {
        console.error('Failed to create plane entity');
      }
    }

    return id;
  }, [generateId, viewer, createPlaneEntity]);

  const removePlane = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      planes: prev.planes.filter(plane => plane.id !== id),
      selectedPlaneId: prev.selectedPlaneId === id ? null : prev.selectedPlaneId
    }));

    // Remove entity
    if (viewer) {
      const entity = viewer.entities.getById(id);
      if (entity) {
        viewer.entities.remove(entity);
      }
    }
  }, [viewer]);

  const updatePlane = useCallback((id: string, updates: Partial<ClippingPlaneConfig>) => {
    setState(prev => ({
      ...prev,
      planes: prev.planes.map(plane => 
        plane.id === id ? { ...plane, ...updates } : plane
      )
    }));
  }, []);

  const selectPlane = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, selectedPlaneId: id }));
  }, []);

  const setEdgeStyling = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, edgeStylingEnabled: enabled }));
    if (clippingPlanesRef.current) {
      clippingPlanesRef.current.edgeWidth = enabled ? 1.0 : 0.0;
    }
  }, []);

  const setDebugBoundingVolumes = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, debugBoundingVolumesEnabled: enabled }));
  }, []);

  const reset = useCallback(() => {
    setState(prev => ({
      ...prev,
      planes: [],
      selectedPlaneId: null,
      isDragging: false
    }));

    // Clear entities
    planeEntitiesRef.current.forEach(entity => {
      viewer?.entities.remove(entity);
    });
    planeEntitiesRef.current = [];

    // Clear clipping planes
    if (clippingPlanesRef.current) {
      clippingPlanesRef.current.destroy();
      clippingPlanesRef.current = null;
    }
  }, [viewer]);

  const applyToTileset = useCallback((tileset: Cesium.Cesium3DTileset) => {
    // Create a new clipping plane collection for this tileset
    const tilesetClippingPlanes = new Cesium.ClippingPlaneCollection({
      planes: state.planes.map(plane => 
        new Cesium.ClippingPlane(plane.normal, plane.distance)
      ),
      edgeWidth: state.edgeStylingEnabled ? 1.0 : 0.0,
      edgeColor: Cesium.Color.WHITE
    });
    tileset.clippingPlanes = tilesetClippingPlanes;

    // Create plane entities for visualization if they don't exist
    const boundingSphere = tileset.boundingSphere;
    state.planes.forEach(plane => {
      // Check if entity already exists
      const existingEntity = viewer?.entities.getById(plane.id);
      if (!existingEntity) {
        const entity = createPlaneEntity(plane, boundingSphere);
        if (entity) {
          planeEntitiesRef.current.push(entity);
        }
      }
    });

    // Handle tileset transform
    if (!Cesium.Matrix4.equals(tileset.root.transform, Cesium.Matrix4.IDENTITY)) {
      const transformCenter = Cesium.Matrix4.getTranslation(
        tileset.root.transform,
        new Cesium.Cartesian3()
      );
      const transformCartographic = Cesium.Cartographic.fromCartesian(transformCenter);
      const boundingSphereCartographic = Cesium.Cartographic.fromCartesian(
        tileset.boundingSphere.center
      );
      const height = boundingSphereCartographic.height - transformCartographic.height;
      tilesetClippingPlanes.modelMatrix = Cesium.Matrix4.fromTranslation(
        new Cesium.Cartesian3(0.0, 0.0, height)
      );
    }
  }, [state.planes, state.edgeStylingEnabled, createPlaneEntity, viewer]);

  const applyToModel = useCallback((entity: Cesium.Entity) => {
    // Create a new clipping plane collection for this model
    const modelClippingPlanes = new Cesium.ClippingPlaneCollection({
      planes: state.planes.map(plane => 
        new Cesium.ClippingPlane(plane.normal, plane.distance)
      ),
      edgeWidth: state.edgeStylingEnabled ? 1.0 : 0.0,
      edgeColor: Cesium.Color.WHITE
    });
    
    if (entity.model) {
      (entity.model as unknown as Cesium.Model).clippingPlanes = modelClippingPlanes;
    }

    // Create plane entities for visualization if they don't exist
    const position = entity.position?.getValue(Cesium.JulianDate.now());
    if (position) {
      const boundingSphere = new Cesium.BoundingSphere(position, 300.0);
      state.planes.forEach(plane => {
        // Check if entity already exists
        const existingEntity = viewer?.entities.getById(plane.id);
        if (!existingEntity) {
          const planeEntity = createPlaneEntity(plane, boundingSphere);
          if (planeEntity) {
            planeEntitiesRef.current.push(planeEntity);
          }
        }
      });
    }
  }, [state.planes, state.edgeStylingEnabled, createPlaneEntity, viewer]);

  // Apply clipping planes to all objects in the scene
  const applyToAllObjects = useCallback(() => {
    if (!viewer) return;

    // Create a new clipping plane collection for each object
    const primitives = viewer.scene.primitives;
    for (let i = 0; i < primitives.length; i++) {
      const primitive = primitives.get(i);
      if (primitive instanceof Cesium.Cesium3DTileset) {
        // Create a separate clipping plane collection for each tileset
        const tilesetClippingPlanes = new Cesium.ClippingPlaneCollection({
          planes: state.planes.map(plane => 
            new Cesium.ClippingPlane(plane.normal, plane.distance)
          ),
          edgeWidth: state.edgeStylingEnabled ? 1.0 : 0.0,
          edgeColor: Cesium.Color.WHITE
        });
        primitive.clippingPlanes = tilesetClippingPlanes;
      }
    }

    // Apply to all entities with models
    const entities = viewer.entities.values;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (entity.model) {
        // Create a separate clipping plane collection for each model
        const modelClippingPlanes = new Cesium.ClippingPlaneCollection({
          planes: state.planes.map(plane => 
            new Cesium.ClippingPlane(plane.normal, plane.distance)
          ),
          edgeWidth: state.edgeStylingEnabled ? 1.0 : 0.0,
          edgeColor: Cesium.Color.WHITE
        });
        (entity.model as unknown as Cesium.Model).clippingPlanes = modelClippingPlanes;
      }
    }
  }, [viewer, state.planes, state.edgeStylingEnabled]);

  // Actions object
  const actions: ClippingControlActions = useMemo(() => ({
    addPlane,
    removePlane,
    updatePlane,
    selectPlane,
    setEdgeStyling,
    setDebugBoundingVolumes,
    reset,
    applyToTileset,
    applyToModel,
    applyToAllObjects
  }), [addPlane, removePlane, updatePlane, selectPlane, setEdgeStyling, setDebugBoundingVolumes, reset, applyToTileset, applyToModel, applyToAllObjects]);

  // Setup event handlers when viewer changes
  useEffect(() => {
    setupEventHandlers();
    return () => {
      if (downHandlerRef.current) downHandlerRef.current.destroy();
      if (upHandlerRef.current) upHandlerRef.current.destroy();
      if (moveHandlerRef.current) moveHandlerRef.current.destroy();
    };
  }, [setupEventHandlers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  return [state, actions];
} 