import { useCallback, useRef, useState } from 'react';
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as Cesium from "cesium";


// layer control hook
export const useLayerControl = () => {
    const [layers, setLayers] = useState<Array<{
        id: string;
        name: string;
        type: string;
        visible: boolean;
        [key: string]: unknown;
    }>>([]);
    const [loading, setLoading] = useState(false);
    const cesiumObjectsRef = useRef<Map<string, { cesiumObject: unknown; metadata?: unknown }>>(new Map());

    // register Cesium object
    const registerObject = useCallback((id: string, cesiumObject: unknown, metadata?: Record<string, unknown>) => {
        cesiumObjectsRef.current.set(id, { cesiumObject, metadata });

        // update layers state
        setLayers(prev => {
            const existing = prev.find(l => l.id === id);
            const layerInfo = {
                id,
                name: (metadata?.name as string) || id,
                type: (metadata?.type as string) || 'Unknown',
                visible: (cesiumObject as { show?: boolean }).show ?? true,
                ...metadata
            };

            return existing
                ? prev.map(l => l.id === id ? layerInfo : l)
                : [...prev, layerInfo];
        });
    }, []);

    // set layer visibility
    const setVisibility = useCallback(async (layerId: string, visible: boolean) => {
        const entry = cesiumObjectsRef.current.get(layerId);
        if (!entry) {
            throw new Error(`Layer '${layerId}' not found`);
        }

        setLoading(true);
        try {
            const { cesiumObject } = entry;
            const obj = cesiumObject as { show?: boolean; visible?: boolean };

            if (obj.show !== undefined) {
                obj.show = visible;
            } else if (obj.visible !== undefined) {
                obj.visible = visible;
            }

            // update state
            setLayers(prev =>
                prev.map(layer =>
                    layer.id === layerId ? { ...layer, visible } : layer
                )
            );

            return { success: true, message: `Successfully ${visible ? 'shown' : 'hidden'} Layer '${layerId}'` };
        } finally {
            setLoading(false);
        }
    }, []);

    // set opacity
    const setOpacity = useCallback(async (layerId: string, opacity: number) => {
        const entry = cesiumObjectsRef.current.get(layerId);
        if (!entry) {
            throw new Error(`Layer '${layerId}' not found`);
        }

        const { cesiumObject } = entry;
        opacity = Math.max(0, Math.min(1, opacity));

        if (cesiumObject instanceof Cesium.Cesium3DTileset) {
            cesiumObject.style = new Cesium.Cesium3DTileStyle({
                color: `color('white', ${opacity})`
            });
        }

        return { success: true, message: `Successfully set the opacity of Layer '${layerId}' to ${opacity}` };
    }, []);

    // batch operations
    const hideAll = useCallback(async () => {
        setLoading(true);
        try {
            // Use cesiumObjectsRef instead of layers state for more reliable operation
            const layerIds = Array.from(cesiumObjectsRef.current.keys());
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
    }, [setVisibility]);

    const showAll = useCallback(async () => {
        setLoading(true);
        try {
            // Use cesiumObjectsRef instead of layers state for more reliable operation
            const layerIds = Array.from(cesiumObjectsRef.current.keys());
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
    }, [setVisibility]);

    const showOnly = useCallback(async (layerIds: string[]) => {
        setLoading(true);
        try {
            // Use cesiumObjectsRef for more reliable operation
            const allLayerIds = Array.from(cesiumObjectsRef.current.keys());
            if (allLayerIds.length === 0) {
                return { success: true, message: "No layers available to update" };
            }
            
            const results = await Promise.all(
                allLayerIds.map(layerId =>
                    setVisibility(layerId, layerIds.includes(layerId))
                )
            );
            return { success: true, message: `Successfully updated ${results.length} layers` };
        } finally {
            setLoading(false);
        }
    }, [setVisibility]);

    return {
        // state
        layers,
        loading,
        cesiumObjectsRef,

        // register method
        registerObject,

        // control methods
        setVisibility,
        setOpacity,
        hideAll,
        showAll,
        showOnly,

        // convenient methods
        hide: (layerId: string) => setVisibility(layerId, false),
        show: (layerId: string) => setVisibility(layerId, true),
        toggle: (layerId: string) => {
            const layer = layers.find(l => l.id === layerId);
            return layer ? setVisibility(layerId, !layer.visible) : Promise.reject('Layer not found');
        }
    };
};


export const createLayerControlTool = (layerControl: ReturnType<typeof useLayerControl>) => {
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
                        const layerIds = Array.from(layerControl.cesiumObjectsRef?.current?.keys() || []);
                        if (layerIds.length === 0) {
                            return "No layers available";
                        }
                        
                        const layerList = layerIds.map(id => {
                            const entry = layerControl.cesiumObjectsRef?.current?.get(id);
                            const metadata = entry?.metadata as Record<string, unknown>;
                            const name = (metadata?.name as string) || id;
                            const visible = (entry?.cesiumObject as { show?: boolean }).show ?? true;
                            return `${name}: ${visible ? '👁️' : '🙈'}`;
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
            description: `Control layer visibility and properties in the 3D BIM scene.

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
- "hide site layer" → action: "hide", layerId: "site"`,
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