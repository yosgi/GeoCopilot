import { useCallback, useState, useRef, useEffect } from 'react';
import { SceneContextManager } from './useSceneContext';
import { useLayerControl } from './useLayerControl';
import { useCameraControl } from './useCameraControl';
// import { useClippingControl } from './useClippingControl';
import { GeoCopilot } from '../core/GeoCopilot';
import { ToolAdapter } from '../core/ToolAdapter';
import * as Cesium from 'cesium';

interface GeoCopilotState {
  loading: boolean;
  error: string | null;
  lastResponse: string | null;
}

export const useGeoCopilot = (contextManager: SceneContextManager, openaiApiKey: string) => {
  const layerControl = useLayerControl();
  const cameraControl = useCameraControl();
  
  // const clippingControl = useClippingControl(contextManager.getViewer());
  const [state, setState] = useState<GeoCopilotState>({
    loading: false,
    error: null,
    lastResponse: null
  });

  const geoCopilotRef = useRef<GeoCopilot | null>(null);

  useEffect(() => {
    if (!geoCopilotRef.current) {
      geoCopilotRef.current = new GeoCopilot({
        confidenceThreshold: 0.7,
        maxResults: 10,
        enableValidation: true,
        enableSuggestions: true,
        enableHistory: true,
        enableAI: true,
        openaiApiKey: openaiApiKey
      });

      geoCopilotRef.current.registerTool('layerControl', ToolAdapter.fromLayerControl(layerControl));
      geoCopilotRef.current.registerTool('cameraControl', ToolAdapter.fromCameraControl(cameraControl));
      // geoCopilotRef.current.registerTool('clippingControl', ToolAdapter.fromClippingControl(clippingControl));

      geoCopilotRef.current.initialize();
    }
  }, [openaiApiKey, layerControl, cameraControl]);

  // Sync layer state to context when layers change
  useEffect(() => {
    if (geoCopilotRef.current) {
      const activeLayers = layerControl.layers
        .filter(layer => layer.visible)
        .map(layer => layer.id);
      console.log('Active layers:', activeLayers);
      geoCopilotRef.current.getContextManager().updateActiveLayers(activeLayers);

    }
  }, [layerControl.layers]);


  const initialize = useCallback((viewer: Cesium.Viewer) => {
    contextManager.setViewer(viewer);
    cameraControl.registerViewer(viewer);
    
    // Start auto-detection of Cesium objects
    layerControl.startAutoDetection(viewer);
  }, [contextManager, cameraControl, layerControl]);

  const run = useCallback(async (input: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      if (!geoCopilotRef.current) {
        throw new Error('GeoCopilot core engine not initialized');
      }

      // use core engine to execute command
      const result = await geoCopilotRef.current.executeWithAI(input);
      
      const finalResponse = result.output || 'Operation completed successfully';
      
      // handle execution result
      if (result.success) {
        setState(prev => ({
          ...prev,
          loading: false,
          lastResponse: finalResponse
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: finalResponse
        }));
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error occurred'
      }));
    }
  }, []);

  const clearHistory = useCallback(() => {
    setState({
      loading: false,
      error: null,
      lastResponse: null
    });
  }, []);

  return {
    ...state,
    run,
    clearHistory,
    initialize,
    layerControl,
  };
};

