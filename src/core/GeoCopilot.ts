import { IntentParser, type Intent, type ParsedIntent } from './IntentParser';
import { EntityRegistry, type EntityMetadata } from './EntityRegistry';
import { EntityMatcher } from './EntityMatcher';
import { ValidationLayer, type ValidationResult, type ValidationContext } from './ValidationLayer';
import { ContextManager } from './ContextManager';
import type { OpenAI } from 'openai';
import type {
  ChatCompletionUserMessageParam,
  ChatCompletionAssistantMessageParam,
} from 'openai/resources/chat/completions';
import { ClarificationAgent, ExecutionAgent, QueryAgent, IntentAgent } from './GeoCopilotAgents';
// add tool system interface
export interface CoreTool {
  name: string;
  description: string;
  execute: (params: Record<string, unknown>) => Promise<string>;
  schema?: Record<string, unknown>;
}

export interface GeoCopilotConfig {
  confidenceThreshold?: number;
  maxResults?: number;
  enableValidation?: boolean;
  enableSuggestions?: boolean;
  enableHistory?: boolean;
  enableAI?: boolean;
  openaiApiKey?: string;
  plugins?: GeoCopilotPlugin[];
  middleware?: GeoCopilotMiddleware[];
}

export interface GeoCopilotPlugin {
  name: string;
  version: string;
  initialize: (geoCopilot: GeoCopilot) => void;
  execute?: (command: string, context: Record<string, unknown>) => Promise<string | undefined>;
  cleanup?: () => void;
}

export interface GeoCopilotMiddleware {
  name: string;
  before?: (input: string, context: string) => Promise<string>;
  after?: (result: ExecutionResult, context: string) => Promise<ExecutionResult>;
  error?: (error: Error, context: string) => Promise<void>;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  intent?: Intent;
  entities?: EntityMetadata[];
  validation?: ValidationResult;
  executionTime: number;
  suggestions?: string[];
  metadata?: Record<string, unknown>;
  clarificationQuestions?: string[]; 
}

export interface StreamStep {
  type: 'parsing' | 'matching' | 'validation' | 'execution' | 'complete';
  message: string;
  progress: number;
  data?: unknown;
}

export class GeoCopilot {
  private intentParser: IntentParser;
  private entityRegistry: EntityRegistry;
  private entityMatcher: EntityMatcher;
  private validationLayer: ValidationLayer;
  private contextManager: ContextManager;
  private plugins: Map<string, GeoCopilotPlugin> = new Map();
  private middleware: GeoCopilotMiddleware[] = [];
  private tools: Map<string, CoreTool> = new Map();
  private config: GeoCopilotConfig;
  private isInitialized = false;
  private openaiClient: OpenAI | null = null;
  private dialogHistory: (ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam)[] = [];
  private clarificationAgent: ClarificationAgent | null = null;
  private executionAgent: ExecutionAgent | null = null;
  private queryAgent: QueryAgent | null = null;
  private intentAgent: IntentAgent | null = null;

  constructor(config: GeoCopilotConfig = {}) {
    this.config = {
      confidenceThreshold: 0.7,
      maxResults: 10,
      enableValidation: true,
      enableSuggestions: true,
      enableHistory: true,
      enableAI: true,
      plugins: [],
      middleware: [],
      ...config
    };

    this.intentParser = new IntentParser();
    this.entityRegistry = new EntityRegistry();
    this.entityMatcher = new EntityMatcher(this.entityRegistry);
    this.contextManager = new ContextManager({
      confidenceThreshold: this.config.confidenceThreshold,
      maxResults: this.config.maxResults,
      autoSuggestions: this.config.enableSuggestions
    });

    // Initialize validation layer with default context
    const validationContext: ValidationContext = {
      availableEntities: [],
      currentScene: {
        bounds: { north: 0, south: 0, east: 0, west: 0 },
        camera: { position: [0, 0, 0], orientation: { heading: 0, pitch: 0, roll: 0 } }
      },
      userPermissions: ['layer_control', 'camera_control'],
      systemCapabilities: ['layer_management', 'camera_control']
    };
    this.validationLayer = new ValidationLayer(validationContext);

    // Initialize plugins and middleware
    this.initializePlugins();
    this.initializeMiddleware();
    this.queryAgent = null;
    this.intentAgent = null;
  }

  // add tool registration method
  public registerTool(name: string, tool: CoreTool): void {
    this.tools.set(name, tool);
  }

