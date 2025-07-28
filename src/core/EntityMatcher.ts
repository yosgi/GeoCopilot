import { EntityRegistry } from './EntityRegistry';
import type { EntityMetadata } from './EntityRegistry';

export interface MatchResult {
  entity: EntityMetadata;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'synonym' | 'spatial' | 'semantic';
  matchedText: string;
  explanation: string;
}

export interface MatchOptions {
  fuzzyThreshold?: number;
  includeSynonyms?: boolean;
  includeSpatial?: boolean;
  includeSemantic?: boolean;
  maxResults?: number;
}

export class EntityMatcher {
  private entityRegistry: EntityRegistry;
  private synonymMap: Map<string, string[]> = new Map();
  private fuzzyThreshold: number = 0.7;
  private maxResults: number = 10;

  constructor(entityRegistry: EntityRegistry) {
    this.entityRegistry = entityRegistry;
    this.initializeSynonyms();
  }

  private initializeSynonyms() {
    // Common synonyms for building elements
    this.synonymMap.set('building', ['structure', 'edifice', 'construction', 'main building', 'primary building']);
    this.synonymMap.set('floor', ['level', 'story', 'storey', 'deck']);
    this.synonymMap.set('room', ['space', 'chamber', 'area', 'compartment']);
    this.synonymMap.set('wall', ['partition', 'divider', 'barrier']);
    this.synonymMap.set('door', ['entrance', 'exit', 'gateway', 'portal']);
    this.synonymMap.set('window', ['opening', 'aperture', 'glazing']);
    this.synonymMap.set('stairs', ['staircase', 'steps', 'stairway', 'escalator']);
    this.synonymMap.set('elevator', ['lift', 'elevator shaft']);
    this.synonymMap.set('roof', ['ceiling', 'top', 'covering']);
    this.synonymMap.set('foundation', ['base', 'footing', 'groundwork']);
    
    // Spatial relationship synonyms
    this.synonymMap.set('near', ['close to', 'next to', 'beside', 'adjacent to', 'by']);
    this.synonymMap.set('above', ['over', 'on top of', 'higher than', 'upstairs']);
    this.synonymMap.set('below', ['under', 'beneath', 'lower than', 'downstairs']);
    this.synonymMap.set('inside', ['within', 'in', 'contained in', 'enclosed by']);
    this.synonymMap.set('outside', ['exterior', 'external', 'beyond']);
    
    // Direction synonyms
    this.synonymMap.set('north', ['northern', 'up', 'forward']);
    this.synonymMap.set('south', ['southern', 'down', 'back']);
    this.synonymMap.set('east', ['eastern', 'right']);
    this.synonymMap.set('west', ['western', 'left']);
  }

