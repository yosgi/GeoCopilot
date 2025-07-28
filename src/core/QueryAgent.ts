import type { OpenAI } from 'openai';
import type {
  ChatCompletionUserMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionMessageParam
} from 'openai/resources/chat/completions';
import { ContextManager } from './ContextManager';
import { EntityRegistry, type EntityMetadata } from './EntityRegistry';
import { RAGService } from '../core/RAGService';
import { BaseAgent } from './BaseAgent';

// --- QueryAgent ---
export class QueryAgent extends BaseAgent {
    private entityRegistry: EntityRegistry;
    private ragService: RAGService;
    
    constructor(openaiClient: OpenAI, systemPrompt: string, contextManager: ContextManager, entityRegistry: EntityRegistry, dialogHistory: (ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam)[], ragService?: RAGService) {
      super(openaiClient, systemPrompt, contextManager, dialogHistory);
      this.entityRegistry = entityRegistry;
      this.ragService = ragService || new RAGService();
    }
    async run(input: string): Promise<{ success: boolean, output: string }> {
      if (this.isDefinitelySimpleQuery(input)) {
        return this.handleSimpleQuery(input);
      }
      
      if (this.isDefinitelyRAGQuery(input)) {
        return this.handleRAGQuery(input);
      }
      
      if (await this.shouldUseRAG(input)) {
        return this.handleRAGQuery(input);
      }
      
      const simpleResult = this.handleSimpleQuery(input);
      if (simpleResult.success) {
        return simpleResult;
      }
      
      return this.fallbackToLLM(input);
    }
  
    /**
     * check if it is a simple query
     */
    private isDefinitelySimpleQuery(input: string): boolean {
      const simpleKeywords = ['layer', 'object', 'scene', 'status', 'command'];
      const lower = input.toLowerCase();
      return simpleKeywords.some(keyword => 
        lower.includes(keyword) && 
        !this.hasRAGKeywords(lower)
      );
    }
  
    /**
     * check if it is a RAG query
     */
    private isDefinitelyRAGQuery(input: string): boolean {
      const ragKeywords = ['equipment', 'maintenance', 'inspection', 'structural', 'integrity', 'safety', 'code', 'function', 'strategy', 'requirement'];
      const lower = input.toLowerCase();
      return ragKeywords.some(keyword => lower.includes(keyword));
    }
  
    /**
     * check if it contains RAG related keywords
     */
    private hasRAGKeywords(input: string): boolean {
      const ragKeywords = ['equipment', 'maintenance', 'inspection', 'structural', 'integrity'];
      return ragKeywords.some(keyword => input.includes(keyword));
    }
  
