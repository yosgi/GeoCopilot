import type { OpenAI } from 'openai';
import type { GeoCopilot, ExecutionResult } from './GeoCopilot';
import type {
  ChatCompletionUserMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionMessageParam
} from 'openai/resources/chat/completions';
import { ContextManager } from './ContextManager';
import { EntityRegistry, type EntityMetadata } from './EntityRegistry';

// --- Agent base ---
export abstract class BaseAgent {
  protected openaiClient: OpenAI;
  protected systemPrompt: string;
  protected contextManager: ContextManager;
  protected dialogHistory: (ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam)[];
  constructor(openaiClient: OpenAI, systemPrompt: string, contextManager: ContextManager, dialogHistory: (ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam)[]) {
    this.openaiClient = openaiClient;
    this.systemPrompt = systemPrompt;
    this.contextManager = contextManager;
    this.dialogHistory = dialogHistory;
  }
  abstract run(input: string): Promise<unknown>;
}

// --- ClarificationAgent ---
export class ClarificationAgent extends BaseAgent {
  async run(input: string): Promise<{ needsClarification: boolean, clarificationQuestions?: string[], suggestions?: string[] }> {
    // Include context in the prompt
    const context = this.contextManager.getContextForAI();
    // 1. Determine if clarification is needed
    const checkPrompt = `Context: ${context}\nIs the following user input ambiguous or incomplete for 3D scene control? Answer only 'yes' or 'no'.\nUser input: "${input}"`;
    const checkMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: this.systemPrompt } as ChatCompletionSystemMessageParam,
      ...this.dialogHistory,
      { role: "user", content: checkPrompt } as ChatCompletionUserMessageParam
    ];
    const checkResp = await this.openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: checkMessages,
      temperature: 0,
      max_tokens: 10
    });
    const needsClarification = /yes/i.test(checkResp.choices[0]?.message?.content || '');
    if (!needsClarification) return { needsClarification: false };

    // 2. Generate clarification questions
    const clarificationPrompt = `Context: ${context}\nUser input: "${input}"\nPlease propose a clarifying question in one sentence. Only return the question itself.`;
    const clarificationMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: this.systemPrompt } as ChatCompletionSystemMessageParam,
      ...this.dialogHistory,
      { role: "user", content: clarificationPrompt } as ChatCompletionUserMessageParam
    ];
    const clarificationResp = await this.openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: clarificationMessages,
      temperature: 0,
      max_tokens: 100
    });
    const clarification = clarificationResp.choices[0]?.message?.content?.trim() || '';

    // 3. Generate suggestions
    const suggestionPrompt = `Context: ${context}\nUser input: "${input}"\nPlease give 3 directly executable natural language command suggestions for 3D scene control, one per line.`;
    const suggestionMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: this.systemPrompt } as ChatCompletionSystemMessageParam,
      ...this.dialogHistory,
      { role: "user", content: suggestionPrompt } as ChatCompletionUserMessageParam
    ];
    const suggestionResp = await this.openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: suggestionMessages,
      temperature: 0,
      max_tokens: 200
    });
    const suggestions = (suggestionResp.choices[0]?.message?.content || '').split('\n').map(s => s.trim()).filter(Boolean);

    // Record clarification conversation history
    this.dialogHistory.push({ role: "user", content: input } as ChatCompletionUserMessageParam);
    this.dialogHistory.push({ role: "assistant", content: clarification } as ChatCompletionAssistantMessageParam);
    if (this.dialogHistory.length > 6) this.dialogHistory = this.dialogHistory.slice(-6);

    return { needsClarification: true, clarificationQuestions: [clarification], suggestions };
  }
}

