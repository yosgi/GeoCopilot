import { useCallback, useState } from 'react';
import * as Cesium from "cesium";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { SceneData } from './useSceneUnderstanding';

// layer control hook 
export const useLayerControl = (sceneData: SceneData) => {
    const [loading, setLoading] = useState(false);
    

    // find layer by id
    const findLayer = useCallback((layerId: string) => {
        return sceneData.layers.find(layer => layer.id === layerId);
    }, [sceneData.layers]);

    // set layer visibility
    const setVisibility = useCallback(async (layerId: string, visible: boolean) => {
        setLoading(true);
        try {
            const layer = findLayer(layerId);
            if (!layer) {
                throw new Error(`Layer '${layerId}' not found`);
            }

            const cesiumObject = layer.cesiumObject;
            if (!cesiumObject) {
                throw new Error(`Layer '${layerId}' has no Cesium object`);
            }

            // set visibility
            const obj = cesiumObject as { show?: boolean; visible?: boolean };
            if (obj.show !== undefined) {
                obj.show = visible;
            } else if (obj.visible !== undefined) {
                obj.visible = visible;
            }

            return { success: true, message: `Successfully ${visible ? 'shown' : 'hidden'} Layer '${layerId}'` };
        } finally {
            setLoading(false);
        }
    }, [findLayer]);

    // set layer opacity
    const setOpacity = useCallback(async (layerId: string, opacity: number) => {
        setLoading(true);
        try {
            const layer = findLayer(layerId);
            if (!layer) {
                throw new Error(`Layer '${layerId}' not found`);
            }

            const cesiumObject = layer.cesiumObject;
            if (!cesiumObject) {
                throw new Error(`Layer '${layerId}' has no Cesium object`);
            }

            opacity = Math.max(0, Math.min(1, opacity));

            if (cesiumObject instanceof Cesium.Cesium3DTileset) {
                cesiumObject.style = new Cesium.Cesium3DTileStyle({
                    color: `color('white', ${opacity})`
                });
            }

            return { success: true, message: `Successfully set the opacity of Layer '${layerId}' to ${opacity}` };
        } finally {
            setLoading(false);
        }
    }, [findLayer]);

    // batch operations
    const hideAll = useCallback(async () => {
        console.log("hideAll", sceneData.layers);
        setLoading(true);
        try {
            const layerIds = sceneData.layers.map(layer => layer.id);
            if (layerIds.length === 0) {
                return { success: true, message: "No layers available to hide" };
            }

            const results = await Promise.all(
                layerIds.map(layerId => setVisibility(layerId, false))
            );
            return { success: true, message: `Successfully hidden ${results.length} layers` };
        } finally {
            setLoading(false);
        }
    }, [sceneData.layers, setVisibility]);

    const showAll = useCallback(async () => {
        setLoading(true);
        try {
            const layerIds = sceneData.layers.map(layer => layer.id);
            if (layerIds.length === 0) {
                return { success: true, message: "No layers available to show" };
            }

            const results = await Promise.all(
                layerIds.map(layerId => setVisibility(layerId, true))
            );
            return { success: true, message: `Successfully shown ${results.length} layers` };
        } finally {
            setLoading(false);
        }
    }, [sceneData.layers, setVisibility]);

    const showOnly = useCallback(async (targetLayerIds: string[]) => {
        setLoading(true);
        try {
            const allLayerIds = sceneData.layers.map(layer => layer.id);
            if (allLayerIds.length === 0) {
                return { success: true, message: "No layers available to update" };
            }

            const results = await Promise.all(
                allLayerIds.map(layerId =>
                    setVisibility(layerId, targetLayerIds.includes(layerId))
                )
            );
            return { success: true, message: `Successfully updated ${results.length} layers` };
        } finally {
            setLoading(false);
        }
    }, [sceneData.layers, setVisibility]);

    // convenient methods
    const hide = useCallback((layerId: string) => setVisibility(layerId, false), [setVisibility]);
    const show = useCallback((layerId: string) => setVisibility(layerId, true), [setVisibility]);
    const toggle = useCallback((layerId: string) => {
        const layer = findLayer(layerId);
        return layer ? setVisibility(layerId, !layer.visible) : Promise.reject('Layer not found');
    }, [findLayer, setVisibility]);

    return {
        // state
        layers: sceneData.layers,
        loading,
        
        // control methods
        setVisibility,
        setOpacity,
        hideAll,
        showAll,
        showOnly,
        hide,
        show,
        toggle,
        findLayer
    };
};

