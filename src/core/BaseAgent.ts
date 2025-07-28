import type { OpenAI } from 'openai';
import type {
  ChatCompletionUserMessageParam,
  ChatCompletionAssistantMessageParam,
} from 'openai/resources/chat/completions';
import { ContextManager } from './ContextManager';

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
  