import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { flyToTool } from "../tools/flyToTool";
import { highlightTool } from "../tools/highlight";

export const runLocalAgent = async (input: string) => {
  const model = new ChatOpenAI({
    temperature: 0,
    modelName: "gpt-4",
    openAIApiKey: import.meta.env.VITE_OPENAI_API_KEY
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful AI assistant."],
    ["user", "{input}"]
  ]);

  const agent = await createToolCallingAgent({
    llm: model,
    tools: [flyToTool, highlightTool],
    prompt,
  });
  const executor = new AgentExecutor({
    agent,
    tools: [flyToTool, highlightTool],
    verbose: true,
  });

  const result = await executor.invoke({ input });
  return {
    raw: result,
    commands: result.output ? parseCommands(result.output) : []
  };
};

const parseCommands = (output: string) => {
  try {
    return JSON.parse(output);
  } catch {
    return [];
  }
};