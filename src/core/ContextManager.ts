import type { Intent } from './IntentParser';
import type { EntityMetadata } from './EntityRegistry';

export interface DialogTurn {
  id: string;
  timestamp: number;
  userInput: string;
  intent?: Intent;
  entities?: EntityMetadata[];
  response: string;
  success: boolean;
  executionTime: number;
  metadata?: Record<string, unknown>;
}

export interface SceneState {
  cameraPosition: {
    longitude: number;
    latitude: number;
    height: number;
    heading: number;
    pitch: number;
    roll: number;
  };  
  viewMode: '3D' | '2D' | 'Columbus';
  timeOfDay: string;
  weather: string;
  filters: Record<string, unknown>;
  layerStats?: LayerStats;
  featureStats?: FeatureStats;
  sampleLayers?: Array<{
    id: string;
    name: string;
    type: string;
    visible: boolean;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  }>; // Added for AI context
  sampleFeatures?: Array<{
    elementId: number;
    properties: Record<string, unknown>;
    description?: string;
    [key: string]: unknown;
  }>; // Added for AI context
}

export interface LayerStats {
  total: number;
  visible: number;
  byType: Record<string, number>;
  names: string[];
  visibleNames: string[];
}
export interface FeatureStats {
  total: number;
  byCategory: Record<string, number>;
  byLayer: Record<string, number>;
  byType: Record<string, number>;
  spatialDistribution?: {
    bounds: { north: number; south: number; east: number; west: number };
    center: { longitude: number; latitude: number; height: number };
  };
}

export interface UserPreferences {
  language: string;
  confidenceThreshold: number;
  maxResults: number;
  autoSuggestions: boolean;
  voiceEnabled: boolean;
  theme: 'light' | 'dark' | 'auto';
  shortcuts: Record<string, string>;
}

export interface ContextData {
  currentScene: SceneState;
  dialogHistory: DialogTurn[];
  userPreferences: UserPreferences;
  sessionStartTime: number;
  lastActivityTime: number;
  commandCount: number;
  successRate: number;
  ragContext: RAGContext;
}

export interface RAGContext {
  lastQuery: string;
  lastQueryResult: string;
  relevantEquipment: string[];
  queryHistory: RAGQueryRecord[];
  equipmentFocus: string | null;
  maintenanceContext: string | null;
}

export interface RAGQueryRecord {
  timestamp: number;
  query: string;
  result: string;
  equipmentIds: string[];
  confidence: number;
}

export class ContextManager {
  private context: ContextData;
  private maxHistorySize: number = 100;
  private listeners: Array<(context: ContextData) => void> = [];

  constructor(initialPreferences?: Partial<UserPreferences>) {
    this.context = {
      currentScene: {
        cameraPosition: {
          longitude: 0,
          latitude: 0,
          height: 1000,
          heading: 0,
          pitch: -90,
          roll: 0
        },
        viewMode: '3D',
        timeOfDay: 'day',
        weather: 'clear',
        filters: {}
      },
      dialogHistory: [],
      userPreferences: {
        language: 'en',
        confidenceThreshold: 0.7,
        maxResults: 10,
        autoSuggestions: true,
        voiceEnabled: false,
        theme: 'auto',
        shortcuts: {},
        ...initialPreferences
      },
      sessionStartTime: Date.now(),
      lastActivityTime: Date.now(),
      commandCount: 0,
      successRate: 1.0,
      ragContext: {
        lastQuery: '',
        lastQueryResult: '',
        relevantEquipment: [],
        queryHistory: [],
        equipmentFocus: null,
        maintenanceContext: null
      }
    };
  }

  // Dialog History Management
  public addDialogTurn(turn: Omit<DialogTurn, 'id' | 'timestamp'>): void {
    const dialogTurn: DialogTurn = {
      ...turn,
      id: this.generateId(),
      timestamp: Date.now()
    };

    this.context.dialogHistory.push(dialogTurn);
    
    // Maintain history size
    if (this.context.dialogHistory.length > this.maxHistorySize) {
      this.context.dialogHistory.shift();
    }

    // Update session statistics
    this.context.commandCount++;
    this.context.lastActivityTime = Date.now();
    
    // Update success rate
    const recentTurns = this.context.dialogHistory.slice(-10);
    const recentSuccesses = recentTurns.filter(turn => turn.success).length;
    this.context.successRate = recentSuccesses / recentTurns.length;

    this.notifyListeners();
  }

  public getDialogHistory(limit?: number): DialogTurn[] {
    const history = this.context.dialogHistory;
    return limit ? history.slice(-limit) : history;
  }

