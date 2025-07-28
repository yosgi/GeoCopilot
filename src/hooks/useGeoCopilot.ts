import { useState, useRef, useCallback, useEffect } from 'react';
import { GeoCopilot } from '../core/GeoCopilot';
import { useCameraControl } from './useCameraControl';
import { useLayerControl } from './useLayerControl';
import { useFeatureControl } from './useFeatureControl';
import { useSceneUnderstanding } from './useSceneUnderstanding';
import { ToolAdapter } from '../core/ToolAdapter';
import * as Cesium from 'cesium';

export interface AICapabilities {
  layerControl: boolean;
  featureControl: boolean;
  cameraControl: boolean;
  selectionAnalysis: boolean;
}

export interface GeoCopilotState {
  loading: boolean;
  error: string | null;
  lastResponse: string | null;
  clarificationQuestions: string[];
  suggestions: string[];
}

export const useGeoCopilot = (openaiApiKey: string) => {
  const cameraControl = useCameraControl();
  const { 
    sceneData, 
    scanScene,  
    // getFeatureContext, 
    // getSceneSummary,
  } = useSceneUnderstanding();
  
  const layerControl = useLayerControl(sceneData);
  const featureControl = useFeatureControl(sceneData);
  
  // const clippingControl = useClippingControl(contextManager.getViewer());
  const [state, setState] = useState<GeoCopilotState>({
    loading: false,
    error: null,
    lastResponse: null,
    clarificationQuestions: [],
    suggestions: []
  });

  const [aiCapabilities, setAICapabilities] = useState<AICapabilities>({
    layerControl: true,
    featureControl: true,
    cameraControl: true,
    selectionAnalysis: true,
  });

  const geoCopilotRef = useRef<GeoCopilot | null>(null);

  // Update GeoCopilot with new capabilities
  const updateCapabilities = useCallback((capabilities: AICapabilities) => {
    setAICapabilities(capabilities);
    
    if (geoCopilotRef.current) {
      // Update the GeoCopilot configuration with new capabilities
      geoCopilotRef.current.updateConfig({
        aiCapabilities: capabilities
      });
    }
  }, []);

  useEffect(() => {
    if (!geoCopilotRef.current) {
      geoCopilotRef.current = new GeoCopilot({
        confidenceThreshold: 0.7,
        maxResults: 10,
        enableValidation: true,
        enableSuggestions: true,
        enableHistory: true,
        enableAI: true,
        openaiApiKey: openaiApiKey,
        aiCapabilities: aiCapabilities
      });

      geoCopilotRef.current.initialize();
    }
    
    if (geoCopilotRef.current) {
      geoCopilotRef.current.registerTool('layerControl', ToolAdapter.fromLayerControl(layerControl));
      geoCopilotRef.current.registerTool('featureControl', ToolAdapter.fromFeatureControl(featureControl));
      geoCopilotRef.current.registerTool('cameraControl', ToolAdapter.fromCameraControl(cameraControl));
      // geoCopilotRef.current.registerTool('clippingControl', ToolAdapter.fromClippingControl(clippingControl));
    }
  }, [openaiApiKey, layerControl, featureControl, cameraControl, aiCapabilities]);

  // Sync layer state to context when layers change
  useEffect(() => {
    if (geoCopilotRef.current) {
      // Generate statistics from sceneData
      const layerStats = {
        total: sceneData.layers.length,
        visible: sceneData.layers.filter(l => l.visible).length,
        byType: sceneData.layers.reduce((acc, layer) => {
          acc[layer.type] = (acc[layer.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        names: sceneData.layers.map(l => l.name),
        visibleNames: sceneData.layers.filter(l => l.visible).map(l => l.name)
      };

      const featureStats = {
        total: sceneData.features.length,
        byCategory: sceneData.features.reduce((acc, feature) => {
          const category = feature.properties.subcategory as string || 'Unknown';
          acc[category] = (acc[category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byLayer: sceneData.features.reduce((acc, feature) => {
          const layer = feature.properties.layer as string || 'Unknown';
          acc[layer] = (acc[layer] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byType: sceneData.features.reduce((acc, feature) => {
          const type = feature.properties.Type as string || 'Unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };

      // Generate sample data for AI context
      const sampleLayers = sceneData.layers.slice(0, 2).map(layer => ({
        id: layer.id,
        name: layer.name,
        type: layer.type,
        visible: layer.visible,
        metadata: layer.metadata
      }));

      const sampleFeatures = sceneData.features.slice(0, 2).map(feature => ({
        elementId: feature.elementId,
        properties: feature.properties,
        description: feature.description
      }));

      geoCopilotRef.current.getContextManager().updateSceneStats({
        layerStats,
        featureStats,
        sampleLayers,
        sampleFeatures
      });
    }
  }, [sceneData]);


  const initialize = useCallback((viewer: Cesium.Viewer) => {
    // contextManager.setViewer(viewer);
    cameraControl.registerViewer(viewer);
    scanScene(viewer);
    // Start auto-detection of Cesium objects
    // layerControl.startAutoDetection(viewer);
  }, [cameraControl, scanScene]);

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
    sceneData,
    aiCapabilities,
    updateCapabilities,
    // Add method to get AI context
    getAIContext: () => {
      if (geoCopilotRef.current) {
        return geoCopilotRef.current.getContextManager().getContextForAI();
      }
      return 'AI context not available';
    }
  };
};

