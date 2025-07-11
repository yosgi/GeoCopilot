import { DynamicTool } from "langchain/tools";
import { CesiumController } from "../core/CesiumController";


export const measurementTool = new DynamicTool({
  name: "measurement",
  description: "Measure the distance, area, or height of the specified entity by ID. Input should be a JSON string like { \"entityId\": \"main_building\" }.",
  func: async (input: string) => {
    try {
      const args = JSON.parse(input);

      if (!args.entityId) throw new Error("Missing entityId");

      await CesiumController.flyTo(args.entityId);

      return `Camera moved to ${args.entityId}`;
    } catch (err) {
      return `flyTo failed: ${(err as Error).message}`;
    }
  }
});