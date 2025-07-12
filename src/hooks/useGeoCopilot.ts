import { useCallback, useState } from 'react';
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { SceneContextManager } from './useSceneContext';
import { createLayerControlTool } from '../tools/layerControl';



interface GeoCopilotCommand {
  action: string;
  target?: string;
  parameters?: Record<string, unknown>;
  color?: string;
}

interface GeoCopilotState {
  commands: GeoCopilotCommand[];
  loading: boolean;
  error: string | null;
  lastResponse: string | null;
}

export const useGeoCopilot = (contextManager: SceneContextManager) => {
  const [state, setState] = useState<GeoCopilotState>({
    commands: [],
    loading: false,
    error: null,
    lastResponse: null
  });

  const run = useCallback(async (input: string) => {
    console.log('🔍 [useGeoCopilot] Starting run with input:', input);
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // get the current scene context
      const sceneContext = contextManager.getContext();
      
      console.log('🔍 [useGeoCopilot] Sending to AI:', { input, sceneContext });

      // call the enhanced AI agent
      const result = await runNewAgent(input, contextManager);
      
      console.log('🔍 [useGeoCopilot] AI Response:', result);

      setState(prev => ({
        ...prev,
        commands: [],
        loading: false,
        lastResponse: result.output || 'Operation completed successfully'
      }));
    } catch (err) {
      console.error('🔍 [useGeoCopilot] GeoCopilot error:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error occurred'
      }));
    }
  }, [contextManager]);

  const clearHistory = useCallback(() => {
    setState({
      commands: [],
      loading: false,
      error: null,
      lastResponse: null
    });
  }, []);

  return {
    ...state,
    run,
    clearHistory
  };
};


async function runNewAgent(input: string, contextManager: SceneContextManager) {
  const model = new ChatOpenAI({
    temperature: 0,
    modelName: "gpt-4",
    openAIApiKey: import.meta.env.VITE_OPENAI_API_KEY
  });

  const aiContext = contextManager.getAIContext();

  const tools = [
    createLayerControlTool(contextManager),
  ];

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are an AI assistant for controlling a 3D BIM digital twin scene.

CURRENT SCENE CONTEXT:
${aiContext.sceneDescription}

AVAILABLE LAYERS: ${contextManager.getLayerIds().join(', ')}
AVAILABLE LAYER TYPES: ${contextManager.getLayerTypes().join(', ')}

You have access to the following tools:
- layerControl: Control layer visibility, opacity, and other properties

For ANY layer operation, you MUST use the layerControl tool. Do NOT provide text explanations.

Layer names: ${contextManager.getLayerIds().join(', ')}

Example: User says "hide site layer" → You MUST call layerControl tool with action="hide", layerId="site"`
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
  });

  const result = await executor.invoke({ 
    input,
  });

  return result;
}

