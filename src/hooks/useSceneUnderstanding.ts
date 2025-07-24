import { useCallback, useRef, useState } from 'react';
import * as Cesium from 'cesium';

// Scene understanding system for AI context
export const useSceneUnderstanding = () => {
    const [sceneData, setSceneData] = useState<{
        layers: Array<{
            id: string;
            name: string;
            type: string;
            visible: boolean;
            metadata?: Record<string, unknown>;
        }>;
        features: Array<{
            elementId: number;
            properties: Record<string, unknown>;
            boundingBox?: {
                center: Cesium.Cartesian3;
                radius: number;
            };
            description?: string;
        }>;
        sceneOverview: {
            totalLayers: number;
            totalFeatures: number;
            sceneType: string;
            boundingSphere?: Record<string, unknown>;
        };
    }>({
        layers: [],
        features: [],
        sceneOverview: { totalLayers: 0, totalFeatures: 0, sceneType: '' }
    });

    const viewerRef = useRef<Cesium.Viewer | null>(null);
    const featuresMapRef = useRef<Map<number, Cesium.Cesium3DTileFeature>>(new Map());
    const layersMapRef = useRef<Map<string, Cesium.Cesium3DTileset | Cesium.DataSource | Cesium.ImageryLayer>>(new Map());

    // Scan entire scene and collect all information for AI
    const scanScene = useCallback(async (viewer: Cesium.Viewer) => {
        if (!viewer || !viewer.scene) return;
        
        viewerRef.current = viewer;
        const scene = viewer.scene;
        const collectedLayers: Array<{
            id: string;
            name: string;
            type: string;
            visible: boolean;
            metadata?: Record<string, unknown>;
        }> = [];
        const collectedFeatures: Array<{
            elementId: number;
            properties: Record<string, unknown>;
            boundingBox?: {
                center: Cesium.Cartesian3;
                radius: number;
            };
            description?: string;
        }> = [];
        
        console.log('🔍 Starting comprehensive scene scan for AI...');
        
        // 1. Scan all layers (primitives, datasources, etc.)
        const scanLayers = () => {
            // Scan primitives
            if (scene.primitives) {
                for (let i = 0; i < scene.primitives.length; i++) {
                    const primitive = scene.primitives.get(i);
                    if (primitive instanceof Cesium.Cesium3DTileset) {
                        const layerInfo = {
                            id: `tileset_${i}`,
                            name: `Tileset ${i + 1}`,
                            type: '3DTileset',
                            visible: primitive.show,
                            metadata: {
                                assetId: primitive.asset?.assetId,
                                url: (primitive as Cesium.Cesium3DTileset & { url?: string }).url || 'Unknown',
                                colorBlendMode: primitive.colorBlendMode,
                                boundingSphere: primitive.boundingSphere ? {
                                    center: primitive.boundingSphere.center,
                                    radius: primitive.boundingSphere.radius
                                } : null,
                                constructor: primitive.constructor.name
                            }
                        };
                        
                        collectedLayers.push(layerInfo);
                        layersMapRef.current.set(layerInfo.id, primitive);
                        
                        // Set up feature loading listeners for this tileset
                        setupFeatureCollection(primitive, collectedFeatures);
                    }
                    // Add other primitive types as needed
                }
            }
            
            // Scan data sources
            if (viewer.dataSources) {
                for (let i = 0; i < viewer.dataSources.length; i++) {
                    const dataSource = viewer.dataSources.get(i);
                    const layerInfo = {
                        id: `datasource_${i}`,
                        name: dataSource.name || `DataSource ${i + 1}`,
                        type: 'DataSource',
                        visible: dataSource.show,
                        metadata: {
                            entityCount: dataSource.entities.values.length,
                            constructor: dataSource.constructor.name
                        }
                    };
                    
                    collectedLayers.push(layerInfo);
                    layersMapRef.current.set(layerInfo.id, dataSource);
                }
            }
            
            // Scan imagery layers if available
            if (viewer.imageryLayers) {
                for (let i = 0; i < viewer.imageryLayers.length; i++) {
                    const imageryLayer = viewer.imageryLayers.get(i);
                    const layerInfo = {
                        id: `imagery_${i}`,
                        name: `${imageryLayer.imageryProvider.constructor.name} Layer`,
                        type: 'ImageryLayer',
                        visible: imageryLayer.show,
                        metadata: {
                            providerType: imageryLayer.imageryProvider.constructor.name,
                            alpha: imageryLayer.alpha
                        }
                    };
                    
                    collectedLayers.push(layerInfo);
                    layersMapRef.current.set(layerInfo.id, imageryLayer);
                }
            }
        };
        
        // 2. Setup feature collection for tilesets
        const setupFeatureCollection = (tileset: Cesium.Cesium3DTileset, featuresArray: Array<{
            elementId: number;
            properties: Record<string, unknown>;
            boundingBox?: {
                center: Cesium.Cartesian3;
                radius: number;
            };
            description?: string;
        }>) => {
            // Listen for tile loading to collect features
            tileset.tileLoad.addEventListener((tile: Cesium.Cesium3DTile) => {
                processTileFeatures(tile, (feature: Cesium.Cesium3DTileFeature) => {
                    const elementId = Number(feature.getProperty("element"));
                    if (elementId && !featuresMapRef.current.has(elementId)) {
                        
                        // Collect all properties
                        const properties: Record<string, unknown> = {};
                        const propertyIds = feature.getPropertyIds();
                        propertyIds.forEach(id => {
                            properties[id] = feature.getProperty(id);
                        });
                        
                        // Try to get bounding information
                        let boundingBox;
                        if (tile.boundingSphere) {
                            boundingBox = {
                                center: tile.boundingSphere.center,
                                radius: tile.boundingSphere.radius
                            };
                        }
                        
                        const featureInfo = {
                            elementId,
                            properties,
                            boundingBox,
                            description: generateFeatureDescription(properties)
                        };
                        
                        featuresArray.push(featureInfo);
                        featuresMapRef.current.set(elementId, feature);
                    }
                });
            });
        };
        
        // 3. Helper function to process tile features
        const processTileFeatures = (tile: Cesium.Cesium3DTile, callback: (feature: Cesium.Cesium3DTileFeature) => void) => {
            const content = tile.content;
            const innerContents = content.innerContents;
            if (Cesium.defined(innerContents)) {
                for (let i = 0; i < innerContents.length; i++) {
                    processContentFeatures(innerContents[i], callback);
                }
            } else {
                processContentFeatures(content, callback);
            }
        };
        
        // 4. Helper function to process content features
        const processContentFeatures = (content: Cesium.Cesium3DTileContent, callback: (feature: Cesium.Cesium3DTileFeature) => void) => {
            const featuresLength = content.featuresLength;
            for (let i = 0; i < featuresLength; i++) {
                const feature = content.getFeature(i);
                callback(feature);
            }
        };
        
        // 5. Generate human-readable description for features
        const generateFeatureDescription = (properties: Record<string, unknown>): string => {
            const descriptions: string[] = [];
            
            // Common property mappings for industrial/BIM models
            if (properties.name) descriptions.push(`Name: ${properties.name}`);
            if (properties.type) descriptions.push(`Type: ${properties.type}`);
            if (properties.category) descriptions.push(`Category: ${properties.category}`);
            if (properties.material) descriptions.push(`Material: ${properties.material}`);
            if (properties.function) descriptions.push(`Function: ${properties.function}`);
            if (properties.system) descriptions.push(`System: ${properties.system}`);
            if (properties.level) descriptions.push(`Level: ${properties.level}`);
            if (properties.room) descriptions.push(`Room: ${properties.room}`);
            if (properties.manufacturer) descriptions.push(`Manufacturer: ${properties.manufacturer}`);
            if (properties.model) descriptions.push(`Model: ${properties.model}`);
            
            return descriptions.length > 0 ? descriptions.join(', ') : 'No description available';
        };
        
        // Execute scanning
        scanLayers();
        
        // Wait a bit for initial tiles to load
        setTimeout(() => {
            const sceneOverview = {
                totalLayers: collectedLayers.length,
                totalFeatures: collectedFeatures.length,
                sceneType: determineSceneType(collectedLayers, collectedFeatures),
                boundingSphere: { position: scene.camera.position }
            };
            
            setSceneData({
                layers: collectedLayers,
                features: collectedFeatures,
                sceneOverview
            });
            
            console.log(`✅ Scene scan completed:`, {
                layers: collectedLayers.length,
                features: collectedFeatures.length,
                sceneType: sceneOverview.sceneType
            });
        }, 3000); // Wait 3 seconds for tiles to load
        
    }, []);
    
    // Determine what type of scene this is based on collected data
    const determineSceneType = (layers: Array<{
        id: string;
        name: string;
        type: string;
        visible: boolean;
        metadata?: Record<string, unknown>;
    }>, features: Array<{
        elementId: number;
        properties: Record<string, unknown>;
        boundingBox?: {
            center: Cesium.Cartesian3;
            radius: number;
        };
        description?: string;
    }>): string => {
        if (features.length > 0) {
            // Analyze feature properties to determine scene type
            const sampleFeature = features[0];
            const props = sampleFeature.properties;
            
            if (props.system || props.equipment || props.pipe) return 'Industrial/Plant';
            if (props.floor || props.room || props.wall) return 'Building/Architecture';
            if (props.road || props.bridge || props.infrastructure) return 'Infrastructure';
            return 'BIM/Engineering Model';
        }
        
        if (layers.some(l => l.type === '3DTileset')) return '3D Model Scene';
        if (layers.some(l => l.type === 'ImageryLayer')) return 'Geographic Scene';
        return 'General 3D Scene';
    };
    
    // Get feature information by element ID (for AI context)
    const getFeatureContext = useCallback((elementId: number) => {
        const features = sceneData.features.filter(f => f.elementId === elementId);
        if (features.length === 0) return null;
        
        const feature = features[0];
        return {
            elementId: feature.elementId,
            properties: feature.properties,
            description: feature.description,
            nearbyFeatures: getNearbyFeatures(elementId, 5) // Get 5 nearby features
        };
    }, [sceneData.features]);
    
    // Get nearby features for context (simplified version)
    const getNearbyFeatures = useCallback((elementId: number, count: number = 3) => {
        // This is a simplified version - in reality you'd use spatial indexing
        const allFeatures = sceneData.features;
        const currentIndex = allFeatures.findIndex(f => f.elementId === elementId);
        
        if (currentIndex === -1) return [];
        
        const nearby = [];
        const start = Math.max(0, currentIndex - Math.floor(count / 2));
        const end = Math.min(allFeatures.length, start + count);
        
        for (let i = start; i < end; i++) {
            if (i !== currentIndex) {
                nearby.push({
                    elementId: allFeatures[i].elementId,
                    description: allFeatures[i].description
                });
            }
        }
        
        return nearby;
    }, [sceneData.features]);
    
    // Generate comprehensive scene summary for AI
    const getSceneSummary = useCallback(() => {
        const { layers, features, sceneOverview } = sceneData;
        
        const summary = {
            overview: `This is a ${sceneOverview.sceneType} with ${sceneOverview.totalLayers} layers and ${sceneOverview.totalFeatures} interactive features.`,
            layers: layers.map(l => ({
                name: l.name,
                type: l.type,
                visible: l.visible,
                description: `${l.type} layer: ${l.name}`
            })),
            featuresPreview: features.slice(0, 10).map(f => ({ // First 10 features as preview
                elementId: f.elementId,
                description: f.description
            })),
            capabilities: [
                'Layer visibility control',
                'Feature selection and highlighting',
                'Property inspection',
                'Spatial navigation'
            ]
        };
        
        return summary;
    }, [sceneData]);
    
    return {
        sceneData,
        scanScene,
        getFeatureContext,
        getNearbyFeatures,
        getSceneSummary,
        featuresMapRef,
        layersMapRef
    };
};