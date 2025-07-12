// integratedLayerControlTool.ts - 修复后的图层控制工具
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { SceneContextManager, type SceneContext } from "../hooks/useSceneContext";

// factory function: create layer control tool with dependency injection
export const createLayerControlTool = (contextManager: SceneContextManager) => {
    return tool(
        async ({ action, layerId, layerIds, layerType, opacity }) => {
            try {
                console.log(`🎛️ Layer control tool called:`, { action, layerId, layerIds, layerType, opacity });

                switch (action.toLowerCase()) {
                    case 'show': {
                        if (layerId) {
                            const result = contextManager.setLayerVisibility(layerId, true);
                            return result.message;
                        } else if (layerIds && layerIds.length > 0) {
                            const result = contextManager.setMultipleLayersVisibility(layerIds, true);
                            return result.message;
                        } else {
                            throw new Error("Missing layerId or layerIds for show action");
                        }
                    }

                    case 'hide': {
                        if (layerId) {
                            const result = contextManager.setLayerVisibility(layerId, false);
                            return result.message;
                        } else if (layerIds && layerIds.length > 0) {
                            const result = contextManager.setMultipleLayersVisibility(layerIds, false);
                            return result.message;
                        } else {
                            throw new Error("Missing layerId or layerIds for hide action");
                        }
                    }

                    case 'toggle': {
                        if (!layerId) throw new Error("Missing layerId for toggle action");
                        const result = contextManager.toggleLayerVisibility(layerId);
                        return result.message;
                    }

                    case 'showbytype': {
                        if (!layerType) throw new Error("Missing layerType for showByType action");
                        const showTypeResult = contextManager.setLayersByType(layerType, true);
                        return showTypeResult.message;
                    }

                    case 'hidebytype': {
                        if (!layerType) throw new Error("Missing layerType for hideByType action");
                        const hideTypeResult = contextManager.setLayersByType(layerType, false);
                        return hideTypeResult.message;
                    }

                    case 'showall': {
                        const showAllResult = contextManager.showAllLayers();
                        return showAllResult.message;
                    }

                    case 'hideall': {
                        console.log('🎛️ Executing hideAll action');
                        const hideAllResult = contextManager.hideAllLayers();
                        console.log('🎛️ hideAll result:', hideAllResult);
                        return hideAllResult.message;
                    }

                    case 'showonly': {
                        if (!layerIds || layerIds.length === 0) {
                            throw new Error("Missing layerIds for showOnly action");
                        }
                        const showOnlyResult = contextManager.showOnlyLayers(layerIds);
                        return showOnlyResult.message;
                    }

                    case 'setopacity': {
                        if (!layerId) throw new Error("Missing layerId for setOpacity action");
                        if (opacity === undefined) throw new Error("Missing opacity value");
                        const opacityResult = contextManager.setLayerOpacity(layerId, opacity);
                        return opacityResult.message;
                    }

                    case 'list': {
                        const allLayerIds = contextManager.getLayerIds();
                        if (allLayerIds.length === 0) return "No layers available";

                        const layers = allLayerIds.map(id => {
                            const layer = contextManager.getLayer(id);
                            return `${layer?.name || id} (${layer?.type}): ${layer?.visible ? '👁️ Visible' : '🙈 Hidden'}`;
                        });
                        return `Available layers:\n${layers.join('\n')}`;
                    }

                    case 'types': {
                        const types = contextManager.getLayerTypes();
                        return `Available layer types: ${types.join(', ')}`;
                    }

                    case 'status': {
                        if (layerId) {
                            const layer = contextManager.getLayer(layerId);
                            if (!layer) return `Layer '${layerId}' not found`;

                            return `Layer '${layer.name}' (${layer.id}):\n📍 Type: ${layer.type}\n👁️ Visible: ${layer.visible ? 'Yes' : 'No'}\n🎨 Opacity: ${((layer.opacity || 1) * 100).toFixed(0)}%\n📝 Description: ${layer.description || 'None'}`;
                        } else {
                            const summary = contextManager.getLayersSummary();
                            const typeDetails = Object.entries(summary.byType)
                                .map(([type, stats]) => `${type}: ${stats.visible}/${stats.total}`)
                                .join(', ');

                            return `📊 Layer Summary:\nTotal: ${summary.total} layers\nVisible: ${summary.visible} layers\nHidden: ${summary.hidden} layers\nBy type: ${typeDetails}`;
                        }
                    }

                    case 'summary': {
                        const summaryData = contextManager.getLayersSummary();
                        return `📊 Quick Summary: ${summaryData.visible}/${summaryData.total} layers visible`;
                    }

                    case 'query': {
                        if (layerType) {
                            const matchingLayers = contextManager.queryLayers({ type: layerType as SceneContext["layers"][0]["type"] });
                            return `Found ${matchingLayers.length} layers of type '${layerType}': ${matchingLayers.map(l => l.name).join(', ')}`;
                        } else {
                            throw new Error("Query action requires layerType parameter");
                        }
                    }

                    default:
                        throw new Error(`Unknown action '${action}'. Available actions: show, hide, toggle, showByType, hideByType, showAll, hideAll, showOnly, setOpacity, list, types, status, summary, query`);
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error('🚨 Layer control error:', errorMessage);
                return `❌ ${errorMessage}`;
            }
        },
        {
            name: "layerControl",
            description: `Control layer visibility and properties in the 3D BIM scene. This tool provides comprehensive layer management capabilities.

CURRENT AVAILABLE LAYERS: The tool will automatically detect available layers from the scene context.

Available Actions:
- show: Make specific layer(s) visible
- hide: Make specific layer(s) invisible  
- toggle: Switch layer visibility
- showAll: Show all layers in the scene
- hideAll: Hide all layers in the scene
- showOnly: Show only specified layers, hide all others
- showByType/hideByType: Control all layers of a specific type (e.g., "BIM")
- setOpacity: Set layer transparency (0-1)
- list: List all available layers with status
- types: Show available layer types
- status: Get detailed layer information
- summary: Get quick layer visibility summary

Parameter Usage:
- Use 'layerId' for single layer operations (e.g., "Architecture", "Structural", "Site")
- Use 'layerIds' for multiple layer operations (array of layer names)
- Use 'layerType' for type-based operations (e.g., "BIM", "Terrain")
- Use 'opacity' for transparency control (0.0 = transparent, 1.0 = opaque)

Examples of user requests and corresponding actions:
- "隐藏Site图层" → action: "hide", layerId: "Site"
- "显示所有图层" → action: "showAll"
- "只显示建筑和立面" → action: "showOnly", layerIds: ["Architecture", "Facade"]
- "隐藏所有BIM图层" → action: "hideByType", layerType: "BIM"
- "设置建筑透明度50%" → action: "setOpacity", layerId: "Architecture", opacity: 0.5
- "查看图层状态" → action: "status"

The tool will automatically update the scene and UI when called.`,
            schema: z.object({
                action: z.enum([
                    "show", "hide", "toggle",
                    "showByType", "hideByType",
                    "showAll", "hideAll", "showOnly",
                    "setOpacity", "list", "types", "status", "summary", "query"
                ]).describe("Action to perform on layers"),
                layerId: z.string().optional().describe("Target layer ID for single layer operations"),
                layerIds: z.array(z.string()).optional().describe("Multiple layer IDs for batch operations"),
                layerType: z.string().optional().describe("Layer type for type-based operations"),
                opacity: z.number().min(0).max(1).optional().describe("Opacity value between 0 and 1")
            })
        }
    );
};

export default createLayerControlTool;