  public getRecentTurns(count: number = 5): DialogTurn[] {
    return this.context.dialogHistory.slice(-count);
  }

  public clearDialogHistory(): void {
    this.context.dialogHistory = [];
    this.notifyListeners();
  }

  // Scene State Management
  public updateSceneState(updates: Partial<SceneState>): void {
    this.context.currentScene = { ...this.context.currentScene, ...updates };
    this.notifyListeners();
  }

  public getSceneState(): SceneState {
    return { ...this.context.currentScene };
  }

  public updateCameraPosition(position: Partial<SceneState['cameraPosition']>): void {
    this.context.currentScene.cameraPosition = {
      ...this.context.currentScene.cameraPosition,
      ...position
    };
    this.notifyListeners();
  }







  // User Preferences Management
  public updatePreferences(preferences: Partial<UserPreferences>): void {
    this.context.userPreferences = { ...this.context.userPreferences, ...preferences };
    this.notifyListeners();
  }

  public getPreferences(): UserPreferences {
    return { ...this.context.userPreferences };
  }

  public setConfidenceThreshold(threshold: number): void {
    this.context.userPreferences.confidenceThreshold = Math.max(0, Math.min(1, threshold));
    this.notifyListeners();
  }

  public setMaxResults(maxResults: number): void {
    this.context.userPreferences.maxResults = Math.max(1, maxResults);
    this.notifyListeners();
  }

  public addShortcut(command: string, shortcut: string): void {
    this.context.userPreferences.shortcuts[shortcut] = command;
    this.notifyListeners();
  }

  public removeShortcut(shortcut: string): void {
    delete this.context.userPreferences.shortcuts[shortcut];
    this.notifyListeners();
  }

  // Context Analysis
  public getContextSummary(): {
    sessionDuration: number;
    commandCount: number;
    successRate: number;
    mostUsedCommands: string[];
    recentActivity: string;
  } {
    const now = Date.now();
    const sessionDuration = now - this.context.sessionStartTime;
    const timeSinceLastActivity = now - this.context.lastActivityTime;

    // Analyze most used commands
    const commandCounts = new Map<string, number>();
    for (const turn of this.context.dialogHistory) {
      const command = turn.userInput.toLowerCase().split(' ')[0];
      commandCounts.set(command, (commandCounts.get(command) || 0) + 1);
    }

    const mostUsedCommands = Array.from(commandCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([command]) => command);

    // Determine recent activity level
    let recentActivity = 'inactive';
    if (timeSinceLastActivity < 60000) { // 1 minute
      recentActivity = 'very active';
    } else if (timeSinceLastActivity < 300000) { // 5 minutes
      recentActivity = 'active';
    } else if (timeSinceLastActivity < 900000) { // 15 minutes
      recentActivity = 'moderate';
    }

    return {
      sessionDuration,
      commandCount: this.context.commandCount,
      successRate: this.context.successRate,
      mostUsedCommands,
      recentActivity
    };
  }

