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
  activeLayers: string[];
  cameraPosition: {
    longitude: number;
    latitude: number;
    height: number;
    heading: number;
    pitch: number;
    roll: number;
  };
  selectedEntities: string[];
  viewMode: '3D' | '2D' | 'Columbus';
  timeOfDay: string;
  weather: string;
  filters: Record<string, unknown>;
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
}

export class ContextManager {
  private context: ContextData;
  private maxHistorySize: number = 100;
  private listeners: Array<(context: ContextData) => void> = [];

  constructor(initialPreferences?: Partial<UserPreferences>) {
    this.context = {
      currentScene: {
        activeLayers: [],
        cameraPosition: {
          longitude: 0,
          latitude: 0,
          height: 1000,
          heading: 0,
          pitch: -90,
          roll: 0
        },
        selectedEntities: [],
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
      successRate: 1.0
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

  public updateActiveLayers(layers: string[]): void {
    this.context.currentScene.activeLayers = [...layers];
    this.notifyListeners();
  }

  public addActiveLayer(layerId: string): void {
    if (!this.context.currentScene.activeLayers.includes(layerId)) {
      this.context.currentScene.activeLayers.push(layerId);
      this.notifyListeners();
    }
  }

  public removeActiveLayer(layerId: string): void {
    const index = this.context.currentScene.activeLayers.indexOf(layerId);
    if (index > -1) {
      this.context.currentScene.activeLayers.splice(index, 1);
      this.notifyListeners();
    }
  }

  public updateSelectedEntities(entities: string[]): void {
    this.context.currentScene.selectedEntities = [...entities];
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

    // Suggest based on current scene state
    if (sceneState.activeLayers.length === 0) {
      suggestions.push('Try: "show all layers" to see the scene content');
    } else if (sceneState.activeLayers.length > 5) {
      suggestions.push('Try: "show only architecture" to focus on specific layers');
    }

    if (sceneState.selectedEntities.length > 0) {
      suggestions.push('Try: "fly to selected" to focus on selected items');
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
    const recentTurns = this.getRecentTurns(2);

    let context = `Scene: ${sceneState.activeLayers.length} active layers, ${sceneState.viewMode} view\n`;
    
    if (sceneState.activeLayers.length > 0) {
      context += `Active: ${sceneState.activeLayers.join(', ')}\n`;
    }
    
    if (recentTurns.length > 0) {
      context += `Recent: ${recentTurns.map(turn => turn.userInput).join(', ')}\n`;
    }

    return context;
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
        activeLayers: [],
        cameraPosition: {
          longitude: 0,
          latitude: 0,
          height: 1000,
          heading: 0,
          pitch: -90,
          roll: 0
        },
        selectedEntities: [],
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
      successRate: 1.0
    };
    this.notifyListeners();
  }
} 