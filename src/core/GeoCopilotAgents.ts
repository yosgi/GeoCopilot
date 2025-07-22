import type { OpenAI } from 'openai';
import type { GeoCopilot, ExecutionResult } from './GeoCopilot';
import type {
  ChatCompletionUserMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionMessageParam
} from 'openai/resources/chat/completions';

// --- Agent base ---
export abstract class BaseAgent {
  protected openaiClient: OpenAI;
  protected systemPrompt: string;
  protected dialogHistory: (ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam)[] = [];
  constructor(openaiClient: OpenAI, systemPrompt: string) {
    this.openaiClient = openaiClient;
    this.systemPrompt = systemPrompt;
  }
  abstract run(input: string): Promise<unknown>;
}

// --- ClarificationAgent ---
export class ClarificationAgent extends BaseAgent {
  async run(input: string): Promise<{ needsClarification: boolean, clarificationQuestions?: string[], suggestions?: string[] }> {
    // 1. Determine if clarification is needed
    const checkPrompt = `Is the following user input ambiguous or incomplete for 3D scene control? Answer only 'yes' or 'no'.\nUser input: "${input}"`;
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
    const clarificationPrompt = `User input: "${input}"
Please propose a clarifying question in one sentence. Only return the question itself.`;
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
    const suggestionPrompt = `User input: "${input}"
Please give 3 directly executable natural language command suggestions for 3D scene control, one per line.`;
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
  constructor(openaiClient: OpenAI, systemPrompt: string, geoCopilot: GeoCopilot) {
    super(openaiClient, systemPrompt);
    this.geoCopilot = geoCopilot;
  }
  async run(input: string): Promise<ExecutionResult> {
    this.dialogHistory.push({ role: "user", content: input } as ChatCompletionUserMessageParam);
    if (this.dialogHistory.length > 6) this.dialogHistory = this.dialogHistory.slice(-6);
    const toolsDescription = this.geoCopilot.buildToolsDescription();
    const systemPrompt = this.geoCopilot.buildSystemPrompt(toolsDescription);
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt } as ChatCompletionSystemMessageParam,
      ...this.dialogHistory,
      { role: "user", content: input } as ChatCompletionUserMessageParam
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