  public getSuggestions(): string[] {
    const suggestions: string[] = [];
    const recentTurns = this.getRecentTurns(3);
    const sceneState = this.context.currentScene;

    // Suggest based on recent activity
    if (recentTurns.length > 0) {
      const lastTurn = recentTurns[recentTurns.length - 1];
      
      if (lastTurn.userInput.toLowerCase().includes('show')) {
        suggestions.push('Try: "hide all layers" to clear the view');
        suggestions.push('Try: "show only structural" to focus on specific layers');
      } else if (lastTurn.userInput.toLowerCase().includes('hide')) {
        suggestions.push('Try: "show all layers" to see everything');
        suggestions.push('Try: "show architecture" to reveal specific layers');
      } else if (lastTurn.userInput.toLowerCase().includes('fly')) {
        suggestions.push('Try: "zoom in" or "zoom out" to adjust view');
        suggestions.push('Try: "reset view" to return to default position');
      }
    }

    // Suggest based on current scene state and statistics
    if (sceneState.layerStats) {
      const layerStats = sceneState.layerStats;
      
      if (layerStats.visible === 0) {
        suggestions.push('Try: "show all layers" to see the scene content');
      } else if (layerStats.visible < layerStats.total / 2) {
        suggestions.push(`Try: "show more layers" (${layerStats.visible}/${layerStats.total} visible)`);
      } else if (layerStats.visible > layerStats.total * 0.8) {
        suggestions.push('Try: "hide some layers" to focus on specific content');
      }
      
      // generate suggestions based on layer types
      if (layerStats.byType) {
        const layerTypes = Object.keys(layerStats.byType);
        if (layerTypes.includes('structural') && layerTypes.includes('architectural')) {
          suggestions.push('Try: "show only structural" or "show only architectural"');
        }
      }
    }

    if (sceneState.featureStats) {
      const featureStats = sceneState.featureStats;
      
      if (featureStats.total > 1000) {
        suggestions.push('Large scene detected. Try: "focus on specific area"');
      }
      
      if (featureStats.byCategory) {
        const categories = Object.keys(featureStats.byCategory);
        if (categories.length > 3) {
          suggestions.push(`Try: "filter by category" (${categories.length} categories available)`);
        }
      }
    }

    // Suggest based on user preferences
    if (this.context.userPreferences.autoSuggestions) {
      suggestions.push('Try: "list layers" to see available options');
      suggestions.push('Try: "help" for command examples');
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  public getContextForAI(): string {
    const sceneState = this.context.currentScene;
    const recentTurns = this.getRecentTurns(5); // 增加到5轮
    const ragContext = this.context.ragContext;

    let context = `Scene: ${sceneState.viewMode} view\n`;
    
    // add layer statistics
    if (sceneState.layerStats) {
      const layerStats = sceneState.layerStats;
      context += `Layers: total=${layerStats.total}, visible=${layerStats.visible}`;
      if (layerStats.byType && Object.keys(layerStats.byType).length > 0) {
        const typeCount = Object.keys(layerStats.byType).length;
        context += `, ${typeCount} type${typeCount > 1 ? 's' : ''}`;
      }
      if (layerStats.visibleNames && layerStats.visibleNames.length > 0) {
        context += `, ${layerStats.visibleNames.length} visible layer${layerStats.visibleNames.length > 1 ? 's' : ''}`;
      }
      context += '\n';
    }
    
    // add feature statistics
    if (sceneState.featureStats) {
      const featureStats = sceneState.featureStats;
      context += `Features: total=${featureStats.total}`;
      if (featureStats.byCategory && Object.keys(featureStats.byCategory).length > 0) {
        const categoryCount = Object.keys(featureStats.byCategory).length;
        context += `, ${categoryCount} categor${categoryCount > 1 ? 'ies' : 'y'}`;
      }
      if (featureStats.byType && Object.keys(featureStats.byType).length > 0) {
        const typeCount = Object.keys(featureStats.byType).length;
        context += `, ${typeCount} type${typeCount > 1 ? 's' : ''}`;
      }
      context += '\n';
    }

    // add sample data for AI understanding
    if (sceneState.sampleLayers && sceneState.sampleLayers.length > 0) {
      context += `\n📋 Sample Layers (JSON format):\n`;
      sceneState.sampleLayers.forEach((layer, index) => {
        context += `Layer ${index + 1}: ${JSON.stringify(layer, null, 2)}\n`;
      });
    }

    if (sceneState.sampleFeatures && sceneState.sampleFeatures.length > 0) {
      context += `\n🎯 Sample Features (JSON format):\n`;
      sceneState.sampleFeatures.forEach((feature, index) => {
        context += `Feature ${index + 1}: ${JSON.stringify(feature, null, 2)}\n`;
      });
    }
    
    // add conversation memory
    if (recentTurns.length > 0) {
      context += `\n📝 Recent Conversation Memory:\n`;
      recentTurns.forEach((turn, index) => {
        context += `${index + 1}. User: "${turn.userInput}"\n`;
        context += `   Response: "${turn.response}"\n`;
        if (turn.intent) {
          context += `   Intent: ${turn.intent.type} (confidence: ${turn.intent.confidence})\n`;
        }
        if (turn.success !== undefined) {
          context += `   Success: ${turn.success ? '✅' : '❌'}\n`;
        }
        context += '\n';
      });
    }

    // add RAG context information
    if (ragContext.equipmentFocus) {
      context += `🎯 Focused Equipment: ${ragContext.equipmentFocus}\n`;
    }
    
    if (ragContext.maintenanceContext) {
      context += `🔧 Maintenance Context: ${ragContext.maintenanceContext}\n`;
    }
    
    if (ragContext.relevantEquipment.length > 0) {
      context += `📋 Relevant Equipment: ${ragContext.relevantEquipment.join(', ')}\n`;
    }

    // add recent RAG queries
    const recentQueries = this.getRecentRAGQueries(3);
    if (recentQueries.length > 0) {
      context += `\n🔍 Recent RAG Queries:\n`;
      recentQueries.forEach((query, index) => {
        context += `${index + 1}. Q: "${query.query}"\n`;
        context += `   A: "${query.result.substring(0, 100)}${query.result.length > 100 ? '...' : ''}"\n`;
        context += `   Confidence: ${query.confidence.toFixed(2)}\n\n`;
      });
    }

    // add session statistics
    const sessionDuration = Math.floor((Date.now() - this.context.sessionStartTime) / 1000 / 60);
    context += `\n📊 Session Stats: ${this.context.commandCount} commands, ${(this.context.successRate * 100).toFixed(1)}% success rate, ${sessionDuration}min duration\n`;

    return context;
  }

  public updateRAGContext(updates: Partial<RAGContext>): void {
    this.context.ragContext = { ...this.context.ragContext, ...updates };
    this.notifyListeners();
  }

  public addRAGQueryRecord(record: Omit<RAGQueryRecord, 'timestamp'>): void {
    const newRecord: RAGQueryRecord = {
      ...record,
      timestamp: Date.now()
    };
    
    this.context.ragContext.queryHistory.push(newRecord);
    
    if (this.context.ragContext.queryHistory.length > 20) {
      this.context.ragContext.queryHistory = this.context.ragContext.queryHistory.slice(-20);
    }
    
    this.notifyListeners();
  }

  public setEquipmentFocus(equipmentId: string | null): void {
    this.context.ragContext.equipmentFocus = equipmentId;
    this.notifyListeners();
  }

  public setMaintenanceContext(context: string | null): void {
    this.context.ragContext.maintenanceContext = context;
    this.notifyListeners();
  }

  public getRAGContext(): RAGContext {
    return { ...this.context.ragContext };
  }

  public getRecentRAGQueries(count: number = 5): RAGQueryRecord[] {
    return this.context.ragContext.queryHistory.slice(-count);
  }

  public clearRAGContext(): void {
    this.context.ragContext = {
      lastQuery: '',
      lastQueryResult: '',
      relevantEquipment: [],
      queryHistory: [],
      equipmentFocus: null,
      maintenanceContext: null
    };
    this.notifyListeners();
  }

  // update scene statistics
  public updateSceneStats(stats: { 
    layerStats?: LayerStats; 
    featureStats?: FeatureStats;
    sampleLayers?: Array<{
      id: string;
      name: string;
      type: string;
      visible: boolean;
      metadata?: Record<string, unknown>;
      [key: string]: unknown;
    }>;
    sampleFeatures?: Array<{
      elementId: number;
      properties: Record<string, unknown>;
      description?: string;
      [key: string]: unknown;
    }>;
  }): void {
    if (stats.layerStats) {
      this.context.currentScene.layerStats = stats.layerStats;
    }
    if (stats.featureStats) {
      this.context.currentScene.featureStats = stats.featureStats;
    }
    if (stats.sampleLayers) {
      this.context.currentScene.sampleLayers = stats.sampleLayers;
    }
    if (stats.sampleFeatures) {
      this.context.currentScene.sampleFeatures = stats.sampleFeatures;
    }
    this.notifyListeners();
  }

  // get scene statistics
  public getSceneStats(): { layerStats?: LayerStats; featureStats?: FeatureStats } {
    return {
      layerStats: this.context.currentScene.layerStats,
      featureStats: this.context.currentScene.featureStats
    };
  }

  // Event Listeners
  public addListener(listener: (context: ContextData) => void): void {
    this.listeners.push(listener);
  }

  public removeListener(listener: (context: ContextData) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener({ ...this.context });
    }
  }

  private generateId(): string {
    return `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Utility Methods
  public exportContext(): string {
    return JSON.stringify(this.context, null, 2);
  }

  public importContext(contextData: string): void {
    try {
      const imported = JSON.parse(contextData);
      this.context = { ...this.context, ...imported };
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to import context:', error);
    }
  }

  public reset(): void {
    const preferences = this.context.userPreferences;
    this.context = {
      currentScene: {
        cameraPosition: {
          longitude: 0,
          latitude: 0,
          height: 1000,
          heading: 0,
          pitch: -90,
          roll: 0
        },
        viewMode: '3D',
        timeOfDay: 'day',
        weather: 'clear',
        filters: {}
      },
      dialogHistory: [],
      userPreferences: preferences,
      sessionStartTime: Date.now(),
      lastActivityTime: Date.now(),
      commandCount: 0,
      successRate: 1.0,
      ragContext: {
        lastQuery: '',
        lastQueryResult: '',
        relevantEquipment: [],
        queryHistory: [],
        equipmentFocus: null,
        maintenanceContext: null
      }
    };
    this.notifyListeners();
  }
} 