  public unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  public getTool(name: string): CoreTool | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): CoreTool[] {
    return Array.from(this.tools.values());
  }

  // add AI execution method
  public async executeWithAI(input: string): Promise<ExecutionResult> {
    if (!this.config.enableAI || !this.config.openaiApiKey) {
      // fallback to local execution
      return this.execute(input);
    }
    try {
      // Initialize OpenAI client if needed
      if (!this.openaiClient) {
        this.openaiClient = await this.initializeOpenAIClient();
      }
      // Initialize agents with shared contextManager and dialogHistory
      const toolsDescription = this.buildToolsDescription();
      const systemPrompt = this.buildSystemPrompt(toolsDescription);
      if (!this.clarificationAgent) {
        this.clarificationAgent = new ClarificationAgent(this.openaiClient, systemPrompt, this.contextManager, this.dialogHistory);
      }
      if (!this.executionAgent) {
        this.executionAgent = new ExecutionAgent(this.openaiClient, systemPrompt, this, this.contextManager, this.dialogHistory);
      }
      if (!this.queryAgent) {
        this.queryAgent = new QueryAgent(this.openaiClient, systemPrompt, this.contextManager, this.entityRegistry, this.dialogHistory);
      }
      if (!this.intentAgent) {
        this.intentAgent = new IntentAgent(this.openaiClient, systemPrompt, this.contextManager, this.dialogHistory);
      }
      // Use IntentAgent to classify the user intent
      const intentResult = await this.intentAgent.run(input);
      console.log('IntentAgent result:', intentResult);
      if (intentResult.type === 'clarify' || intentResult.confidence < 0.9) {
        const clarifyResult = await this.clarificationAgent.run(input);
        console.log('ClarificationAgent result:', clarifyResult);
        return {
          success: false,
          output: 'need clarification',
          ...clarifyResult,
          executionTime: 0
        };
      } else if (intentResult.type === 'query') {
        const queryResult = await this.queryAgent.run(input);
        console.log('QueryAgent input:', input);
        console.log('QueryAgent result:', queryResult);
        return { ...queryResult, executionTime: 0 };
      } else if (intentResult.type === 'execute') {
        return await this.executionAgent.run(input);
      } else {
        // fallback to execution agent
        return await this.executionAgent.run(input);
      }
    } catch (error) {
      console.warn('AI execution failed, falling back to local execution:', error);
      return this.execute(input);
    }
    // Ensure a return value for all code paths
    return { success: false, output: 'Unknown error', executionTime: 0 };
  }

 
  private async initializeOpenAIClient(): Promise<OpenAI> {

    const { OpenAI } = await import('openai');
    return new OpenAI({
      apiKey: this.config.openaiApiKey,
      dangerouslyAllowBrowser: true
    });
  }

  public buildToolsDescription(): string {
    const tools = this.getAllTools();
    console.log('Available tools:', tools.map(t => t.name));
    return tools.map(tool => 
      `- ${tool.name}: ${tool.description}`
    ).join('\n');
  }

  public buildSystemPrompt(toolsDescription: string): string {
    return `You are an AI assistant for controlling a 3D BIM digital twin scene.

Available tools:
${toolsDescription}

Current context:
${this.contextManager.getContextForAI()}

EXECUTION RULES:
1. ALWAYS use the available tools to execute commands. Do not say you cannot do something.
2. For layer commands, use the layerControl tool with the appropriate action
3. For camera commands, use the cameraControl tool with the appropriate action
4. Format tool calls exactly as: toolName: {"action": "actionName", "param1": "value1"}
5. Common actions:
   - layerControl: showAll, hideAll, show, hide, showOnly, setOpacity
   - cameraControl: flyTo, zoom, rotate, resetView

EXAMPLES:
- "show all layers" → layerControl: {"action": "showAll"}
- "hide building layer" → layerControl: {"action": "hide", "layerId": "building"}
- "fly to Auckland" → cameraControl: {"action": "flyTo", "longitude": 174.7633, "latitude": -36.8485, "height": 1000}
- "zoom in" → cameraControl: {"action": "zoom", "factor": 0.5}

IMPORTANT: Always use tools, never say you cannot do something.`;
  }

  public async parseAndExecuteAIResponse(aiResponse: string): Promise<ExecutionResult> {
    console.log('AI Response:', aiResponse);
    
    // simple tool call parsing (can be extended as needed)
    const toolCalls = this.extractToolCalls(aiResponse);
    console.log('Extracted tool calls:', toolCalls);
    
    if (toolCalls.length === 0) {
      // if no tool calls, return AI response
      console.log('No tool calls found, returning AI response');
      return {
        success: true,
        output: aiResponse,
        executionTime: 0
      };
    }

    // execute tool calls
    const results = [];
    for (const toolCall of toolCalls) {
      const tool = this.getTool(toolCall.name);
      if (tool) {
        try {
          console.log(`Executing tool: ${toolCall.name} with params:`, toolCall.params);
          const result = await tool.execute(toolCall.params);
          results.push(`${toolCall.name}: ${result}`);
        } catch (error) {
          results.push(`${toolCall.name}: Error - ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        console.warn(`Tool not found: ${toolCall.name}`);
      }
    }

    return {
      success: true,
      output: results.join('\n'),
      executionTime: 0
    };
  }

  private extractToolCalls(response: string): Array<{name: string, params: Record<string, unknown>}> {
    // simple tool call parsing logic
    const toolCalls = [];
    
    // parse format like "layerControl: {"action": "show", "layerId": "building"}"
    const toolCallRegex = /(\w+):\s*(\{[^}]+\})/g;
    let match;
    
    while ((match = toolCallRegex.exec(response)) !== null) {
      const toolName = match[1];
      const paramsStr = match[2];
      
      try {
        const params = JSON.parse(paramsStr);
        toolCalls.push({ name: toolName, params });
      } catch (error) {
        console.warn('Failed to parse tool call params:', paramsStr, error);
      }
    }
    
    return toolCalls;
  }

  // Core execution method
  public async execute(input: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    const context = this.contextManager.getContextForAI();

    try {
      // Apply middleware before processing
      let processedInput = input;
      for (const mw of this.middleware) {
        if (mw.before) {
          processedInput = await mw.before(processedInput, context);
        }
      }

      // 1. Parse intent
      const parsedIntent = this.intentParser.parse(processedInput);
      
      // 2. Match entities
      const entities = await this.matchEntities(processedInput, parsedIntent);
      
      // 3. Validate command
      let validation: ValidationResult | undefined;
      if (this.config.enableValidation) {
        validation = this.validationLayer.validateIntent(parsedIntent.primaryIntent);
      }

      // 4. Execute command
      const executionResult = await this.executeCommand(parsedIntent, entities, validation);

      // 5. Generate suggestions
      const suggestions = this.config.enableSuggestions ? 
        this.contextManager.getSuggestions() : undefined;

      // 6. Record dialog turn
      if (this.config.enableHistory) {
        this.contextManager.addDialogTurn({
          userInput: input,
          intent: parsedIntent.primaryIntent,
          entities,
          response: executionResult.output,
          success: executionResult.success,
          executionTime: Date.now() - startTime,
          metadata: { validation, suggestions }
        });
      }

      // Apply middleware after processing
      let finalResult = executionResult;
      for (const mw of this.middleware) {
        if (mw.after) {
          finalResult = await mw.after(finalResult, context);
        }
      }

      return {
        ...finalResult,
        intent: parsedIntent.primaryIntent,
        entities,
        validation,
        suggestions,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      // Handle errors through middleware
      for (const mw of this.middleware) {
        if (mw.error) {
          await mw.error(error as Error, context);
        }
      }

      return {
        success: false,
        output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTime: Date.now() - startTime
      };
    }
  }

  // Stream execution for complex commands
  public async *executeStream(input: string): AsyncGenerator<StreamStep> {
    const totalSteps = 4;
    let currentStep = 0;

    try {
      // Step 1: Parsing
      yield { type: 'parsing', message: 'Parsing user intent...', progress: ++currentStep / totalSteps };
      const parsedIntent = this.intentParser.parse(input);
      
      // Step 2: Entity matching
      yield { type: 'matching', message: 'Matching entities...', progress: ++currentStep / totalSteps };
      const entities = await this.matchEntities(input, parsedIntent);
      
      // Step 3: Validation
      yield { type: 'validation', message: 'Validating command...', progress: ++currentStep / totalSteps };
      const validation = this.config.enableValidation ? 
        this.validationLayer.validateIntent(parsedIntent.primaryIntent) : undefined;
      
      // Step 4: Execution
      yield { type: 'execution', message: 'Executing command...', progress: ++currentStep / totalSteps };
      const result = await this.executeCommand(parsedIntent, entities, validation);
      
      // Step 5: Complete
      yield { 
        type: 'complete', 
        message: 'Command completed', 
        progress: 1.0,
        data: result 
      };

    } catch (error) {
      yield { 
        type: 'complete', 
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        progress: 1.0,
        data: { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  // Entity matching with multiple strategies
  private async matchEntities(input: string, parsedIntent: ParsedIntent): Promise<EntityMetadata[]> {
    const entities: EntityMetadata[] = [];
    
    // Extract entity references from intent parameters
    const entityReferences = this.extractEntityReferences(parsedIntent);
    
    for (const reference of entityReferences) {
      const matches = this.entityMatcher.match(reference, {
        fuzzyThreshold: this.config.confidenceThreshold,
        includeSynonyms: true,
        includeSpatial: true,
        includeSemantic: true,
        maxResults: this.config.maxResults
      });

      // Add unique entities
      for (const match of matches) {
        if (!entities.find(e => e.id === match.entity.id)) {
          entities.push(match.entity);
        }
      }
    }

    return entities;
  }

  private extractEntityReferences(parsedIntent: ParsedIntent): string[] {
    const references: string[] = [];
    
    // Extract from primary intent
    if (parsedIntent.primaryIntent.parameters.layerNames) {
      references.push(...parsedIntent.primaryIntent.parameters.layerNames as string[]);
    }
    if (parsedIntent.primaryIntent.parameters.layerName) {
      references.push(parsedIntent.primaryIntent.parameters.layerName as string);
    }
    if (parsedIntent.primaryIntent.parameters.target) {
      references.push(parsedIntent.primaryIntent.parameters.target as string);
    }

    // Extract from secondary intents
    for (const intent of parsedIntent.secondaryIntents) {
      if (intent.parameters.layerNames) {
        references.push(...intent.parameters.layerNames as string[]);
      }
      if (intent.parameters.layerName) {
        references.push(intent.parameters.layerName as string);
      }
      if (intent.parameters.target) {
        references.push(intent.parameters.target as string);
      }
    }

    return [...new Set(references)]; // Remove duplicates
  }

  // Command execution with plugin support
  private async executeCommand(parsedIntent: ParsedIntent, entities: EntityMetadata[], validation?: ValidationResult): Promise<ExecutionResult> {
    // Check validation first
    if (validation && !validation.isValid) {
      return {
        success: false,
        output: `Validation failed: ${validation.errors.join(', ')}. ${validation.suggestions.join(' ')}`,
        executionTime: 0
      };
    }

    // Try plugin execution first
    for (const plugin of this.plugins.values()) {
      if (plugin.execute) {
        try {
          const result = await plugin.execute(parsedIntent.primaryIntent.type, {
            intent: parsedIntent,
            entities,
            validation,
            context: this.contextManager.getContextForAI()
          });
          
          if (result) {
            return { success: true, output: result, executionTime: 0 };
          }
        } catch (error) {
          console.warn(`Plugin ${plugin.name} execution failed:`, error);
        }
      }
    }

    // Try tool execution
    const toolResult = await this.executeWithTools(parsedIntent, entities);
    if (toolResult) {
      return toolResult;
    }

    // Fallback to default execution logic
    return this.executeDefaultCommand(parsedIntent, entities);
  }

  private async executeWithTools(parsedIntent: ParsedIntent, entities: EntityMetadata[]): Promise<ExecutionResult | null> {
    const intent = parsedIntent.primaryIntent;
    
    // select appropriate tool based on intent type
    switch (intent.type) {
      case 'layer_show':
      case 'layer_hide':
      case 'layer_show_only':
        return await this.executeLayerTool(intent, entities);
      case 'camera_fly':
      case 'camera_zoom':
      case 'camera_rotate':
        return await this.executeCameraTool(intent, entities);
      default:
        return null; // let default execution logic handle it
    }
  }

  private async executeLayerTool(intent: Intent, entities: EntityMetadata[]): Promise<ExecutionResult | null> {
    const layerTool = this.getTool('layerControl');
    if (!layerTool) return null;

    const params: Record<string, unknown> = {};
    
    switch (intent.type) {
      case 'layer_show':
        if (entities.length === 0) {
          params.action = 'showAll';
        } else {
          params.action = 'show';
          params.layerIds = entities.map(e => e.id);
        }
        break;
      case 'layer_hide':
        if (entities.length === 0) {
          params.action = 'hideAll';
        } else {
          params.action = 'hide';
          params.layerIds = entities.map(e => e.id);
        }
        break;
      case 'layer_show_only':
        params.action = 'showOnly';
        params.layerIds = entities.map(e => e.id);
        break;
    }

    try {
      const result = await layerTool.execute(params);
      return { success: true, output: result, executionTime: 0 };
    } catch (error) {
      return { 
        success: false, 
        output: `Layer operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        executionTime: 0 
      };
    }
  }

  private async executeCameraTool(intent: Intent, entities: EntityMetadata[]): Promise<ExecutionResult | null> {
    const cameraTool = this.getTool('cameraControl');
    if (!cameraTool) return null;

    const params: Record<string, unknown> = {};
    
    switch (intent.type) {
      case 'camera_fly':
        if (entities.length > 0) {
          const entity = entities[0];
          params.action = 'flyTo';
          params.longitude = entity.spatial?.center?.longitude || 0;
          params.latitude = entity.spatial?.center?.latitude || 0;
          params.height = (entity.spatial?.center?.height || 0) + 100;
        }
        break;
      case 'camera_zoom':
        params.action = 'zoom';
        params.factor = intent.parameters.direction === 'in' ? 0.5 : 2.0;
        break;
      case 'camera_rotate':
        params.action = 'rotate';
        params.heading = intent.parameters.direction === 'left' ? -90 : 90;
        break;
    }

    try {
      const result = await cameraTool.execute(params);
      return { success: true, output: result, executionTime: 0 };
    } catch (error) {
      return { 
        success: false, 
        output: `Camera operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        executionTime: 0 
      };
    }
  }

  private async executeDefaultCommand(parsedIntent: ParsedIntent, entities: EntityMetadata[]): Promise<ExecutionResult> {
    const intent = parsedIntent.primaryIntent;
    
    switch (intent.type) {
      case 'layer_show':
        return this.executeLayerShow(intent, entities);
      case 'layer_hide':
        return this.executeLayerHide(intent, entities);
      case 'layer_show_only':
        return this.executeLayerShowOnly(intent, entities);
      case 'camera_fly':
        return this.executeCameraFly(intent, entities);
      case 'camera_zoom':
        return this.executeCameraZoom(intent);
      case 'camera_rotate':
        return this.executeCameraRotate(intent);
      default:
        return {
          success: false,
          output: `Unknown command type: ${intent.type}. Try using standard commands like 'show layers' or 'fly to'`,
          executionTime: 0
        };
    }
  }

  // Helper method to create execution results
  private createExecutionResult(success: boolean, output: string, executionTime: number = 0): ExecutionResult {
    return { success, output, executionTime };
  }

  // Default command implementations
  private async executeLayerShow(intent: Intent, entities: EntityMetadata[]): Promise<ExecutionResult> {
    const layerNames = intent.parameters.layerNames as string[] || [];
    
    if (layerNames.length === 0) {
      // show all layers
      this.contextManager.updateSceneState({ activeLayers: this.entityRegistry.getAll().map(e => e.id) });
      return this.createExecutionResult(true, 'All layers are now visible');
    } else {
      // show specific layers
      const layerIds = entities.map(e => e.id);
      this.contextManager.updateActiveLayers(layerIds);
      return this.createExecutionResult(true, `Showing layers: ${layerNames.join(', ')}`);
    }
  }

  private async executeLayerHide(intent: Intent, entities: EntityMetadata[]): Promise<ExecutionResult> {
    const layerNames = intent.parameters.layerNames as string[] || [];
    
    if (layerNames.length === 0) {
      // Hide all layers
      this.contextManager.updateSceneState({ activeLayers: [] });
      return this.createExecutionResult(true, 'All layers are now hidden');
    } else {
      // Hide specific layers
      const currentLayers = this.contextManager.getSceneState().activeLayers;
      const layerIds = entities.map(e => e.id);
      const remainingLayers = currentLayers.filter(id => !layerIds.includes(id));
      this.contextManager.updateActiveLayers(remainingLayers);
      return this.createExecutionResult(true, `Hiding layers: ${layerNames.join(', ')}`);
    }
  }

  private async executeLayerShowOnly(intent: Intent, entities: EntityMetadata[]): Promise<ExecutionResult> {
    const layerNames = intent.parameters.layerNames as string[] || [];
    const layerIds = entities.map(e => e.id);
    
    this.contextManager.updateActiveLayers(layerIds);
    return this.createExecutionResult(true, `Showing only: ${layerNames.join(', ')}`);
  }

  private async executeCameraFly(intent: Intent, entities: EntityMetadata[]): Promise<ExecutionResult> {
    const target = intent.parameters.target as string;
    
    if (entities.length > 0) {
      const entity = entities[0];
      const center = entity.spatial.center;
      this.contextManager.updateCameraPosition({
        longitude: center.longitude,
        latitude: center.latitude,
        height: center.height + 100 // Add some height for better view
      });
      return this.createExecutionResult(true, `Flying to ${entity.name}`);
    } else {
      return this.createExecutionResult(false, `Target "${target}" not found`);
    }
  }

  private async executeCameraZoom(intent: Intent): Promise<ExecutionResult> {
    const direction = intent.parameters.direction as string;
    const currentCamera = this.contextManager.getSceneState().cameraPosition;
    
    let newHeight = currentCamera.height;
    if (direction === 'in') {
      newHeight *= 0.5;
    } else if (direction === 'out') {
      newHeight *= 2.0;
    }
    
    this.contextManager.updateCameraPosition({ height: newHeight });
    return this.createExecutionResult(true, `Zoomed ${direction}`);
  }

  private async executeCameraRotate(intent: Intent): Promise<ExecutionResult> {
    const direction = intent.parameters.direction as string;
    const currentCamera = this.contextManager.getSceneState().cameraPosition;
    
    let newHeading = currentCamera.heading;
    if (direction === 'left') {
      newHeading -= 90;
    } else if (direction === 'right') {
      newHeading += 90;
    }
    
    this.contextManager.updateCameraPosition({ heading: newHeading });
    return this.createExecutionResult(true, `Rotated ${direction}`);
  }

  // Plugin management
  private initializePlugins(): void {
    for (const plugin of this.config.plugins || []) {
      this.registerPlugin(plugin);
    }
  }

  public registerPlugin(plugin: GeoCopilotPlugin): void {
    this.plugins.set(plugin.name, plugin);
    plugin.initialize(this);
  }

  public unregisterPlugin(name: string): void {
    const plugin = this.plugins.get(name);
    if (plugin && plugin.cleanup) {
      plugin.cleanup();
    }
    this.plugins.delete(name);
  }

  // Middleware management
  private initializeMiddleware(): void {
    this.middleware = this.config.middleware || [];
  }

  public addMiddleware(middleware: GeoCopilotMiddleware): void {
    this.middleware.push(middleware);
  }

  public removeMiddleware(name: string): void {
    this.middleware = this.middleware.filter(mw => mw.name !== name);
  }

  // Public API methods
  public getIntentParser(): IntentParser {
    return this.intentParser;
  }

  public getEntityRegistry(): EntityRegistry {
    return this.entityRegistry;
  }

  public getEntityMatcher(): EntityMatcher {
    return this.entityMatcher;
  }

  public getValidationLayer(): ValidationLayer {
    return this.validationLayer;
  }

  public getContextManager(): ContextManager {
    return this.contextManager;
  }

  public getConfig(): GeoCopilotConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<GeoCopilotConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Update related components
    if (updates.confidenceThreshold !== undefined) {
      this.contextManager.setConfidenceThreshold(updates.confidenceThreshold);
      this.entityMatcher.setFuzzyThreshold(updates.confidenceThreshold);
    }
    
    if (updates.maxResults !== undefined) {
      this.contextManager.setMaxResults(updates.maxResults);
      this.entityMatcher.setMaxResults(updates.maxResults);
    }
  }

  // Utility methods
  public getStatus(): {
    initialized: boolean;
    pluginCount: number;
    middlewareCount: number;
    entityCount: number;
    sessionInfo: Record<string, unknown>;
  } {
    return {
      initialized: this.isInitialized,
      pluginCount: this.plugins.size,
      middlewareCount: this.middleware.length,
      entityCount: this.entityRegistry.getCount(),
      sessionInfo: this.contextManager.getContextSummary()
    };
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Initialize all plugins
    for (const plugin of this.plugins.values()) {
      plugin.initialize(this);
    }

    this.isInitialized = true;
  }

  public async cleanup(): Promise<void> {
    // Cleanup all plugins
    for (const plugin of this.plugins.values()) {
      if (plugin.cleanup) {
        plugin.cleanup();
      }
    }

    this.plugins.clear();
    this.middleware = [];
    this.isInitialized = false;
  }
} 