  public match(input: string, options: MatchOptions = {}): MatchResult[] {
    const {
      fuzzyThreshold = this.fuzzyThreshold,
      includeSynonyms = true,
      includeSpatial = true,
      includeSemantic = true,
      maxResults = this.maxResults
    } = options;

    const results: MatchResult[] = [];

    // 1. Exact name matching
    const exactMatches = this.matchExact(input);
    results.push(...exactMatches);

    // 2. Fuzzy matching
    if (fuzzyThreshold > 0) {
      const fuzzyMatches = this.matchFuzzy(input, fuzzyThreshold);
      results.push(...fuzzyMatches);
    }

    // 3. Synonym matching
    if (includeSynonyms) {
      const synonymMatches = this.matchSynonyms(input);
      results.push(...synonymMatches);
    }

    // 4. Spatial relationship matching
    if (includeSpatial) {
      const spatialMatches = this.matchSpatialRelations(input);
      results.push(...spatialMatches);
    }

    // 5. Semantic matching
    if (includeSemantic) {
      const semanticMatches = this.matchSemantic(input);
      results.push(...semanticMatches);
    }

    // Sort by confidence and remove duplicates
    const uniqueResults = this.deduplicateResults(results);
    return uniqueResults
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxResults);
  }

  private matchExact(input: string): MatchResult[] {
    const normalizedInput = input.toLowerCase().trim();
    const entities = this.entityRegistry.find({ name: normalizedInput });
    
    return entities.map(entity => ({
      entity,
      confidence: 1.0,
      matchType: 'exact' as const,
      matchedText: entity.name,
      explanation: `Exact match for "${entity.name}"`
    }));
  }

  private matchFuzzy(input: string, threshold: number): MatchResult[] {
    const results: MatchResult[] = [];
    const normalizedInput = input.toLowerCase().trim();
    
    for (const entity of this.entityRegistry.getAll()) {
      const similarity = this.calculateSimilarity(normalizedInput, entity.name.toLowerCase());
      
      if (similarity >= threshold) {
        results.push({
          entity,
          confidence: similarity,
          matchType: 'fuzzy',
          matchedText: entity.name,
          explanation: `Fuzzy match (${(similarity * 100).toFixed(1)}% similarity)`
        });
      }

      // Also check aliases
      for (const alias of entity.aliases) {
        const aliasSimilarity = this.calculateSimilarity(normalizedInput, alias.toLowerCase());
        if (aliasSimilarity >= threshold) {
          results.push({
            entity,
            confidence: aliasSimilarity,
            matchType: 'fuzzy',
            matchedText: alias,
            explanation: `Fuzzy match on alias "${alias}" (${(aliasSimilarity * 100).toFixed(1)}% similarity)`
          });
        }
      }
    }

    return results;
  }

  private matchSynonyms(input: string): MatchResult[] {
    const results: MatchResult[] = [];
    const normalizedInput = input.toLowerCase().trim();

    // Find synonyms for the input
    const synonyms = this.findSynonyms(normalizedInput);
    
    for (const synonym of synonyms) {
      const entities = this.entityRegistry.find({ name: synonym });
      for (const entity of entities) {
        results.push({
          entity,
          confidence: 0.9,
          matchType: 'synonym',
          matchedText: synonym,
          explanation: `Synonym match: "${input}" → "${synonym}"`
        });
      }
    }

    return results;
  }

  private matchSpatialRelations(input: string): MatchResult[] {
    const results: MatchResult[] = [];
    const normalizedInput = input.toLowerCase().trim();

    // Extract spatial relationship patterns
    const spatialPatterns = [
      { pattern: /(.+)\s+(near|close to|next to|beside|adjacent to|by)\s+(.+)/i, relation: 'near' as const },
      { pattern: /(.+)\s+(above|over|on top of|higher than|upstairs)\s+(.+)/i, relation: 'above' as const },
      { pattern: /(.+)\s+(below|under|beneath|lower than|downstairs)\s+(.+)/i, relation: 'below' as const },
      { pattern: /(.+)\s+(inside|within|in|contained in|enclosed by)\s+(.+)/i, relation: 'inside' as const },
      { pattern: /(.+)\s+(adjacent|next to|beside)\s+(.+)/i, relation: 'adjacent' as const }
    ];

    for (const { pattern, relation } of spatialPatterns) {
      const match = normalizedInput.match(pattern);
      if (match) {
        const [, targetDesc, , referenceDesc] = match;
        
        // Find the reference entity
        const referenceEntities = this.match(targetDesc, { maxResults: 1 });
        if (referenceEntities.length > 0) {
          const referenceEntity = referenceEntities[0].entity;
          
          // Find entities with the specified spatial relationship
          const relatedEntities = this.entityRegistry.findSpatialRelations(referenceEntity.id, relation);
          
          for (const entity of relatedEntities) {
            results.push({
              entity,
              confidence: 0.8,
              matchType: 'spatial',
              matchedText: `${targetDesc} ${relation} ${referenceDesc}`,
              explanation: `Spatial relationship: ${entity.name} is ${relation} ${referenceEntity.name}`
            });
          }
        }
      }
    }

    return results;
  }

  private matchSemantic(input: string): MatchResult[] {
    const results: MatchResult[] = [];
    const normalizedInput = input.toLowerCase().trim();

    // Extract semantic categories and tags
    const entities = this.entityRegistry.getAll();
    
    for (const entity of entities) {
      let semanticScore = 0;
      let matchedSemantic = '';

      // Check category match
      if (entity.semantic.category.toLowerCase().includes(normalizedInput)) {
        semanticScore += 0.6;
        matchedSemantic = entity.semantic.category;
      }

      // Check description match
      if (entity.semantic.description.toLowerCase().includes(normalizedInput)) {
        semanticScore += 0.4;
        matchedSemantic = entity.semantic.description;
      }

      // Check tags match
      const matchingTags = entity.semantic.tags.filter(tag => 
        tag.toLowerCase().includes(normalizedInput)
      );
      if (matchingTags.length > 0) {
        semanticScore += 0.3 * matchingTags.length;
        matchedSemantic = matchingTags.join(', ');
      }

      if (semanticScore > 0) {
        results.push({
          entity,
          confidence: Math.min(semanticScore, 0.9),
          matchType: 'semantic',
          matchedText: matchedSemantic,
          explanation: `Semantic match: "${input}" found in ${entity.semantic.category} description/tags`
        });
      }
    }

    return results;
  }

  private findSynonyms(term: string): string[] {
    const synonyms: string[] = [];
    
    for (const [key, values] of this.synonymMap) {
      if (key.toLowerCase().includes(term) || term.includes(key.toLowerCase())) {
        synonyms.push(key, ...values);
      }
      
      for (const value of values) {
        if (value.toLowerCase().includes(term) || term.includes(value.toLowerCase())) {
          synonyms.push(key, ...values);
          break;
        }
      }
    }

    return [...new Set(synonyms)]; // Remove duplicates
  }

  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0) return 0.0;
    if (str2.length === 0) return 0.0;

    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    const distance = matrix[str2.length][str1.length];
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - (distance / maxLength);
  }

  private deduplicateResults(results: MatchResult[]): MatchResult[] {
    const seen = new Set<string>();
    const unique: MatchResult[] = [];

    for (const result of results) {
      if (!seen.has(result.entity.id)) {
        seen.add(result.entity.id);
        unique.push(result);
      }
    }

    return unique;
  }

  public addSynonyms(term: string, synonyms: string[]): void {
    this.synonymMap.set(term.toLowerCase(), synonyms.map(s => s.toLowerCase()));
  }

  public setFuzzyThreshold(threshold: number): void {
    this.fuzzyThreshold = Math.max(0, Math.min(1, threshold));
  }

  public setMaxResults(maxResults: number): void {
    this.maxResults = Math.max(1, maxResults);
  }

  public getSynonyms(term: string): string[] {
    return this.synonymMap.get(term.toLowerCase()) || [];
  }
} 