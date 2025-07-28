import type { OpenAI } from 'openai';
import type { GeoCopilot, ExecutionResult } from './GeoCopilot';
import type {
  ChatCompletionUserMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionMessageParam
} from 'openai/resources/chat/completions';
import { ContextManager } from './ContextManager';
import { BaseAgent } from './BaseAgent';

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
        max_tokens: 2000
      });
      const aiResponse = response.choices[0]?.message?.content || '';
      this.dialogHistory.push({ role: "assistant", content: aiResponse } as ChatCompletionAssistantMessageParam);
      if (this.dialogHistory.length > 6) this.dialogHistory = this.dialogHistory.slice(-6);
      return await this.geoCopilot.parseAndExecuteAIResponse(aiResponse);
    }
  }