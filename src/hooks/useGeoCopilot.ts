import { useState } from "react";
import { runLocalAgent } from "../agents/GeoCopilotAgent";
// import { callRemoteAgent } from "../api/agentCall"; 

export const useGeoCopilot = () => {
  const [loading, setLoading] = useState(false);
  const [commands, setCommands] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = async (input: string) => {
    setLoading(true);
    setError(null);

    try {
      let result;
      const useBackend = false; 

      if (useBackend) {
        // result = await callRemoteAgent(input);
      } else {
        result = await runLocalAgent(input);
      }

      setCommands(result?.commands || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return { run, commands, loading, error };
};