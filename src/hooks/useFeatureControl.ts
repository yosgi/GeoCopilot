import { useCallback, useState } from 'react';
import * as Cesium from "cesium";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { SceneData } from './useSceneUnderstanding';

// feature control hook
export const useFeatureControl = (sceneData: SceneData) => {
    const [loading, setLoading] = useState(false);
    const [selectedFeatures, setSelectedFeatures] = useState<Set<number>>(new Set());
    const [highlightedFeatures, setHighlightedFeatures] = useState<Set<number>>(new Set());

    // find feature by elementId
    const findFeature = useCallback((elementId: number) => {
        return sceneData.features.find(feature => feature.elementId === elementId);
    }, [sceneData.features]);

    // find features by property
    const findFeaturesByProperty = useCallback((property: string, value: string) => {
        return sceneData.features.filter(feature => {
            const propValue = feature.properties[property];
            if (typeof propValue === 'string') {
                return propValue.toLowerCase().includes(value.toLowerCase());
            }
            return String(propValue).toLowerCase().includes(value.toLowerCase());
        });
    }, [sceneData.features]);

    // find features by category
    const findFeaturesByCategory = useCallback((category: string) => {
        return sceneData.features.filter(feature => {
            const subcategory = feature.properties.subcategory as string;
            return subcategory && subcategory.toLowerCase().includes(category.toLowerCase());
        });
    }, [sceneData.features]);

    // set feature visibility
    const setFeatureVisibility = useCallback(async (elementId: number, visible: boolean) => {
        setLoading(true);
        try {
            const feature = findFeature(elementId);
            if (!feature) {
                throw new Error(`Feature with elementId '${elementId}' not found`);
            }

            const cesiumFeature = feature.cesiumObject;
            if (!cesiumFeature) {
                throw new Error(`Feature ${elementId} has no Cesium object reference`);
            }

            // 设置feature的可见性
            cesiumFeature.show = visible;
            
            return { 
                success: true, 
                message: `Successfully ${visible ? 'shown' : 'hidden'} feature ${elementId}` 
            };
        } finally {
            setLoading(false);
        }
    }, [findFeature]);

    // select feature
    const selectFeature = useCallback(async (elementId: number) => {
        setLoading(true);
        try {
            const feature = findFeature(elementId);
            if (!feature) {
                throw new Error(`Feature with elementId '${elementId}' not found`);
            }

            const cesiumFeature = feature.cesiumObject;
            if (!cesiumFeature) {
                throw new Error(`Feature ${elementId} has no Cesium object reference`);
            }

            cesiumFeature.color = Cesium.Color.YELLOW;
            
            setSelectedFeatures(prev => new Set([...prev, elementId]));
            
            return { 
                success: true, 
                message: `Successfully selected feature ${elementId}` 
            };
        } finally {
            setLoading(false);
        }
    }, [findFeature]);

    // deselect feature
    const deselectFeature = useCallback(async (elementId: number) => {
        setLoading(true);
        try {
            const feature = findFeature(elementId);
            if (feature && feature.cesiumObject) {
                feature.cesiumObject.color = Cesium.Color.WHITE;
            }

            setSelectedFeatures(prev => {
                const newSet = new Set(prev);
                newSet.delete(elementId);
                return newSet;
            });
            
            return { 
                success: true, 
                message: `Successfully deselected feature ${elementId}` 
            };
        } finally {
            setLoading(false);
        }
    }, [findFeature]);

    // clear selection
    const clearSelection = useCallback(async () => {
        setLoading(true);
        try {
   
            selectedFeatures.forEach(elementId => {
                const feature = findFeature(elementId);
                if (feature && feature.cesiumObject) {
                    feature.cesiumObject.color = Cesium.Color.WHITE;
                }
            });

            setSelectedFeatures(new Set());
            return { 
                success: true, 
                message: "Successfully cleared feature selection" 
            };
        } finally {
            setLoading(false);
        }
    }, [selectedFeatures, findFeature]);

    // highlight feature
    const highlightFeature = useCallback(async (elementId: number) => {
        console.log("highlightFeature", elementId);
        setLoading(true);
        try {
            const feature = findFeature(elementId);
            if (!feature) {
                throw new Error(`Feature with elementId '${elementId}' not found`);
            }

            // Find all unique tilesets from features
            const tilesets = new Set<Cesium.Cesium3DTileset>();
            sceneData.features.forEach(f => {
                if (f.cesiumObject?.tileset) {
                    tilesets.add(f.cesiumObject.tileset);
                }
            });
            
            if (tilesets.size > 0) {
                // Try different property names that might contain the element ID
                const propertyNames = ['element', 'Element', 'elementId', 'ElementId', 'id', 'Id'];
                let foundProperty = null;
                
                // Check which property contains the element ID
                const sampleFeature = sceneData.features.find(f => f.cesiumObject);
                if (sampleFeature?.cesiumObject) {
                    for (const propName of propertyNames) {
                        const value = sampleFeature.cesiumObject.getProperty(propName);
                        if (value && elementId === Number(value)) {
                            foundProperty = propName;
                            console.log(`Found element ID in property: ${propName}`);
                            break;
                        }
                    }
                }
                
                if (!foundProperty) {
                    console.warn('Could not find element ID property, trying default "element"');
                    foundProperty = 'element';
                }
                
                // Create style conditions for highlighting
                const highlightedIds = Array.from(highlightedFeatures);
                highlightedIds.push(elementId);
                
                const colorConditions = highlightedIds.map(id => [`\${${foundProperty}} === "${id}"`, 'color("red")']);
                colorConditions.push(['true', 'color("white")']); // default color
                
                // Apply style to all tilesets
                tilesets.forEach(tileset => {
                    tileset.style = new Cesium.Cesium3DTileStyle({
                        color: { conditions: colorConditions }
                    });
                    
                    // Force tileset to update
                    tileset.show = !tileset.show;
                    tileset.show = !tileset.show;
                });
                
                // Wait for next frame to ensure style is applied
                await new Promise(resolve => setTimeout(resolve, 0));
                
                console.log(`Applied highlight style for ${highlightedIds.length} features across ${tilesets.size} tilesets`);
            }

            // Also set color directly for immediate effect
            const allFeaturesWithElementId = sceneData.features.filter(f => f.elementId === elementId);
            console.log(`Found ${allFeaturesWithElementId.length} features with elementId ${elementId}`);
            
            allFeaturesWithElementId.forEach(f => {
                if (f.cesiumObject) {
                    f.cesiumObject.color = Cesium.Color.RED;
                    console.log(`Set color on feature ${f.elementId}`);
                }
            });
            
            setHighlightedFeatures(prev => new Set([...prev, elementId]));
            
            return { 
                success: true, 
                message: `Successfully highlighted feature ${elementId} (${allFeaturesWithElementId.length} instances)` 
            };
        } finally {
            setLoading(false);
        }
    }, [findFeature, sceneData.features, highlightedFeatures]);

    // remove highlight
    const removeHighlight = useCallback(async (elementId: number) => {
        console.log("removeHighlight", elementId);
        setLoading(true);
        try {
            // Find all features with this elementId and remove their highlights
            const allFeaturesWithElementId = sceneData.features.filter(f => f.elementId === elementId);
            console.log(`Found ${allFeaturesWithElementId.length} features with elementId ${elementId} to remove highlight`);
            
            allFeaturesWithElementId.forEach(f => {
                if (f.cesiumObject) {
                    f.cesiumObject.color = Cesium.Color.WHITE;
                    console.log(`Removed highlight from feature ${f.elementId}`);
                }
            });

            setHighlightedFeatures(prev => {
                const newSet = new Set(prev);
                newSet.delete(elementId);
                return newSet;
            });
            
            return { 
                success: true, 
                message: `Successfully removed highlight from feature ${elementId} (${allFeaturesWithElementId.length} instances)` 
            };
        } finally {
            setLoading(false);
        }
    }, [findFeature, sceneData.features]);

    // clear highlights
    const clearHighlights = useCallback(async () => {
        console.log("clearHighlights");
        setLoading(true);
        try {
            let totalInstances = 0;
            
            highlightedFeatures.forEach(elementId => {
                // Find all features with this elementId
                const allFeaturesWithElementId = sceneData.features.filter(f => f.elementId === elementId);
                totalInstances += allFeaturesWithElementId.length;
                
                allFeaturesWithElementId.forEach(f => {
                    if (f.cesiumObject) {
                        f.cesiumObject.color = Cesium.Color.WHITE;
                        console.log(`Cleared highlight from feature ${f.elementId}`);
                    }
                });
            });

            setHighlightedFeatures(new Set());
            return { 
                success: true, 
                message: `Successfully cleared all highlights (${totalInstances} instances)` 
            };
        } finally {
            setLoading(false);
        }
    }, [highlightedFeatures, findFeature, sceneData.features]);

    // set feature opacity
    const setFeatureOpacity = useCallback(async (elementId: number, opacity: number) => {
        console.log("setFeatureOpacity", elementId, opacity);
        setLoading(true);
        try {
            // Clamp opacity between 0 and 1
            opacity = Math.max(0, Math.min(1, opacity));
            
            const feature = findFeature(elementId);
            if (!feature) {
                throw new Error(`Feature with elementId '${elementId}' not found`);
            }

            // Find all features with this elementId and set their opacity
            const allFeaturesWithElementId = sceneData.features.filter(f => f.elementId === elementId);
            console.log(`Found ${allFeaturesWithElementId.length} features with elementId ${elementId}`);
            
            allFeaturesWithElementId.forEach(f => {
                if (f.cesiumObject) {
                    f.cesiumObject.color = f.cesiumObject.color.withAlpha(opacity);
                    console.log(`Set opacity ${opacity} on feature ${f.elementId}`);
                }
            });
            
            return { 
                success: true, 
                message: `Successfully set opacity to ${opacity} for feature ${elementId} (${allFeaturesWithElementId.length} instances)` 
            };
        } finally {
            setLoading(false);
        }
    }, [findFeature, sceneData.features]);

    // isolate features (set all others to opacity 0)
    const isolateFeatures = useCallback(async (elementIds: number[]) => {
        console.log("isolateFeatures", elementIds);
        setLoading(true);
        try {
            // Validate input
            if (!elementIds || elementIds.length === 0) {
                throw new Error("elementIds array cannot be empty");
            }

            // Find all valid features to isolate
            const validElementIds: number[] = [];
            let totalInstances = 0;
            
            elementIds.forEach(elementId => {
                const allFeaturesWithElementId = sceneData.features.filter(f => f.elementId === elementId);
                if (allFeaturesWithElementId.length > 0) {
                    validElementIds.push(elementId);
                    totalInstances += allFeaturesWithElementId.length;
                } else {
                    console.warn(`No features found with elementId ${elementId}`);
                }
            });

            // Check if we have any valid features to isolate
            if (validElementIds.length === 0) {
                throw new Error("No valid features found to isolate");
            }

            // Find all unique tilesets from features
            const tilesets = new Set<Cesium.Cesium3DTileset>();
            sceneData.features.forEach(f => {
                if (f.cesiumObject?.tileset) {
                    tilesets.add(f.cesiumObject.tileset);
                }
            });
            
            if (tilesets.size > 0) {
                // Try different property names that might contain the element ID
                const propertyNames = ['element', 'Element', 'elementId', 'ElementId', 'id', 'Id'];
                let foundProperty = null;
                
                // Check which property contains the element ID
                const sampleFeature = sceneData.features.find(f => f.cesiumObject);
                if (sampleFeature?.cesiumObject) {
                    console.log('Sample feature properties:', sampleFeature.cesiumObject.getPropertyIds());
                    for (const propName of propertyNames) {
                        const value = sampleFeature.cesiumObject.getProperty(propName);
                        console.log(`Property ${propName}:`, value);
                        if (value && validElementIds.includes(Number(value))) {
                            foundProperty = propName;
                            console.log(`Found element ID in property: ${propName}`);
                            break;
                        }
                    }
                }
                
                if (!foundProperty) {
                    // Try to find from sceneData features
                    const sampleFeatureData = sceneData.features.find(f => validElementIds.includes(f.elementId));
                    if (sampleFeatureData) {
                        console.log('Sample feature data properties:', Object.keys(sampleFeatureData.properties));
                        // Check if elementId is stored in properties
                        console.log('Sample feature elementId:', sampleFeatureData.elementId);
                        for (const [key, value] of Object.entries(sampleFeatureData.properties)) {
                            console.log(`Property ${key}: ${value} (type: ${typeof value})`);
                            if (value === sampleFeatureData.elementId) {
                                foundProperty = key;
                                console.log(`Found element ID in property: ${key}`);
                                break;
                            }
                        }
                    }
                    
                    if (!foundProperty) {
                        console.warn('Could not find element ID property, trying default "element"');
                        foundProperty = 'element';
                    }
                }
                
                // Create style conditions for isolation
                // Use string comparison since element property is string type
                const alphaConditions = validElementIds.map(id => [`\${${foundProperty}} === "${id}"`, 1.0]);
                alphaConditions.push(['true', 0.0]); // all others transparent
                
                console.log('Using property name:', foundProperty);
                console.log('Valid element IDs:', validElementIds);
                
                // Apply style to all tilesets
                tilesets.forEach((tileset) => {
                    // Use show property for isolation
                    const showConditions = validElementIds.map(id => [`\${${foundProperty}} === "${id}"`, true]);
                    showConditions.push(['true', false]); // all others hidden
                    
                    tileset.style = new Cesium.Cesium3DTileStyle({
                        show: { conditions: showConditions }
                    });
                    
                    // Force tileset to update
                    tileset.show = !tileset.show;
                    tileset.show = !tileset.show;
                });
                
                // Wait for next frame to ensure style is applied
                await new Promise(resolve => setTimeout(resolve, 0));
                
                console.log(`Applied isolation style for ${validElementIds.length} features across ${tilesets.size} tilesets`);
                console.log('Tileset styles applied');
            } else {
                console.warn('No tileset found for isolation');
            }

            // Note: We rely on tileset.style for persistent isolation
            // Direct color manipulation is removed to avoid conflicts with style
            
            return { 
                success: true, 
                message: `Successfully isolated ${validElementIds.length} features (${totalInstances} instances total)` 
            };
        } finally {
            setLoading(false);
        }
    }, [sceneData.features]);

    // reset all feature opacity to 1
    const resetAllOpacity = useCallback(async () => {
        console.log("resetAllOpacity");
        setLoading(true);
        try {
            let totalInstances = 0;
            
            // Reset all tileset styles to default
            const tilesets = new Set<Cesium.Cesium3DTileset>();
            sceneData.features.forEach(f => {
                if (f.cesiumObject?.tileset) {
                    tilesets.add(f.cesiumObject.tileset);
                }
            });
            
            tilesets.forEach(tileset => {
                tileset.style = undefined; // Remove custom style
            });
            console.log(`Reset ${tilesets.size} tileset styles to default`);
            
            // Note: We rely on tileset.style reset for persistent changes
            // Direct color manipulation is removed to avoid conflicts with style
            sceneData.features.forEach(f => {
                if (f.cesiumObject) {
                    totalInstances++;
                }
            });
            
            return { 
                success: true, 
                message: `Successfully reset opacity for all features (${totalInstances} instances)` 
            };
        } finally {
            setLoading(false);
        }
    }, [sceneData.features]);

    // get feature info
    const getFeatureInfo = useCallback(async (elementId: number) => {
        const feature = findFeature(elementId);
        if (!feature) {
            throw new Error(`Feature with elementId '${elementId}' not found`);
        }

        const info = {
            elementId: feature.elementId,
            properties: feature.properties,
            description: feature.description,
            boundingBox: feature.boundingBox,
            isSelected: selectedFeatures.has(elementId),
            isHighlighted: highlightedFeatures.has(elementId)
        };

        return { 
            success: true, 
            data: info,
            message: `Feature info for ${elementId}` 
        };
    }, [findFeature, selectedFeatures, highlightedFeatures]);

    // search features
    const searchFeatures = useCallback(async (query: string) => {
        const results = sceneData.features.filter(feature => {
            const propertyMatch = Object.values(feature.properties).some(value => 
                String(value).toLowerCase().includes(query.toLowerCase())
            );
            
            const descriptionMatch = feature.description && 
                feature.description.toLowerCase().includes(query.toLowerCase());
            
            return propertyMatch || descriptionMatch;
        });

        return { 
            success: true, 
            data: results,
            message: `Found ${results.length} features matching "${query}"` 
        };
    }, [sceneData.features]);

    return {
        // state
        features: sceneData.features,
        selectedFeatures: Array.from(selectedFeatures),
        highlightedFeatures: Array.from(highlightedFeatures),
        loading,
        
        // control methods
        setFeatureVisibility,
        selectFeature,
        deselectFeature,
        clearSelection,
        highlightFeature,
        removeHighlight,
        clearHighlights,
        setFeatureOpacity,
        isolateFeatures,
        resetAllOpacity,
        getFeatureInfo,
        searchFeatures,
        
        // utility methods
        findFeature,
        findFeaturesByProperty,
        findFeaturesByCategory
    };
};