    /**
     * check if it needs RAG
     */
    private async shouldUseRAG(input: string): Promise<boolean> {
      try {
        const prompt = `Is this query about equipment, maintenance, or technical specifications that would require database lookup? Answer only yes/no: "${input}"`;
        const response = await this.openaiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 5
        });
        const answer = response.choices[0]?.message?.content?.toLowerCase() || '';
        return answer.includes('yes');
      } catch (error) {
        console.warn('LLM RAG judgment failed:', error);
        return false;
      }
    }
  
    /**
     * handle simple query
     */
    private handleSimpleQuery(input: string): { success: boolean, output: string } {
      const lower = input.toLowerCase();
      
      if (lower.includes('layer')) {
        const layers: EntityMetadata[] = this.entityRegistry.getAll();
        if (layers.length === 0) return { success: true, output: 'no layers' };
        const names = layers.map((l) => l.name || l.id).join(', ');
        return { success: true, output: `available layers: ${names}` };
      }
      
      if (lower.includes('command')) {
        const cmds: string[] = [];
        if (cmds.length === 0) return { success: true, output: 'no commands' };
        return { success: true, output: `available commands: ${cmds.join(', ')}` };
      }
      
      if (lower.includes('object')) {
        const objs: EntityMetadata[] = this.entityRegistry.getAll();
        if (objs.length === 0) return { success: true, output: 'no objects' };
        const names = objs.map((o) => o.name || o.id).join(', ');
        return { success: true, output: `available objects: ${names}` };
      }
      
      if (lower.includes('scene') || lower.includes('status')) {
        const ctx = this.contextManager.getContextForAI();
        return { success: true, output: `scene status: \n${ctx}` };
      }
      
      return { success: false, output: 'No simple query handler found' };
    }
  
    /**
     * handle RAG query, if RAG service is available
     */
    private async handleRAGQuery(input: string): Promise<{ success: boolean, output: string }> {
      try {
        // check if RAG service is available
        const isAvailable = await this.ragService.isAvailable();
        if (!isAvailable) {
          console.warn('RAG service not available, falling back to LLM');
          return this.fallbackToLLM(input);
        }
  
        // get current RAG context
        const ragContext = this.contextManager.getRAGContext();
        
        // smart process query
        const processedInput = this.processRAGInput(input, ragContext);
        
        // execute RAG query
        const result = await this.ragService.query(processedInput, 50, ragContext);
        
        if (result.success) {
          // update RAG context
          this.updateRAGContext(input, result, ragContext);
          
          // generate smart suggestions
          const suggestions = this.ragService.generateSuggestions(ragContext);
          
          let output = result.answer;
          if (suggestions.length > 0) {
            output += '\n\n💡 suggestions:\n' + suggestions.map(s => `• ${s}`).join('\n');
          }
          
          return { success: true, output };
        } else {
          console.warn('RAG query failed:', result.error);
          return this.fallbackToLLM(input);
        }
      } catch (error) {
        console.error('RAG query error:', error);
        return this.fallbackToLLM(input);
      }
    }
  
    /**
     * smart process RAG input, if RAG service is available
     */
    private processRAGInput(input: string, ragContext: { equipmentFocus?: string | null; maintenanceContext?: string | null }): string {
      let processedInput = input;
      
      // process pronoun reference
      if (ragContext.equipmentFocus && this.hasPronounReference(input)) {
        processedInput = input.replace(/\b(this|that|it|the)\b/gi, `设备 ${ragContext.equipmentFocus}`);
      }
      
      // process maintenance context
      if (ragContext.maintenanceContext && this.hasContextReference(input)) {
        processedInput = input.replace(/\b(check|inspection|maintenance)\b/gi, ragContext.maintenanceContext);
      }
      
      return processedInput;
    }
  
    /**
     * check if there is pronoun reference
     */
    private hasPronounReference(input: string): boolean {
      return /\b(this|that|it|the)\b/i.test(input);
    }
  
    /**
     * check if there is context reference
     */
    private hasContextReference(input: string): boolean {
      return /\b(check|inspection|maintenance|result|status)\b/i.test(input);
    }
  
    /**
     * update RAG context
     */
    private updateRAGContext(input: string, result: { answer: string; equipmentIds?: string[]; confidence?: number }, currentContext: { relevantEquipment: string[] }): void {
      // update last query and result
      this.contextManager.updateRAGContext({
        lastQuery: input,
        lastQueryResult: result.answer
      });
      
      // add query record
      this.contextManager.addRAGQueryRecord({
        query: input,
        result: result.answer,
        equipmentIds: result.equipmentIds || [],
        confidence: result.confidence || 0.5
      });
      
      // update relevant equipment
      if (result.equipmentIds && result.equipmentIds.length > 0) {
        this.contextManager.updateRAGContext({
          relevantEquipment: [...new Set([...currentContext.relevantEquipment, ...result.equipmentIds])]
        });
      }
      
      // smart set maintenance context
      if (this.isMaintenanceQuery(input)) {
        const maintenanceType = this.extractMaintenanceType(input);
        if (maintenanceType) {
          this.contextManager.setMaintenanceContext(maintenanceType);
        }
      }
    }
  
    /**
     * check if it is a maintenance related query
     */
    private isMaintenanceQuery(input: string): boolean {
      const maintenanceKeywords = ['maintenance', 'inspection', 'check', 'repair', 'service'];
      return maintenanceKeywords.some(keyword => input.toLowerCase().includes(keyword));
    }
  
    /**
     * extract maintenance type
     */
    private extractMaintenanceType(input: string): string | null {
      const lowerInput = input.toLowerCase();
      
      if (lowerInput.includes('structural') || lowerInput.includes('integrity')) {
        return 'structural_inspection';
      }
      if (lowerInput.includes('safety')) {
        return 'safety_inspection';
      }
      if (lowerInput.includes('preventive') || lowerInput.includes('preventive')) {
        return 'preventive_maintenance';
      }
      if (lowerInput.includes('emergency') || lowerInput.includes('urgent')) {
        return 'emergency_maintenance';
      }
      
      return 'general_maintenance';
    }
  
    /**
     * LLM fallback processing
     */
    private async fallbackToLLM(input: string): Promise<{ success: boolean, output: string }> {
      const context = this.contextManager.getContextForAI();
      const prompt = `Context: ${context}\nPlease list relevant information or data for the following user input: ${input}`;
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: this.systemPrompt } as ChatCompletionSystemMessageParam,
        ...this.dialogHistory,
        { role: 'user', content: prompt } as ChatCompletionUserMessageParam
      ];
      
      try {
        const resp = await this.openaiClient.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0,
          max_tokens: 300
        });
        const output = resp.choices[0]?.message?.content?.trim() || 'no relevant information';
        
        // record dialog history
        this.dialogHistory.push({ role: 'user', content: input } as ChatCompletionUserMessageParam);
        this.dialogHistory.push({ role: 'assistant', content: output } as ChatCompletionAssistantMessageParam);
        if (this.dialogHistory.length > 6) this.dialogHistory = this.dialogHistory.slice(-6);
        
        return { success: true, output };
      } catch (error) {
        console.error('LLM fallback failed:', error);
        return { success: false, output: 'Unable to process query' };
      }
    }
  }
  