import { DynamicTool } from "langchain/tools";
import { CesiumController } from "../core/CesiumController";

export const highlightTool = new DynamicTool({
  name: "highlight",
  description: "Highlights a Cesium entity by changing its appearance. Input should be a JSON string like { \"entityId\": \"main_building\", \"color\": \"yellow\" }.",
  func: async (input: string) => {
    try {
      const args = JSON.parse(input);

      if (!args.entityId) throw new Error("Missing entityId");

      await CesiumController.highlight(args.entityId, args.color || "yellow");

      return `Entity ${args.entityId} highlighted with color ${args.color || "yellow"}`;
    } catch (err) {
      return `highlight failed: ${(err as Error).message}`;
    }
  }
});