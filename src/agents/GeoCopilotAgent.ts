import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createLayerControlTool } from '../tools/layerControl';
import type { SceneContext } from '../hooks/useSceneContext';
import type { SceneContextManager } from '../hooks/useSceneContext';

interface GeoCopilotCommand {
  action: string;
  target?: string;
  parameters?: Record<string, unknown>;
  color?: string;
}

interface AgentResponse {
  commands: GeoCopilotCommand[];
  explanation?: string;
  success: boolean;
}

export const runLocalAgent = async (
  input: string, 
  sceneContext: SceneContext,
  contextManager: SceneContextManager
): Promise<AgentResponse> => {
  console.log('🔍 [GeoCopilotAgent] Starting runLocalAgent with input:', input);
  
  const model = new ChatOpenAI({
    temperature: 0,
    modelName: "gpt-4",
    openAIApiKey: import.meta.env.VITE_OPENAI_API_KEY
  });

  // build scene prompt
  const sceneInfo = buildScenePrompt(sceneContext);
  console.log('🔍 [GeoCopilotAgent] Built scene prompt:', sceneInfo);

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are an AI assistant for controlling a 3D BIM (Building Information Modeling) digital twin scene using natural language commands.

    CURRENT SCENE CONTEXT:
    ${sceneInfo}

    RESPONSE FORMAT:
    You have access to tools that you can use to perform actions. IMPORTANT: You MUST use the appropriate tool to perform operations. Do not respond with plain text - always use tools.

    For layer operations, use the layerControl tool. Available layers: ${sceneContext.layers.map(l => l.name).join(', ')}. For example:
    - To hide all layers: Use layerControl tool with action="hideAll"
    - To show a layer: Use layerControl tool with action="show", layerId="LayerName"
    - To hide a layer: Use layerControl tool with action="hide", layerId="LayerName"
    - To hide Site layer: Use layerControl tool with action="hide", layerId="Site"

    Always provide an explanation of what you're doing and set success to true if the request can be fulfilled.

    For layer-related commands, use exact layer names from the context: ${sceneContext.layers.map(l => l.name).join(', ')}

    IMPORTANT RULES:
    1. Use exact layer names as they appear in the context
    2. For spatial references like "main building", "building", "structure", map to appropriate layers or coordinates
    3. For "site" references, consider hiding all BIM layers (Architecture, Facade, Structural, Electrical, HVAC, Plumbing) as they represent the building site
    4. If a request cannot be fulfilled, set success: false and explain why
    5. Always provide helpful explanations of your actions
    6. Consider the current camera position and layer states when planning actions
          `
        ],
        ["user", "{input}"],
        ["assistant", "{agent_scratchpad}"]
      ]);

  const tools = [
    createLayerControlTool(contextManager),
  ];
  
  console.log('🔍 [GeoCopilotAgent] Created tools:', tools.map(t => t.name));

  const agent = await createToolCallingAgent({
    llm: model,
    tools,
    prompt,
  });
  
  console.log('🔍 [GeoCopilotAgent] Created agent with tools');

  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    maxIterations: 3, // restrict the number of iterations to avoid infinite loops
  });

  try {
    console.log('🔍 [GeoCopilotAgent] Invoking executor with input:', input);
    
    const result = await executor.invoke({ 
      input,
      // pass the scene context as an additional input
      sceneContext: JSON.stringify(sceneContext)
    });

    console.log("🔍 [GeoCopilotAgent] Agent result:", result);

    // parse the AI response
    console.log('🔍 [GeoCopilotAgent] Parsing agent response:', result.output);
    const parsedResponse = parseAgentResponse(result.output);
    console.log('🔍 [GeoCopilotAgent] Parsed response:', parsedResponse);
    
    const response = {
      commands: parsedResponse.commands || [],
      explanation: parsedResponse.explanation || "Command executed",
      success: true
    };
    
    console.log('🔍 [GeoCopilotAgent] Returning response:', response);
    return response;

  } catch (error) {
    console.error("🔍 [GeoCopilotAgent] Agent execution error:", error);
    const errorResponse = {
      commands: [],
      explanation: `Error executing command: ${(error as Error).message}`,
      success: false
    };
    console.log('🔍 [GeoCopilotAgent] Returning error response:', errorResponse);
    return errorResponse;
  }
};

// build the prompt for the scene description
function buildScenePrompt(context: SceneContext): string {
  const { location, camera, layers, selectedFeatures, environment } = context;
  
  let prompt = `
SCENE LOCATION: ${location.name}
- Coordinates: (${location.coordinates[0].toFixed(6)}, ${location.coordinates[1].toFixed(6)})
- Height: ${location.coordinates[2].toFixed(2)}m

CAMERA STATUS:
- Position: (${camera.position[0].toFixed(6)}, ${camera.position[1].toFixed(6)}, ${camera.position[2].toFixed(2)}m)
- Heading: ${(camera.orientation.heading * 180 / Math.PI).toFixed(1)}°
- Pitch: ${(camera.orientation.pitch * 180 / Math.PI).toFixed(1)}°
- View Distance: ${camera.viewDistance.toFixed(2)}m

AVAILABLE LAYERS:
`;

  layers.forEach(layer => {
    prompt += `- ${layer.name} (${layer.type}): ${layer.visible ? 'VISIBLE' : 'HIDDEN'}\n`;
  });

  if (selectedFeatures.length > 0) {
    prompt += `\nSELECTED FEATURES: ${selectedFeatures.length} items selected\n`;
  }

  prompt += `
ENVIRONMENT:
- Time: ${new Date(environment.time).toLocaleString()}
- Lighting: ${environment.lighting}
- Shadows: ${environment.shadows ? 'enabled' : 'disabled'}

LAYER DETAILS:
`;

  layers.forEach(layer => {
    prompt += `- ${layer.name}: Asset ID ${layer.assetId}, ${layer.description}\n`;
  });

  return prompt;
}

// parse the AI agent response
function parseAgentResponse(output: string): Partial<AgentResponse> {
  console.log('🔍 [GeoCopilotAgent] parseAgentResponse called with output:', output);
  
  try {
    // try to parse the JSON directly
    console.log('🔍 [GeoCopilotAgent] Attempting direct JSON parse');
    const parsed = JSON.parse(output);
    console.log('🔍 [GeoCopilotAgent] Direct JSON parse successful:', parsed);
    
    // Commands should already be in our expected format
    const commands = parsed.commands || [];
    console.log('🔍 [GeoCopilotAgent] Commands from AI:', commands);
    
    const result = {
      commands: commands,
      explanation: parsed.explanation || "Command executed",
      success: parsed.success !== false
    };
    console.log('🔍 [GeoCopilotAgent] Returning converted result:', result);
    return result;
  } catch (parseError) {
    console.warn("🔍 [GeoCopilotAgent] Failed to parse JSON response, attempting text extraction:", output);
    console.warn("🔍 [GeoCopilotAgent] Parse error:", parseError);
    
    // try to extract the JSON block from the text
    const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/) || output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      console.log('🔍 [GeoCopilotAgent] Found JSON match:', jsonMatch[0]);
      try {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        console.log('🔍 [GeoCopilotAgent] Extracted JSON parse successful:', parsed);
        
        // Commands should already be in our expected format
        const commands = parsed.commands || [];
        
        const result = {
          commands: commands,
          explanation: parsed.explanation || "Command extracted from text",
          success: parsed.success !== false
        };
        console.log('🔍 [GeoCopilotAgent] Returning extracted result:', result);
        return result;
      } catch (e) {
        console.error("🔍 [GeoCopilotAgent] Failed to parse extracted JSON:", e);
      }
    }

    // final fallback: generate simple commands based on keywords
    console.log('🔍 [GeoCopilotAgent] Using fallback command extraction');
    const fallbackResult = fallbackCommandExtraction(output);
    console.log('🔍 [GeoCopilotAgent] Fallback result:', fallbackResult);
    return fallbackResult;
  }
}

// fallback command extraction function
function fallbackCommandExtraction(text: string): Partial<AgentResponse> {
  const commands: GeoCopilotCommand[] = [];
  const lowerText = text.toLowerCase();

  console.log('🔍 [GeoCopilotAgent] Fallback extraction analyzing text:', lowerText);

  // // simple keyword matching for layer operations
  // if (lowerText.includes('hide') && lowerText.includes('all')) {
  //   console.log('🔍 [GeoCopilotAgent] Detected hide all layers command');
  //   commands.push({ action: 'hideAll' });
  // } else if (lowerText.includes('show') && lowerText.includes('all')) {
  //   console.log('🔍 [GeoCopilotAgent] Detected show all layers command');
  //   commands.push({ action: 'showAll' });
  // } else if (lowerText.includes('hide') && lowerText.includes('layer')) {
  //   console.log('🔍 [GeoCopilotAgent] Detected hide layer command');
  //   // Try to extract layer name from context
  //   commands.push({ action: 'hideLayer', target: 'Architecture' }); // Default fallback
  // } else if (lowerText.includes('show') && lowerText.includes('layer')) {
  //   console.log('🔍 [GeoCopilotAgent] Detected show layer command');
  //   commands.push({ action: 'showLayer', target: 'Architecture' }); // Default fallback
  // } else if (lowerText.includes('hide') && lowerText.includes('site')) {
  //   console.log('🔍 [GeoCopilotAgent] Detected hide site layer command');
  //   commands.push({ action: 'hideLayer', target: 'Site' });
  // } else if (lowerText.includes('show') && lowerText.includes('site')) {
  //   console.log('🔍 [GeoCopilotAgent] Detected show site layer command');
  //   commands.push({ action: 'showLayer', target: 'Site' });
  // } else if (lowerText.includes('hide') && lowerText.includes('structural')) {
  //   console.log('🔍 [GeoCopilotAgent] Detected hide structural layer command');
  //   commands.push({ action: 'hideLayer', target: 'Structural' });
  // } else if (lowerText.includes('show') && lowerText.includes('structural')) {
  //   console.log('🔍 [GeoCopilotAgent] Detected show structural layer command');
  //   commands.push({ action: 'showLayer', target: 'Structural' });
  // } else if (lowerText.includes('hide') && lowerText.includes('architecture')) {
  //   console.log('🔍 [GeoCopilotAgent] Detected hide architecture layer command');
  //   commands.push({ action: 'hideLayer', target: 'Architecture' });
  // } else if (lowerText.includes('show') && lowerText.includes('architecture')) {
  //   console.log('🔍 [GeoCopilotAgent] Detected show architecture layer command');
  //   commands.push({ action: 'showLayer', target: 'Architecture' });
  // }

  // simple keyword matching for fly operations
  if (lowerText.includes('fly') || lowerText.includes('goto') || lowerText.includes('move')) {
    if (lowerText.includes('building')) {
      commands.push({ action: 'flyTo', target: 'main_building' });
    }
  }

  console.log('🔍 [GeoCopilotAgent] Fallback extracted commands:', commands);

  return {
    commands,
    explanation: "Commands extracted using fallback parsing",
    success: commands.length > 0
  };
}

// enhanced version of the example
export const runEnhancedAgent = async (
  input: string,
  sceneContext: SceneContext,
  contextManager: SceneContextManager
): Promise<AgentResponse> => {
  console.log('🔍 [GeoCopilotAgent] Starting runEnhancedAgent with input:', input);
  
  // run the agent
  const result = await runLocalAgent(input, sceneContext, contextManager);
  console.log('🔍 [GeoCopilotAgent] runLocalAgent result:', result);
  
  // post-process the commands to ensure they are applicable to the current scene
  const validatedCommands = validateCommands(result.commands, sceneContext);
  console.log('🔍 [GeoCopilotAgent] Validated commands:', validatedCommands);
  
  const enhancedResponse = {
    ...result,
    commands: validatedCommands
  };
  
  console.log('🔍 [GeoCopilotAgent] Enhanced response:', enhancedResponse);
  return enhancedResponse;
};

// validate the commands to ensure they are applicable to the current scene
function validateCommands(commands: GeoCopilotCommand[], context: SceneContext): GeoCopilotCommand[] {
  console.log('🔍 [GeoCopilotAgent] Validating commands:', commands);
  console.log('🔍 [GeoCopilotAgent] Available layers:', context.layers.map(l => l.name));
  
  const validatedCommands = commands.filter(command => {
    console.log('🔍 [GeoCopilotAgent] Validating command:', command);
    
    // validate the layer commands
    if (['showLayer', 'hideLayer', 'toggleLayer'].includes(command.action)) {
      const layerExists = context.layers.some(layer => layer.name === command.target);
      if (!layerExists) {
        console.warn(`🔍 [GeoCopilotAgent] Layer "${command.target}" not found in scene`);
        return false;
      }
      console.log('🔍 [GeoCopilotAgent] Layer command validated:', command);
    }
    
    // can add more validation logic
    return true;
  });
  
  console.log('🔍 [GeoCopilotAgent] Validation result:', validatedCommands);
  return validatedCommands;
}