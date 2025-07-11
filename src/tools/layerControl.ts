import { DynamicTool } from "langchain/tools";
import { CesiumController } from "../core/CesiumController";


export const layerControlTool = new DynamicTool({
  name: "layerControl",
  description: "Control the visibility of the specified layer by ID. Input should be a JSON string like { \"layerId\": \"main_building\" }.",
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