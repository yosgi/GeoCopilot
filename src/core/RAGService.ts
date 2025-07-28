export interface RAGQueryResult {
  answer: string;
  success: boolean;
  error?: string;
  equipmentIds?: string[]; 
  confidence?: number; 
}

export interface RAGSearchResult {
  results: Record<string, unknown>[];
  success: boolean;
  error?: string;
  equipmentIds?: string[];
}

export interface RAGContext {
  equipmentFocus?: string | null;
  maintenanceContext?: string | null;
  relevantEquipment?: string[];
  lastQuery?: string;
}

export class RAGService {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:5002') {
    this.baseUrl = baseUrl;
  }

  /**
   * smart query using RAG system
   */
  async query(query: string, topK: number = 50, context?: RAGContext): Promise<RAGQueryResult> {
    try {
      // if there is context, enhance the query
      let enhancedQuery = query;
      if (context) {
        enhancedQuery = this.enhanceQueryWithContext(query, context);
      }

      const response = await fetch(`${this.baseUrl}/query/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: enhancedQuery,
          top_k: topK
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // extract equipment IDs from the result
      const equipmentIds = this.extractEquipmentIds(data.answer);
      
      return {
        answer: data.answer || 'No answer available',
        success: true,
        equipmentIds,
        confidence: this.calculateConfidence(enhancedQuery, data.answer)
      };
    } catch (error) {
      console.error('RAG query failed:', error);
      return {
        answer: 'Unable to query equipment database',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * search query - get raw search results
   */
  async search(query: string, topK: number = 5, context?: RAGContext): Promise<RAGSearchResult> {
    try {
      // if there is context, enhance the query
      let enhancedQuery = query;
      if (context) {
        enhancedQuery = this.enhanceQueryWithContext(query, context);
      }

      const response = await fetch(`${this.baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: enhancedQuery,
          top_k: topK
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // extract equipment IDs from the result
      const equipmentIds = this.extractEquipmentIdsFromResults(data);
      
      return {
        results: Array.isArray(data) ? data : [],
        success: true,
        equipmentIds
      };
    } catch (error) {
      console.error('RAG search failed:', error);
      return {
        results: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * enhance query with context
   */
  private enhanceQueryWithContext(query: string, context: RAGContext): string {
    let enhancedQuery = query;
    
    // if there is equipment focus, add to the query
    if (context.equipmentFocus) {
      enhancedQuery = `${enhancedQuery} [Equipment: ${context.equipmentFocus}]`;
    }
    
    // if there is maintenance context, add to the query
    if (context.maintenanceContext) {
      enhancedQuery = `${enhancedQuery} [Context: ${context.maintenanceContext}]`;
    }
    
    // if there is relevant equipment, add to the query
    if (context.relevantEquipment && context.relevantEquipment.length > 0) {
      enhancedQuery = `${enhancedQuery} [Related: ${context.relevantEquipment.join(', ')}]`;
    }
    
    return enhancedQuery;
  }

  /**
   * extract equipment IDs from the query result
   */
  private extractEquipmentIds(answer: string): string[] {
    const equipmentIds: string[] = [];
    
    // simple regex matching, can be adjusted based on actual data format
    const elementMatches = answer.match(/element\s+(\d+)/gi);
    if (elementMatches) {
      elementMatches.forEach(match => {
        const id = match.match(/\d+/)?.[0];
        if (id) equipmentIds.push(id);
      });
    }
    
    return equipmentIds;
  }

  /**
   * extract equipment IDs from the search result
   */
  private extractEquipmentIdsFromResults(results: Record<string, unknown>[]): string[] {
    const equipmentIds: string[] = [];
    
    results.forEach(result => {
      if (result.element) {
        equipmentIds.push(String(result.element));
      }
    });
    
    return equipmentIds;
  }

  /**
   * calculate query confidence
   */
  private calculateConfidence(query: string, answer: string): number {
    // simple confidence calculation, can be optimized based on needs
    if (!answer || answer === 'No answer available') {
      return 0.0;
    }
    
    // calculate confidence based on answer length and content quality
    const answerLength = answer.length;
    const hasEquipmentInfo = /equipment|element|system|maintenance/i.test(answer);
    const hasTechnicalDetails = /inspection|requirement|strategy|code/i.test(answer);
    
    let confidence = 0.5; // base confidence
    
    if (answerLength > 100) confidence += 0.2;
    if (hasEquipmentInfo) confidence += 0.2;
    if (hasTechnicalDetails) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  /**
   * check if RAG service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/status`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * generate smart suggestions
   */
  generateSuggestions(context: RAGContext): string[] {
    const suggestions: string[] = [];
    
    if (context.equipmentFocus) {
      suggestions.push(`view maintenance record of equipment ${context.equipmentFocus}`);
      suggestions.push(`check safety requirements of equipment ${context.equipmentFocus}`);
    }
    
    if (context.maintenanceContext) {
      suggestions.push(`continue ${context.maintenanceContext} process`);
      suggestions.push(`generate ${context.maintenanceContext} report`);
    }
    
    if (context.relevantEquipment && context.relevantEquipment.length > 0) {
      suggestions.push(`compare performance of relevant equipment`);
      suggestions.push(`batch check status of relevant equipment`);
    }
    
    return suggestions.slice(0, 3); // limit the number of suggestions  
  }
}