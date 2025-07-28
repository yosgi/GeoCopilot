import type {
  ChatCompletionUserMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionMessageParam
} from 'openai/resources/chat/completions';
import { BaseAgent } from './BaseAgent';

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
        { role: 'system', content: `You are an intent classification assistant for a 3D scene AI agent.

INTENT CLASSIFICATION RULES:
- "query": Any question asking for information, data, or knowledge (e.g., "query equipment", "what layers are available", "find pumps", "show me motors")
- "execute": Commands to perform actions (e.g., "highlight", "show layer", "fly to", "zoom in")
- "clarify": Only when the input is truly ambiguous or missing critical information
- "help": Requests for help or assistance
- "greeting": Hello, hi, etc.
- "feedback": User feedback or complaints
- "other": Everything else

EXAMPLES:
- "query equipment with mechanical parts" → type: "query", confidence: 0.95
- "what equipment has bearings" → type: "query", confidence: 0.95  
- "highlight feature 123" → type: "execute", confidence: 0.95
- "show all layers" → type: "execute", confidence: 0.95
- "what do you mean?" → type: "clarify", confidence: 0.8
- "help me" → type: "help", confidence: 0.9

IMPORTANT: Equipment queries should be classified as "query", not "clarify".` } as ChatCompletionSystemMessageParam,
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