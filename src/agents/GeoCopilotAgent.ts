import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { flyToTool } from "../tools/flyToTool";
import { highlightTool } from "../tools/highlight";
import { layerControlTool } from "../tools/layerControl";
import { cameraControlTool } from "../tools/cameraControl";
import { measurementTool } from "../tools/measurementTool";
import type { SceneContext } from "../hooks/useSceneContext";

// 扩展的命令接口
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
  sceneContext: SceneContext
): Promise<AgentResponse> => {
  const model = new ChatOpenAI({
    temperature: 0,
    modelName: "gpt-4",
    openAIApiKey: import.meta.env.VITE_OPENAI_API_KEY
  });

  // 构建动态的场景信息prompt
  const sceneInfo = buildScenePrompt(sceneContext);

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are an AI assistant for controlling a 3D BIM (Building Information Modeling) digital twin scene using natural language commands.

CURRENT SCENE CONTEXT:
${sceneInfo}

AVAILABLE ACTIONS:
1. Camera Control:
   - flyTo(target): Move camera to specific location or entity
   - setView(heading, pitch, roll): Set camera orientation
   - zoomTo(distance): Set camera height/distance
   - reset(): Reset to default view

2. Layer Management:
   - showLayer(layerName): Make layer visible
   - hideLayer(layerName): Make layer invisible
   - toggleLayer(layerName): Toggle layer visibility
   - showOnlyLayer(layerName): Show only specified layer, hide others

3. Feature Interaction:
   - highlight(entityId, color): Highlight entity (default: yellow)
   - select(entityId): Select entity for detailed view
   - clearSelection(): Clear all selections

4. Analysis Tools:
   - measure(type): Start measurement tool (distance, area, height)
   - query(entityId): Get entity properties and information
   - filter(criteria): Filter entities by properties

5. Environment Control:
   - setTime(isoTime): Change scene time
   - toggleShadows(): Enable/disable shadows
   - setLighting(mode): Change lighting (day/night/dawn/dusk)

RESPONSE FORMAT:
Always respond with a JSON object containing:
- commands: Array of command objects
- explanation: Brief explanation of what you're doing
- success: boolean indicating if the request can be fulfilled

Example responses:
{
  "commands": [
    { "action": "flyTo", "target": "main_building" },
    { "action": "highlight", "target": "Architecture", "color": "blue" }
  ],
  "explanation": "Flying to the main building and highlighting the architecture layer",
  "success": true
}

For layer-related commands, use exact layer names from the context: ${sceneContext.layers.map(l => l.name).join(', ')}

IMPORTANT RULES:
1. Use exact layer names as they appear in the context
2. For spatial references like "main building", "building", "structure", map to appropriate layers or coordinates
3. If a request cannot be fulfilled, set success: false and explain why
4. Always provide helpful explanations of your actions
5. Consider the current camera position and layer states when planning actions
      `
    ],
    ["user", "{input}"],
    ["assistant", "{agent_scratchpad}"]
  ]);

  // 创建工具集合
  const tools = [
    flyToTool,
    highlightTool,
    layerControlTool,
    cameraControlTool,
    measurementTool
  ];

  const agent = await createToolCallingAgent({
    llm: model,
    tools,
    prompt,
  });

  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    maxIterations: 3, // restrict the number of iterations to avoid infinite loops
  });

  try {
    const result = await executor.invoke({ 
      input,
      // pass the scene context as an additional input
      sceneContext: JSON.stringify(sceneContext)
    });

    console.log("Agent result:", result);

    // parse the AI response
    const parsedResponse = parseAgentResponse(result.output);
    
    return {
      commands: parsedResponse.commands || [],
      explanation: parsedResponse.explanation || "Command executed",
      success: true
    };

  } catch (error) {
    console.error("Agent execution error:", error);
    return {
      commands: [],
      explanation: `Error executing command: ${(error as Error).message}`,
      success: false
    };
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
  try {
    // try to parse the JSON directly
    const parsed = JSON.parse(output);
    return {
      commands: parsed.commands || [],
      explanation: parsed.explanation || "Command executed",
      success: parsed.success !== false
    };
  } catch {
    // if not a valid JSON, try to extract commands from the text
    console.warn("Failed to parse JSON response, attempting text extraction:", output);
    
    // try to extract the JSON block from the text
    const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/) || output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return {
          commands: parsed.commands || [],
          explanation: parsed.explanation || "Command extracted from text",
          success: parsed.success !== false
        };
      } catch (e) {
        console.error("Failed to parse extracted JSON:", e);
      }
    }

    // final fallback: generate simple commands based on keywords
    return fallbackCommandExtraction(output);
  }
}

// fallback command extraction function
function fallbackCommandExtraction(text: string): Partial<AgentResponse> {
  const commands: GeoCopilotCommand[] = [];
  const lowerText = text.toLowerCase();

  // simple keyword matching
  if (lowerText.includes('fly') || lowerText.includes('goto') || lowerText.includes('move')) {
    if (lowerText.includes('building')) {
      commands.push({ action: 'flyTo', target: 'main_building' });
    }
  }

  if (lowerText.includes('hide') || lowerText.includes('show')) {
    if (lowerText.includes('structural')) {
      commands.push({ action: lowerText.includes('hide') ? 'hideLayer' : 'showLayer', target: 'Structural' });
    }
  }

  return {
    commands,
    explanation: "Commands extracted using fallback parsing",
    success: commands.length > 0
  };
}

// extended tool function example
export const createEnhancedTools = () => {
  // these tools can access the scene context to make more intelligent decisions
  return [
    // tools that can dynamically adjust their behavior based on the current scene state
    flyToTool,
    highlightTool,
    layerControlTool,
    cameraControlTool,
    measurementTool
  ];
};

// preprocess the user input, add context understanding
export const preprocessUserInput = (input: string): string => {
  // process relative location references
  const processedInput = input
    .replace(/建筑|building/gi, 'main building')
    .replace(/结构|structural/gi, 'Structural layer')
    .replace(/立面|facade/gi, 'Facade layer')
    .replace(/电气|electrical/gi, 'Electrical layer')
    .replace(/暖通|hvac/gi, 'HVAC layer')
    .replace(/管道|plumbing/gi, 'Plumbing layer');

  return processedInput;
};

// enhanced version of the example
export const runEnhancedAgent = async (
  input: string,
  sceneContext: SceneContext
): Promise<AgentResponse> => {
  // preprocess the user input
  const processedInput = preprocessUserInput(input);
  
  // run the agent
  const result = await runLocalAgent(processedInput, sceneContext);
  
  // post-process the commands to ensure they are applicable to the current scene
  const validatedCommands = validateCommands(result.commands, sceneContext);
  
  return {
    ...result,
    commands: validatedCommands
  };
};

// validate the commands to ensure they are applicable to the current scene
function validateCommands(commands: GeoCopilotCommand[], context: SceneContext): GeoCopilotCommand[] {
  return commands.filter(command => {
    // validate the layer commands
    if (['showLayer', 'hideLayer', 'toggleLayer'].includes(command.action)) {
      const layerExists = context.layers.some(layer => layer.name === command.target);
      if (!layerExists) {
        console.warn(`Layer "${command.target}" not found in scene`);
        return false;
      }
    }
    
    // can add more validation logic
    return true;
  });
}