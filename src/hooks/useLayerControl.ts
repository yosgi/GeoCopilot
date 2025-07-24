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
    const viewerRef = useRef<Cesium.Viewer | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);

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

    // Auto-detect and register Cesium objects
    const startAutoDetection = useCallback((viewer: Cesium.Viewer) => {
        // Prevent starting auto-detection on the same viewer multiple times
        if (viewerRef.current === viewer) {
            return cleanupRef.current || (() => { }); // Return existing cleanup function
        }

        // Clean up any existing detection
        if (cleanupRef.current) {
            cleanupRef.current();
        }

        viewerRef.current = viewer;

        // complete scan all cesium objects
        const scanAllCesiumObjects = () => {
            if (!viewerRef.current || !viewerRef.current.scene) {
                console.log('❌ No viewer or scene available');
                return;
            }

            const viewer = viewerRef.current;
            const scene = viewer.scene;

            console.log('🔍 Starting complete scan...');
            console.log('Globe enabled:', !!viewer.scene.globe);

            // Scan all primitives
            const scanPrimitives = () => {
                if (!scene.primitives) {
                    console.log('❌ No primitives collection');
                    return;
                }

                console.log(`📦 Scanning ${scene.primitives.length} primitives...`);

                for (let i = 0; i < scene.primitives.length; i++) {
                    const primitive = scene.primitives.get(i);
                    console.log(`Primitive ${i}:`, primitive.constructor.name, primitive);

                    let id = '';
                    let name = '';
                    let type = '';
                    let metadata = {};

                    if (primitive instanceof Cesium.Cesium3DTileset) {
                        const assetId = primitive.asset?.assetId;
                        const url = (primitive as Cesium.Cesium3DTileset & { url?: string }).url || 'Unknown';

                        id = `tileset_${i}`;
                        name = assetId ? `Tileset ${assetId}` : `Tileset ${i + 1}`;
                        type = '3DTileset';
                        metadata = {
                            name,
                            type,
                            assetId,
                            url,
                            description: `Auto-detected 3D Tileset`,
                            colorBlendMode: primitive.colorBlendMode,
                            boundingSphere: primitive.boundingSphere ? {
                                center: primitive.boundingSphere.center,
                                radius: primitive.boundingSphere.radius
                            } : null
                        };
                        console.log(`✅ Found 3D Tileset: ${name} (${id})`);

                    } else if (primitive instanceof Cesium.Model) {
                        id = `model_${i}`;
                        name = `Model ${i + 1}`;
                        type = 'Model';
                        metadata = {
                            name,
                            type,
                            description: 'Auto-detected 3D Model',
                            url: (primitive as Cesium.Model & { url?: string }).url || 'Unknown'
                        };
                        console.log(`✅ Found Model: ${name} (${id})`);

                    } else if (primitive instanceof Cesium.PointPrimitiveCollection) {
                        id = `points_${i}`;
                        name = `Points ${i + 1}`;
                        type = 'Points';
                        metadata = {
                            name,
                            type,
                            description: 'Auto-detected Point Collection',
                            length: primitive.length
                        };
                        console.log(`✅ Found Points: ${name} (${id}), count: ${primitive.length}`);

                    } else if (primitive instanceof Cesium.PolylineCollection) {
                        id = `polylines_${i}`;
                        name = `Polylines ${i + 1}`;
                        type = 'Polylines';
                        metadata = {
                            name,
                            type,
                            description: 'Auto-detected Polyline Collection',
                            length: primitive.length
                        };
                        console.log(`✅ Found Polylines: ${name} (${id}), count: ${primitive.length}`);

                    } else if (primitive instanceof Cesium.BillboardCollection) {
                        id = `billboards_${i}`;
                        name = `Billboards ${i + 1}`;
                        type = 'Billboards';
                        metadata = {
                            name,
                            type,
                            description: 'Auto-detected Billboard Collection',
                            length: primitive.length
                        };
                        console.log(`✅ Found Billboards: ${name} (${id}), count: ${primitive.length}`);

                    } else if (primitive instanceof Cesium.LabelCollection) {
                        id = `labels_${i}`;
                        name = `Labels ${i + 1}`;
                        type = 'Labels';
                        metadata = {
                            name,
                            type,
                            description: 'Auto-detected Label Collection',
                            length: primitive.length
                        };
                        console.log(`✅ Found Labels: ${name} (${id}), count: ${primitive.length}`);

                    } else if (primitive instanceof Cesium.PrimitiveCollection) {
                        // 递归扫描嵌套的 PrimitiveCollection
                        console.log(`🔄 Found nested PrimitiveCollection with ${primitive.length} items`);
                        for (let j = 0; j < primitive.length; j++) {
                            const nestedPrimitive = primitive.get(j);
                            console.log(`  Nested primitive ${j}:`, nestedPrimitive.constructor.name);
                        }
                        continue; // 跳过注册 PrimitiveCollection 本身

                    } else {
                        // 处理其他未知的 primitive 类型
                        id = `primitive_${i}`;
                        name = `${primitive.constructor.name} ${i + 1}`;
                        type = primitive.constructor.name;
                        metadata = {
                            name,
                            type,
                            description: `Auto-detected ${primitive.constructor.name}`,
                            constructor: primitive.constructor.name
                        };
                        console.log(`⚠️ Found unknown primitive: ${primitive.constructor.name} (${id})`);
                    }

                    // 检查是否已注册
                    if (id && !cesiumObjectsRef.current.has(id)) {
                        registerObject(id, primitive, metadata);
                        console.log(`📝 Registered: ${id}`);
                    } else if (id) {
                        console.log(`⏭️ Already registered: ${id}`);
                    }
                }
            };

            // Scan DataSources
            const scanDataSources = () => {
                if (!viewer.dataSources) {
                    console.log('❌ No dataSources collection');
                    return;
                }

                console.log(`📊 Scanning ${viewer.dataSources.length} data sources...`);

                for (let i = 0; i < viewer.dataSources.length; i++) {
                    const dataSource = viewer.dataSources.get(i);
                    const id = `datasource_${i}`;
                    const name = dataSource.name || `DataSource ${i + 1}`;
                    const type = 'DataSource';

                    console.log(`DataSource ${i}:`, dataSource.constructor.name, `"${name}"`, `entities: ${dataSource.entities.values.length}`);

                    const metadata = {
                        name,
                        type,
                        description: `Auto-detected ${dataSource.constructor.name}`,
                        entityCount: dataSource.entities.values.length,
                        clustering: dataSource.clustering?.enabled || false,
                        constructor: dataSource.constructor.name
                    };

                    if (!cesiumObjectsRef.current.has(id)) {
                        registerObject(id, dataSource, metadata);
                        console.log(`📝 Registered DataSource: ${id}`);
                    }
                }
            };

            // Scan ImageryLayers (only when globe is enabled)
            const scanImageryLayers = () => {
                if (!viewer.imageryLayers) {
                    console.log('⚠️ No imageryLayers collection (globe may be disabled)');
                    return;
                }

                console.log(`🗺️ Scanning ${viewer.imageryLayers.length} imagery layers...`);

                for (let i = 0; i < viewer.imageryLayers.length; i++) {
                    const imageryLayer = viewer.imageryLayers.get(i);
                    const id = `imagery_${i}`;
                    const type = 'ImageryLayer';

                    // 获取 provider 信息
                    const provider = imageryLayer.imageryProvider;
                    const providerType = provider.constructor.name;
                    const displayName = `${providerType} Layer`;

                    console.log(`ImageryLayer ${i}:`, providerType, `alpha: ${imageryLayer.alpha}`, `show: ${imageryLayer.show}`);

                    const metadata = {
                        name: displayName,
                        type,
                        description: `Auto-detected ${providerType} Imagery Layer`,
                        providerType: providerType,
                        alpha: imageryLayer.alpha,
                        brightness: imageryLayer.brightness,
                        contrast: imageryLayer.contrast,
                        show: imageryLayer.show
                    };

                    if (!cesiumObjectsRef.current.has(id)) {
                        registerObject(id, imageryLayer, metadata);
                        console.log(`📝 Registered ImageryLayer: ${id}`);
                    }
                }
            };

            // Scan TerrainProvider (only when globe is enabled)
            const scanTerrain = () => {
                if (!viewer.terrainProvider) {
                    console.log('⚠️ No terrainProvider (globe may be disabled)');
                    return;
                }

                const terrainProvider = viewer.terrainProvider;
                const id = 'terrain';
                const providerType = terrainProvider.constructor.name;
                const displayName = `${providerType} Terrain`;

                console.log(`🏔️ Found terrain provider:`, providerType);

                const metadata = {
                    name: displayName,
                    type: 'TerrainProvider',
                    description: `Auto-detected ${displayName}`,
                    providerType: providerType,
                    hasWaterMask: terrainProvider.hasWaterMask,
                    hasVertexNormals: terrainProvider.hasVertexNormals
                };

                if (!cesiumObjectsRef.current.has(id)) {
                    registerObject(id, terrainProvider, metadata);
                    console.log(`📝 Registered TerrainProvider: ${id}`);
                }
            };

            // Scan PostProcessStages
            const scanPostProcessStages = () => {
                if (!scene.postProcessStages) {
                    console.log('❌ No postProcessStages');
                    return;
                }

                const stages = scene.postProcessStages;
                console.log(`✨ Scanning post-process stages...`);

                // Scan built-in post-process effects
                const builtInStages = [
                    { stage: stages.fxaa, name: 'FXAA', id: 'fxaa' },
                    { stage: stages.bloom, name: 'Bloom', id: 'bloom' },
                    { stage: stages.ambientOcclusion, name: 'Ambient Occlusion', id: 'ssao' }
                ];

                builtInStages.forEach(({ stage, name, id }) => {
                    if (stage) {
                        console.log(`Found built-in stage: ${name}, enabled: ${stage.enabled}`);
                        const metadata = {
                            name,
                            type: 'PostProcessStage',
                            description: `Built-in ${name} Effect`,
                            enabled: stage.enabled,
                            constructor: stage.constructor.name
                        };

                        if (!cesiumObjectsRef.current.has(id)) {
                            registerObject(id, stage, metadata);
                            console.log(`📝 Registered PostProcessStage: ${id}`);
                        }
                    }
                });

                // Scan custom post-process stages
                console.log(`Custom post-process stages count: ${stages.length}`);
                for (let i = 0; i < stages.length; i++) {
                    const stage = stages.get(i);
                    const id = `postprocess_custom_${i}`;
                    const name = `Custom Post Process ${i + 1}`;

                    console.log(`Custom stage ${i}:`, stage.constructor.name, `enabled: ${stage.enabled}`);

                    const metadata = {
                        name,
                        type: 'PostProcessStage',
                        description: `Custom ${stage.constructor.name}`,
                        enabled: stage.enabled,
                        constructor: stage.constructor.name
                    };

                    if (!cesiumObjectsRef.current.has(id)) {
                        registerObject(id, stage, metadata);
                        console.log(`📝 Registered Custom PostProcessStage: ${id}`);
                    }
                }
            };

            // Scan Entities (entities in the scene)
            const scanEntities = () => {
                if (!viewer.entities || viewer.entities.values.length === 0) {
                    console.log('📍 No entities found');
                    return;
                }

                console.log(`📍 Scanning ${viewer.entities.values.length} entities...`);

                // Group entities by type
                const entityGroups: Record<string, Cesium.Entity[]> = {};

                viewer.entities.values.forEach((entity) => {
                    const types = [];
                    if (entity.billboard) types.push('billboard');
                    if (entity.point) types.push('point');
                    if (entity.polyline) types.push('polyline');
                    if (entity.polygon) types.push('polygon');
                    if (entity.model) types.push('model');
                    if (entity.label) types.push('label');
                    if (entity.box) types.push('box');
                    if (entity.cylinder) types.push('cylinder');
                    if (entity.ellipse) types.push('ellipse');
                    if (entity.ellipsoid) types.push('ellipsoid');
                    if (entity.corridor) types.push('corridor');
                    if (entity.wall) types.push('wall');
                    if (entity.rectangle) types.push('rectangle');

                    const entityType = types.length > 0 ? types.join('+') : 'unknown';

                    if (!entityGroups[entityType]) {
                        entityGroups[entityType] = [];
                    }
                    entityGroups[entityType].push(entity);
                });

                // Create layers for each entity type group
                Object.entries(entityGroups).forEach(([entityType, entities]) => {
                    const id = `entities_${entityType}`;
                    const name = `Entities (${entityType})`;
                    const type = 'EntityGroup';

                    console.log(`Found entity group: ${entityType}, count: ${entities.length}`);

                    const metadata = {
                        name,
                        type,
                        description: `Auto-detected ${entityType} entities`,
                        entityType,
                        entityCount: entities.length,
                        entities: entities // save entity references for control
                    };

                    if (!cesiumObjectsRef.current.has(id)) {
                        // Create a virtual object to control this group of entities
                        const entityController = {
                            show: true,
                            entities: entities,
                            setShow: (visible: boolean) => {
                                entities.forEach(entity => {
                                    entity.show = visible;
                                });
                            }
                        };

                        registerObject(id, entityController, metadata);
                        console.log(`📝 Registered EntityGroup: ${id}`);
                    }
                });
            };

            // Scan Globe (if enabled)
            const scanGlobe = () => {
                if (!viewer.scene.globe) {
                    console.log('🌍 Globe is disabled');
                    return;
                }

                const globe = viewer.scene.globe;
                const id = 'globe';
                const name = 'Globe';
                const type = 'Globe';

                console.log('🌍 Found Globe');

                const metadata = {
                    name,
                    type,
                    description: 'Auto-detected Globe',
                    show: globe.show,
                    enableLighting: globe.enableLighting,
                    dynamicAtmosphereLighting: globe.dynamicAtmosphereLighting,
                    showWaterEffect: globe.showWaterEffect,
                    constructor: globe.constructor.name
                };

                if (!cesiumObjectsRef.current.has(id)) {
                    registerObject(id, globe, metadata);
                    console.log(`📝 Registered Globe: ${id}`);
                }
            };

            // Execute all scans
            try {
                scanPrimitives();
                scanDataSources();
                scanImageryLayers();
                scanTerrain();
                scanPostProcessStages();
                scanEntities();
                scanGlobe();

                console.log(`🔍 Complete scan finished, total objects found: ${cesiumObjectsRef.current.size}`);
                console.log('📋 Summary:', Array.from(cesiumObjectsRef.current.keys()));

            } catch (error) {
                console.error('❌ Error during scan:', error);
            }
        };
        // Initial scan
        scanAllCesiumObjects();

        // Set up periodic scanning for new primitives
        const interval = setInterval(scanAllCesiumObjects, 5000); // Scan every 5 seconds

        // Create and store cleanup function
        const cleanup = () => {
            clearInterval(interval);
            cleanupRef.current = null;
        };
        cleanupRef.current = cleanup;

        // Return cleanup function
        return cleanup;
    }, [registerObject]);

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

        // auto-detection method
        startAutoDetection,

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