export const createLayerControlTool = (layerControl: ReturnType<typeof useLayerControl>) => {
    // Generate dynamic description with sample data
    const sampleLayers = layerControl.layers.slice(0, 3);
    const sampleDescription = sampleLayers.length > 0 
        ? `\nSample layers: ${sampleLayers.map(l => `${l.id} (${l.name})`).join(', ')}`
        : '';

    return tool(
        async ({ action, layerId, layerIds, opacity }) => {
            try {
                console.log(`🎛️ Layer control tool:`, { action, layerId, layerIds, opacity });

                switch (action.toLowerCase()) {
                    case 'show':
                        if (layerId) {
                            const result = await layerControl.show(layerId);
                            return result.message;
                        } else {
                            const result = await layerControl.showAll();
                            return result.message;
                        }

                    case 'hide':
                        if (layerId) {
                            const result = await layerControl.hide(layerId);
                            return result.message;
                        } else {
                            const result = await layerControl.hideAll();
                            return result.message;
                        }

                    case 'hideall': {
                        const hideAllResult = await layerControl.hideAll();
                        return hideAllResult.message;
                    }

                    case 'showall': {
                        const showAllResult = await layerControl.showAll();
                        return showAllResult.message;
                    }

                    case 'toggle': {
                        if (!layerId) throw new Error("layerId is required");
                        const result = await layerControl.toggle(layerId);
                        return result.message;
                    }

                    case 'showonly': {
                        if (!layerIds || layerIds.length === 0) {
                            throw new Error("layerIds is required");
                        }
                        const showOnlyResult = await layerControl.showOnly(layerIds);
                        return showOnlyResult.message;
                    }

                    case 'setopacity': {
                        if (!layerId || opacity === undefined) {
                            throw new Error("layerId and opacity are required");
                        }
                        const opacityResult = await layerControl.setOpacity(layerId, opacity);
                        return opacityResult.message;
                    }

                    case 'list': {
                        const layers = layerControl.layers;
                        if (layers.length === 0) {
                            return "No layers available";
                        }

                        const layerList = layers.map(layer => {
                            return `${layer.name}: ${layer.visible ? '👁️' : '🙈'}`;
                        }).join('\n');

                        return `Available layers:\n${layerList}`;
                    }

                    default:
                        throw new Error(`Unknown action: ${action}`);
                }
            } catch (error) {
                return `❌ ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        },
        {
            name: "layerControl",
            description: `Control layer visibility and properties in the 3D BIM scene.${sampleDescription}

Available Actions:
- show: Show specific layer or all layers
- hide: Hide specific layer or all layers  
- showAll: Show all layers explicitly
- hideAll: Hide all layers explicitly
- toggle: Toggle specific layer visibility
- showOnly: Show only specified layers
- setOpacity: Set layer transparency
- list: List all available layers

Examples:
- "hide all layers" → action: "hideAll"
- "show all layers" → action: "showAll"  
- "hide site layer" → action: "hide", layerId: "site"
- "hide tileset_0" → action: "hide", layerId: "tileset_0"`,
            schema: z.object({
                action: z.enum([
                    "show", "hide",
                    "showAll", "hideAll",
                    "toggle", "showOnly",
                    "setOpacity", "list"
                ]).describe("Action to perform"),
                layerId: z.string().optional().describe("Target layer ID"),
                layerIds: z.array(z.string()).optional().describe("Multiple layer IDs"),
                opacity: z.number().min(0).max(1).optional().describe("Opacity value (0-1)")
            })
        }
    );
};