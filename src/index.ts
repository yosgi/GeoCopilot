// Core hooks
export { useGeoCopilot } from './hooks/useGeoCopilot';
export { useLayerControl, createLayerControlTool } from './hooks/useLayerControl';
export { useCameraControl, createCameraControlTool } from './hooks/useCameraControl';
export { useSceneContext, SceneContextManager } from './hooks/useSceneContext';

// Types
export interface GeoCopilotState {
  loading: boolean;
  error: string | null;
  lastResponse: string | null;
}

export interface LayerInfo {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  [key: string]: unknown;
}

export interface CameraInfo {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

export type { SceneContext } from './hooks/useSceneContext';

// Re-export Cesium types for convenience
export type { Viewer, Camera, Cesium3DTileset } from 'cesium'; 