export const createFeatureControlTool = (featureControl: ReturnType<typeof useFeatureControl>) => {
    // Generate dynamic description with sample data
    const sampleFeatures = featureControl.features.slice(0, 3);
    const sampleDescription = sampleFeatures.length > 0 
        ? `\nSample features: ${sampleFeatures.map(f => `${f.elementId} (${f.properties.name || f.properties.Type || 'Unknown'})`).join(', ')}`
        : '';

    return tool(
        async (params: z.infer<ReturnType<typeof z.object>>) => {
            const { action, elementId, elementIds, query, property, value, category, opacity } = params;
            try {
                console.log(`🎯 Feature control tool:`, { action, elementId, elementIds, query, property, value, category });

                switch (action.toLowerCase()) {
                    case 'select': {
                        if (!elementId) throw new Error("elementId is required");
                        const result = await featureControl.selectFeature(elementId);
                        return result.message;
                    }

                    case 'deselect': {
                        if (!elementId) throw new Error("elementId is required");
                        const result = await featureControl.deselectFeature(elementId);
                        return result.message;
                    }

                    case 'clearselection': {
                        const result = await featureControl.clearSelection();
                        return result.message;
                    }

                    case 'highlight': {
                        if (elementIds && elementIds.length > 0) {
                            // Batch highlight multiple features
                            const results = await Promise.all(
                                elementIds.map((id: number) => featureControl.highlightFeature(id))
                            );
                            const successCount = results.filter(r => r.success).length;
                            return `Successfully highlighted ${successCount} out of ${elementIds.length} features`;
                        } else if (elementId) {
                            // Single feature highlight
                            const result = await featureControl.highlightFeature(elementId);
                            return result.message;
                        } else {
                            throw new Error("elementId or elementIds is required");
                        }
                    }

                    case 'removehighlight': {
                        if (!elementId) throw new Error("elementId is required");
                        const result = await featureControl.removeHighlight(elementId);
                        return result.message;
                    }

                    case 'clearhighlights': {
                        const result = await featureControl.clearHighlights();
                        return result.message;
                    }

                    case 'setopacity': {
                        if (!elementId) throw new Error("elementId is required");
                        const opacityValue = Number(opacity);
                        if (isNaN(opacityValue)) throw new Error("opacity must be a number between 0 and 1");
                        const result = await featureControl.setFeatureOpacity(elementId, opacityValue);
                        return result.message;
                    }

                    case 'isolate': {
                        if (!elementIds || elementIds.length === 0) throw new Error("elementIds array is required");
                        const result = await featureControl.isolateFeatures(elementIds);
                        return result.message;
                    }

                    case 'resetopacity': {
                        const result = await featureControl.resetAllOpacity();
                        return result.message;
                    }

                    case 'show': {
                        if (!elementId) throw new Error("elementId is required");
                        const result = await featureControl.setFeatureVisibility(elementId, true);
                        return result.message;
                    }

                    case 'hide': {
                        if (!elementId) throw new Error("elementId is required");
                        const result = await featureControl.setFeatureVisibility(elementId, false);
                        return result.message;
                    }

                    case 'info': {
                        if (!elementId) throw new Error("elementId is required");
                        const result = await featureControl.getFeatureInfo(elementId);
                        return `${result.message}\n${JSON.stringify(result.data, null, 2)}`;
                    }

                    case 'search': {
                        if (!query) throw new Error("query is required");
                        const result = await featureControl.searchFeatures(query);
                        return `${result.message}\nFound features: ${result.data.map(f => f.elementId).join(', ')}`;
                    }

                    case 'findbyproperty': {
                        if (!property || !value) throw new Error("property and value are required");
                        const features = featureControl.findFeaturesByProperty(property, value);
                        return `Found ${features.length} features with ${property} containing "${value}": ${features.map(f => f.elementId).join(', ')}`;
                    }

                    case 'findbycategory': {
                        if (!category) throw new Error("category is required");
                        const features = featureControl.findFeaturesByCategory(category);
                        return `Found ${features.length} features in category "${category}": ${features.map(f => f.elementId).join(', ')}`;
                    }

                    case 'list': {
                        const features = featureControl.features;
                        if (features.length === 0) {
                            return "No features available";
                        }

                        const featureList = features.slice(0, 10).map(feature => {
                            const name = feature.properties.name as string || feature.properties.Type as string || `Feature ${feature.elementId}`;
                            const category = feature.properties.subcategory as string || 'Unknown';
                            return `${feature.elementId}: ${name} (${category})`;
                        }).join('\n');

                        const moreText = features.length > 10 ? `\n... and ${features.length - 10} more features` : '';
                        return `Available features (showing first 10):\n${featureList}${moreText}`;
                    }

                    default:
                        throw new Error(`Unknown action: ${action}`);
                }
            } catch (error) {
                return `❌ ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        },
        {
            name: "featureControl",
            description: `Control individual features in the 3D scene.${sampleDescription}

Available Actions:
- select: Select a specific feature
- deselect: Deselect a specific feature
- clearSelection: Clear all selections
- highlight: Highlight a specific feature
- removeHighlight: Remove highlight from a feature
- clearHighlights: Clear all highlights
- show: Show a specific feature
- hide: Hide a specific feature
- info: Get detailed info about a feature
- search: Search features by text
- findbyproperty: Find features by property value
- findbycategory: Find features by category
- list: List available features

Examples:
- "select feature 123" → action: "select", elementId: 123
- "highlight 104973" → action: "highlight", elementId: 104973
- "search for pumps" → action: "search", query: "pumps"
- "find equipment in mechanical" → action: "findbycategory", category: "mechanical"`,
            schema: z.object({
                action: z.enum([
                    "select", "deselect", "clearselection",
                    "highlight", "removeHighlight", "clearhighlights",
                    "setopacity", "isolate", "resetopacity",
                    "show", "hide", "info", "search",
                    "findbyproperty", "findbycategory", "list"
                ]).describe("Action to perform"),
                elementId: z.number().optional().describe("Target feature element ID"),
                elementIds: z.array(z.number()).optional().describe("Multiple feature element IDs"),
                query: z.string().optional().describe("Search query text"),
                property: z.string().optional().describe("Property name to search"),
                value: z.string().optional().describe("Property value to match"),
                category: z.string().optional().describe("Category to filter by"),
                opacity: z.number().optional().describe("Opacity value between 0 and 1")
            })
        }
    );
}; 