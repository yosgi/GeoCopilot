export interface Intent {
  type: string;
  confidence: number;
  parameters: Record<string, unknown>;
  metadata?: {
    source: string;
    timestamp: number;
    context?: string;
  };
}

export interface ParsedIntent {
  primaryIntent: Intent;
  secondaryIntents: Intent[];
  overallConfidence: number;
  validation: {
    isValid: boolean;
    errors: string[];
    suggestions: string[];
  };
}

export class IntentParser {
  private intentPatterns: Map<string, RegExp[]> = new Map();
  private confidenceThreshold = 0.7;

  constructor() {
    this.initializePatterns();
  }

  private initializePatterns() {
    // Layer control patterns
    this.intentPatterns.set('layer_show', [
      /show\s+(all\s+)?layers?/i,
      /display\s+(all\s+)?layers?/i,
      /make\s+(all\s+)?layers?\s+visible/i
    ]);

    this.intentPatterns.set('layer_hide', [
      /hide\s+(all\s+)?layers?/i,
      /conceal\s+(all\s+)?layers?/i,
      /make\s+(all\s+)?layers?\s+invisible/i
    ]);

    this.intentPatterns.set('layer_toggle', [
      /toggle\s+(\w+)\s+layer/i,
      /switch\s+(\w+)\s+layer/i
    ]);

    this.intentPatterns.set('layer_show_only', [
      /show\s+only\s+(.+)/i,
      /display\s+only\s+(.+)/i,
      /only\s+show\s+(.+)/i
    ]);

    // Camera control patterns
    this.intentPatterns.set('camera_fly', [
      /fly\s+to\s+(.+)/i,
      /navigate\s+to\s+(.+)/i,
      /go\s+to\s+(.+)/i
    ]);

    this.intentPatterns.set('camera_zoom', [
      /zoom\s+(in|out)/i,
      /(zoom|scale)\s+(.+)/i
    ]);

    this.intentPatterns.set('camera_rotate', [
      /rotate\s+(.+)/i,
      /turn\s+(.+)/i,
      /spin\s+(.+)/i
    ]);

    // Complex patterns
    this.intentPatterns.set('compound_action', [
      /(.+)\s+and\s+(.+)/i,
      /(.+)\s+then\s+(.+)/i,
      /(.+)\s+,\s+(.+)/i
    ]);
  }

  public parse(input: string): ParsedIntent {
    const intents: Intent[] = [];
    let overallConfidence = 0;

    // Check for compound actions first
    const compoundMatch = this.matchCompoundAction(input);
    if (compoundMatch) {
      const subIntents = compoundMatch.actions.map(action => this.parseSingleIntent(action));
      intents.push(...subIntents);
      overallConfidence = this.calculateCompoundConfidence(subIntents);
    } else {
      const singleIntent = this.parseSingleIntent(input);
      intents.push(singleIntent);
      overallConfidence = singleIntent.confidence;
    }

    const primaryIntent = intents[0];
    const secondaryIntents = intents.slice(1);

    const validation = this.validateIntents(intents);

    return {
      primaryIntent,
      secondaryIntents,
      overallConfidence,
      validation
    };
  }

  private parseSingleIntent(input: string): Intent {
    let bestMatch: { type: string; confidence: number; parameters: Record<string, unknown> } = {
      type: 'unknown',
      confidence: 0,
      parameters: {}
    };

    for (const [intentType, patterns] of this.intentPatterns) {
      for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
          const confidence = this.calculateConfidence(match, input, intentType);
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              type: intentType,
              confidence,
              parameters: this.extractParameters(match, intentType)
            };
          }
        }
      }
    }

    return {
      type: bestMatch.type,
      confidence: bestMatch.confidence,
      parameters: bestMatch.parameters,
      metadata: {
        source: 'regex_pattern',
        timestamp: Date.now(),
        context: input
      }
    };
  }

  private matchCompoundAction(input: string): { actions: string[] } | null {
    const compoundPatterns = this.intentPatterns.get('compound_action') || [];
    
    for (const pattern of compoundPatterns) {
      const match = input.match(pattern);
      if (match) {
        const actions = match.slice(1).filter(Boolean);
        if (actions.length >= 2) {
          return { actions };
        }
      }
    }
    return null;
  }

  private calculateConfidence(match: RegExpMatchArray, input: string, intentType: string): number {
    const matchLength = match[0].length;
    const inputLength = input.length;
    const lengthRatio = matchLength / inputLength;
    
    // Base confidence on how much of the input was matched
    let confidence = lengthRatio * 0.8;
    
    // Boost confidence for exact matches
    if (match[0].toLowerCase() === input.toLowerCase()) {
      confidence += 0.2;
    }
    
    // Adjust based on intent type complexity
    if (intentType.includes('compound')) {
      confidence *= 0.9; // Slightly reduce confidence for complex intents
    }
    
    return Math.min(confidence, 1.0);
  }

  private calculateCompoundConfidence(intents: Intent[]): number {
    if (intents.length === 0) return 0;
    
    const avgConfidence = intents.reduce((sum, intent) => sum + intent.confidence, 0) / intents.length;
    const complexityPenalty = Math.max(0, (intents.length - 1) * 0.1);
    
    return Math.max(0, avgConfidence - complexityPenalty);
  }

  private extractParameters(match: RegExpMatchArray, intentType: string): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};
    
    switch (intentType) {
      case 'layer_show_only':
        parameters.layerNames = match[1]?.split(/\s+and\s+|\s*,\s*/) || [];
        break;
      case 'layer_toggle':
        parameters.layerName = match[1];
        break;
      case 'camera_fly':
        parameters.target = match[1];
        break;
      case 'camera_zoom':
        parameters.direction = match[1];
        break;
      case 'camera_rotate':
        parameters.direction = match[1];
        break;
    }
    
    return parameters;
  }

  private validateIntents(intents: Intent[]): {
    isValid: boolean;
    errors: string[];
    suggestions: string[];
  } {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // Check if any intent was found
    if (intents.length === 0 || intents[0].type === 'unknown') {
      errors.push('No clear intent detected');
      suggestions.push('Try using more specific commands like "show all layers" or "fly to building"');
    }

    // Check confidence levels
    const lowConfidenceIntents = intents.filter(intent => intent.confidence < this.confidenceThreshold);
    if (lowConfidenceIntents.length > 0) {
      errors.push('Some commands have low confidence');
      suggestions.push('Please rephrase your request more clearly');
    }

    // Validate parameters
    for (const intent of intents) {
      if (intent.type === 'layer_show_only') {
        const layerNames = intent.parameters.layerNames as string[];
        if (!layerNames || layerNames.length === 0) {
          errors.push('No layer names specified for show-only command');
          suggestions.push('Specify which layers to show, e.g., "show only architecture and structural"');
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      suggestions
    };
  }

  public setConfidenceThreshold(threshold: number) {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
  }

  public addCustomPattern(intentType: string, pattern: RegExp) {
    if (!this.intentPatterns.has(intentType)) {
      this.intentPatterns.set(intentType, []);
    }
    this.intentPatterns.get(intentType)!.push(pattern);
  }
} 