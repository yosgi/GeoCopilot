import { useCallback, useState } from 'react';
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { SceneContextManager } from './useSceneContext';
import { createLayerControlTool,useLayerControl } from './useLayerControl';
import { createCameraControlTool,useCameraControl } from './useCameraControl';
import * as Cesium from 'cesium';

interface GeoCopilotState {
  loading: boolean;
  error: string | null;
  lastResponse: string | null;
}

export const useGeoCopilot = (contextManager: SceneContextManager, openaiApiKey: string) => {
  const layerControl = useLayerControl();
  const cameraControl = useCameraControl();
  const [state, setState] = useState<GeoCopilotState>({
    loading: false,
    error: null,
    lastResponse: null
  });

  const initialize = useCallback((viewer: Cesium.Viewer) => {
    contextManager.setViewer(viewer);
    cameraControl.registerViewer(viewer);
  }, [contextManager,cameraControl]);

  const run = useCallback(async (input: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const result = await runNewAgent(input, contextManager, layerControl, cameraControl, openaiApiKey);
      let finalResponse = result.output || 'Operation completed successfully';
      if (result.intermediateSteps && result.intermediateSteps.length > 0) {
        const allSteps = result.intermediateSteps;
        const successfulSteps = allSteps.filter((step: { observation?: string }) => 
          step.observation && step.observation.includes('Successfully')
        );
        if (successfulSteps.length > 0 && !finalResponse.includes('Successfully')) {
          const lastStep = successfulSteps[successfulSteps.length - 1];
          const toolAction = lastStep.action.toolInput?.action;
          const layerCount = lastStep.observation.match(/\d+/)?.[0] || '';
          if (toolAction === 'showAll') {
            finalResponse = `I have successfully shown all ${layerCount} layers in the scene.`;
          } else if (toolAction === 'hideAll') {
            finalResponse = `I have successfully hidden all ${layerCount} layers in the scene.`;
          } else if (toolAction === 'show') {
            finalResponse = `I have successfully shown the requested layer.`;
          } else if (toolAction === 'hide') {
            finalResponse = `I have successfully hidden the requested layer.`;
          } else {
            finalResponse = lastStep.observation;
          }
        }
      }
      setState(prev => ({
        ...prev,
        loading: false,
        lastResponse: finalResponse
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error occurred'
      }));
    }
  }, [contextManager,layerControl,openaiApiKey]);

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

async function runNewAgent(
  input: string,
  contextManager: SceneContextManager,
  layerControl: ReturnType<typeof useLayerControl>,
  cameraControl: ReturnType<typeof useCameraControl>,
  openaiApiKey: string
) {
  const model = new ChatOpenAI({
    temperature: 0,
    modelName: "gpt-4o-mini",
    openAIApiKey: openaiApiKey,
  });
  const aiContext = contextManager.getAIContext();
  const tools = [
    createLayerControlTool(layerControl),
    createCameraControlTool(cameraControl),
  ];
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are an AI assistant for controlling a 3D BIM digital twin scene.
      CURRENT SCENE CONTEXT:
      ${aiContext.sceneDescription}

      Available tools:
      - layerControl: Control layer visibility, opacity, and other properties

      EXECUTION RULES:
      1. For simple requests, call the appropriate tool once and provide a confirmation
      2. For complex requests, you may need to call multiple tools in sequence
      3. When you see Successfully in a tool result, that means your task is complete. Stop and respond to the user.
      4. Stop when the user's request is fully satisfied 
      5. If you need to call multiple tools, explain what you're doing

      Examples:
      - "show all layers" → call layerControl with action: "showAll" → confirm success
      - "hide site and show architecture" → call layerControl twice → confirm both actions
      - "show only structural and electrical layers" → call layerControl with showOnly → confirm
      
      Always provide helpful, friendly responses that confirm what was accomplished.
      `
    ],
    ["user", "{input}"],
    ["assistant", "{agent_scratchpad}"]
  ]);
  const agent = await createToolCallingAgent({
    llm: model,
    tools,
    prompt,
  });
  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    maxIterations: 3,
    returnIntermediateSteps: true,  
    handleParsingErrors: true  
  });
  const result = await executor.invoke({ 
    input,
  });
  return result;
}