// --- ExecutionAgent ---
export class ExecutionAgent extends BaseAgent {
  private geoCopilot: GeoCopilot;
  constructor(openaiClient: OpenAI, systemPrompt: string, geoCopilot: GeoCopilot, contextManager: ContextManager, dialogHistory: (ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam)[]) {
    super(openaiClient, systemPrompt, contextManager, dialogHistory);
    this.geoCopilot = geoCopilot;
  }
  async run(input: string): Promise<ExecutionResult> {
    this.dialogHistory.push({ role: "user", content: input } as ChatCompletionUserMessageParam);
    if (this.dialogHistory.length > 6) this.dialogHistory = this.dialogHistory.slice(-6);
    const context = this.contextManager.getContextForAI();
    const toolsDescription = this.geoCopilot.buildToolsDescription();
    const systemPrompt = this.geoCopilot.buildSystemPrompt(toolsDescription);
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt } as ChatCompletionSystemMessageParam,
      ...this.dialogHistory,
      { role: "user", content: `Context: ${context}\n${input}` } as ChatCompletionUserMessageParam
    ];
    const response = await this.openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0,
      max_tokens: 1000
    });
    const aiResponse = response.choices[0]?.message?.content || '';
    this.dialogHistory.push({ role: "assistant", content: aiResponse } as ChatCompletionAssistantMessageParam);
    if (this.dialogHistory.length > 6) this.dialogHistory = this.dialogHistory.slice(-6);
    return await this.geoCopilot.parseAndExecuteAIResponse(aiResponse);
  }
}

// --- QueryAgent ---
export class QueryAgent extends BaseAgent {
  private entityRegistry: EntityRegistry;
  constructor(openaiClient: OpenAI, systemPrompt: string, contextManager: ContextManager, entityRegistry: EntityRegistry, dialogHistory: (ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam)[]) {
    super(openaiClient, systemPrompt, contextManager, dialogHistory);
    this.entityRegistry = entityRegistry;
  }
  async run(input: string): Promise<{ success: boolean, output: string }> {
    const lower = input.toLowerCase();
    if ( lower.includes('layer')) {
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
    // fallback: let LLM summarize
    const context = this.contextManager.getContextForAI();
    const prompt = `Context: ${context}\nPlease list relevant information or data for the following user input: ${input}`;
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt } as ChatCompletionSystemMessageParam,
      ...this.dialogHistory,
      { role: 'user', content: prompt } as ChatCompletionUserMessageParam
    ];
    const resp = await this.openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0,
      max_tokens: 300
    });
    const output = resp.choices[0]?.message?.content?.trim() || 'no relevant information';
    this.dialogHistory.push({ role: 'user', content: input } as ChatCompletionUserMessageParam);
    this.dialogHistory.push({ role: 'assistant', content: output } as ChatCompletionAssistantMessageParam);
    if (this.dialogHistory.length > 6) this.dialogHistory = this.dialogHistory.slice(-6);
    return { success: true, output };
  }
}

// --- IntentAgent ---
export class IntentAgent extends BaseAgent {
  async run(input: string): Promise<{
    type: 'execute' | 'query' | 'clarify' | 'help' | 'greeting' | 'feedback' | 'other',
    confidence: number,
    reason?: string,
    clarificationQuestions?: string[]
  }> {
    // Prompt for structured intent classification with context and history
    const context = this.contextManager.getContextForAI();
    const prompt = `Context: ${context}\nClassify the following user input for a 3D scene AI agent. \nReturn a JSON object with fields: type (one of execute, query, clarify, help, greeting, feedback, other), confidence (0-1), reason (short explanation), and if type is clarify, an array clarificationQuestions. \nUser input: "${input}"`;
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are an intent classification assistant for a 3D scene AI agent.' } as ChatCompletionSystemMessageParam,
      ...this.dialogHistory,
      { role: 'user', content: prompt } as ChatCompletionUserMessageParam
    ];
    const resp = await this.openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0,
      max_tokens: 300
    });
    // Try to parse JSON from LLM output
    let result: {
      type: 'execute' | 'query' | 'clarify' | 'help' | 'greeting' | 'feedback' | 'other',
      confidence: number,
      reason?: string,
      clarificationQuestions?: string[]
    } = {
      type: 'other',
      confidence: 0.5,
      reason: 'Could not parse LLM output.'
    };
    try {
      const text = resp.choices[0]?.message?.content?.trim();
      if (text) {
        // Find first JSON object in output
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          const allowedTypes = [
            'execute', 'query', 'clarify', 'help', 'greeting', 'feedback', 'other'
          ];
          if (allowedTypes.includes(parsed.type)) {
            result = parsed;
          } else {
            result.type = 'other';
          }
        }
      }
    } catch {
      // fallback to default result
    }
    return result;
  }
} 