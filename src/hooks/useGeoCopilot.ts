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
  clarificationQuestions: string[];
  suggestions: string[];
}

export const useGeoCopilot = (contextManager: SceneContextManager, openaiApiKey: string) => {
  const layerControl = useLayerControl();
  const cameraControl = useCameraControl();
  
  // const clippingControl = useClippingControl(contextManager.getViewer());
  const [state, setState] = useState<GeoCopilotState>({
    loading: false,
    error: null,
    lastResponse: null,
    clarificationQuestions: [],
    suggestions: []
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
    setState(prev => ({ ...prev, loading: true, error: null, clarificationQuestions: [], suggestions: [] }));
    
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
          lastResponse: finalResponse,
          clarificationQuestions: [],
          suggestions: result.suggestions || []
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: finalResponse,
          clarificationQuestions: result.clarificationQuestions || [],
          suggestions: result.suggestions || []
        }));
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error occurred',
        clarificationQuestions: [],
        suggestions: []
      }));
    }
  }, []);

  const clearHistory = useCallback(() => {
    setState({
      loading: false,
      error: null,
      lastResponse: null,
      clarificationQuestions: [],
      suggestions: []
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

