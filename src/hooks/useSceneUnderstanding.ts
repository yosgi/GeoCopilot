import { useCallback, useRef, useState, useEffect } from 'react';
import * as Cesium from 'cesium';
// import axios from "axios";
// import { SemanticOntologyGenerator } from '../mock/SemanticOntologyGenerator';

// Scene understanding system for AI context
export interface SceneData {
    layers: Array<{
      id: string;
      name: string;
      type: string;
      visible: boolean;
      metadata?: Record<string, unknown>;
      cesiumObject?: unknown;
      [key: string]: unknown;
    }>;
    features: Array<{
      elementId: number;
      properties: Record<string, unknown>;
      boundingBox?: {
        center: { x: number; y: number; z: number };
        radius: number;
      };
      description?: string;
      cesiumObject?: Cesium.Cesium3DTileFeature;
      [key: string]: unknown;
    }>;
    sceneOverview: {
      sceneType: string;
      totalLayers: number;
      totalFeatures: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }
export const useSceneUnderstanding = () => {
    const [sceneData, setSceneData] = useState<SceneData>({
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
        
        console.log('🔍 Starting comprehensive scene scan for AI...');
        

        const waitForSceneReady = async (viewer: Cesium.Viewer): Promise<void> => {
            return new Promise((resolve) => {

                if (viewer.scene.primitives.length > 0 || 
                    viewer.dataSources.length > 0 || 
                    viewer.imageryLayers.length > 1) { 
                    resolve();
                    return;
                }
                
                // wait for the first tileset to be ready   
                const checkForTilesets = () => {
                    if (viewer.scene.primitives.length > 0) {
                        for (let i = 0; i < viewer.scene.primitives.length; i++) {
                            const primitive = viewer.scene.primitives.get(i);
                            if (primitive instanceof Cesium.Cesium3DTileset) {
                                // wait for the tileset to be ready
                                if (primitive.root) {
                                    // wait for the next frame to ensure all content is rendered
                                    requestAnimationFrame(() => {
                                        resolve();
                                    });
                                } else {
                                    // if there is no root, wait for the next frame to ensure all content is rendered
                                    setTimeout(() => {
                                        if (primitive.root) {
                                            requestAnimationFrame(() => {
                                                resolve();
                                            });
                                        } else {
                                            resolve(); // continue after timeout
                                        }
                                    }, 1000);
                                }
                                return;
                            }
                        }
                    }
                    
                    // if there is no tileset, wait for the next frame to ensure all content is rendered
                    setTimeout(checkForTilesets, 100);
                };
                
                checkForTilesets();
            });
        };
        
        // wait for the scene to be ready
        await waitForSceneReady(viewer);
        
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
        
        // scan all layers
        const scanLayers = () => {
            console.log(`scanning scene state: primitives=${scene.primitives.length}, dataSources=${viewer.dataSources.length}`);
            
            // scan primitives
            if (scene.primitives) {
                for (let i = 0; i < scene.primitives.length; i++) {
                    const primitive = scene.primitives.get(i);
                    if (primitive instanceof Cesium.Cesium3DTileset) {
                        const layerInfo = {
                            id: `tileset_${i}`,
                            name: `Tileset ${i + 1}`,
                            type: '3DTileset',
                            visible: primitive.show,
                            cesiumObject: primitive,
                            metadata: {
                                assetId: primitive.asset?.assetId,
                                url: (primitive as Cesium.Cesium3DTileset & { url?: string }).url || 'Unknown',
                                colorBlendMode: primitive.colorBlendMode,
                                hasRoot: !!primitive.root,
                                tilesLoaded: primitive.tilesLoaded,
                                boundingSphere: primitive.boundingSphere ? {
                                    center: primitive.boundingSphere.center,
                                    radius: primitive.boundingSphere.radius
                                } : null,
                                constructor: primitive.constructor.name
                            }
                        };
                        
                        collectedLayers.push(layerInfo);
                        layersMapRef.current.set(layerInfo.id, primitive);
                        
                        // scan existing tiles
                        scanExistingTiles(primitive, collectedFeatures);
                        
                        // setup feature collection for future tiles
                        setupFeatureCollection(primitive, collectedFeatures);
                    }
                }
            }
            
            // scan data sources
            if (viewer.dataSources) {
                for (let i = 0; i < viewer.dataSources.length; i++) {
                    const dataSource = viewer.dataSources.get(i);
                    const layerInfo = {
                        id: `datasource_${i}`,
                        name: dataSource.name || `DataSource ${i + 1}`,
                        type: 'DataSource',
                        visible: dataSource.show,
                        cesiumObject: dataSource,
                        metadata: {
                            entityCount: dataSource.entities.values.length,
                            constructor: dataSource.constructor.name
                        }
                    };
                    
                    collectedLayers.push(layerInfo);
                    layersMapRef.current.set(layerInfo.id, dataSource);
                }
            }
            
            // scan imagery layers
            if (viewer.imageryLayers) {
                for (let i = 0; i < viewer.imageryLayers.length; i++) {
                    const imageryLayer = viewer.imageryLayers.get(i);
                    const layerInfo = {
                        id: `imagery_${i}`,
                        name: `${imageryLayer?.imageryProvider?.constructor?.name} Layer`,
                        type: 'ImageryLayer',
                        visible: imageryLayer.show,
                        cesiumObject: imageryLayer,
                        metadata: {
                            providerType: imageryLayer?.imageryProvider?.constructor?.name,
                            alpha: imageryLayer?.alpha
                        }
                    };
                    
                    collectedLayers.push(layerInfo);
                    layersMapRef.current.set(layerInfo.id, imageryLayer);
                }
            }
        };
        
        // scan existing tiles
        const scanExistingTiles = (tileset: Cesium.Cesium3DTileset, featuresArray: Array<{
            elementId: number;
            properties: Record<string, unknown>;
            boundingBox?: {
                center: Cesium.Cartesian3;
                radius: number;
            };
            description?: string;
        }>) => {
            if (!tileset.root) return;
            
            const tiles = getAllLoadedTiles(tileset);
            console.log(`number of loaded tiles: ${tiles.length}`);
            
            tiles.forEach(tile => {
                processTileFeatures(tile, (feature: Cesium.Cesium3DTileFeature) => {
                    const elementId = Number(feature.getProperty("element"));
                    if (!elementId || isNaN(elementId)) return;
                    
                    // check if the feature already exists
                    if (featuresMapRef.current.has(elementId)) return;
                    
                    const properties: Record<string, unknown> = {};
                    const propertyIds = feature.getPropertyIds();
                    propertyIds.forEach(id => {
                        properties[id] = feature.getProperty(id);
                    });
                    
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
                        description: generateFeatureDescription(properties),
                        cesiumObject: feature
                    };
                    
                    featuresArray.push(featureInfo);
                    featuresMapRef.current.set(elementId, feature);
                });
            });
        };
        
        // get all loaded tiles
        const getAllLoadedTiles = (tileset: Cesium.Cesium3DTileset): Cesium.Cesium3DTile[] => {
            const tiles: Cesium.Cesium3DTile[] = [];
            
            const traverseTile = (tile: Cesium.Cesium3DTile) => {
                if (tile.content && tile.content.featuresLength > 0) {
                    tiles.push(tile);
                }
                
                // traverse child tiles
                if (tile.children) {
                    tile.children.forEach(child => traverseTile(child));
                }
            };
            
            if (tileset.root) {
                traverseTile(tileset.root);
            }
            
            return tiles;
        };
        
        // setup feature collection for future tiles
        const setupFeatureCollection = (tileset: Cesium.Cesium3DTileset, featuresArray: Array<{
            elementId: number;
            properties: Record<string, unknown>;
            boundingBox?: {
                center: Cesium.Cartesian3;
                radius: number;
            };
            description?: string;
        }>) => {
            tileset.tileLoad.addEventListener(function (tile: Cesium.Cesium3DTile) {
                processTileFeatures(tile, (feature: Cesium.Cesium3DTileFeature) => {
                    const elementId = Number(feature.getProperty("element"));
                    if (!elementId || isNaN(elementId)) return;
                    
                    if (featuresMapRef.current.has(elementId)) return;
                    
                    const properties: Record<string, unknown> = {};
                    const propertyIds = feature.getPropertyIds();
                    propertyIds.forEach(id => {
                        properties[id] = feature.getProperty(id);
                    });
                    
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
                        description: generateFeatureDescription(properties),
                        cesiumObject: feature
                    };
                    
                    featuresArray.push(featureInfo);
                    featuresMapRef.current.set(elementId, feature);
                    
                    // update scene data in real time
                    updateSceneData(collectedLayers, featuresArray);
                });
            });
        };
        
        // process tile features
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
        
        // process content features
        const processContentFeatures = (content: Cesium.Cesium3DTileContent, callback: (feature: Cesium.Cesium3DTileFeature) => void) => {
            const featuresLength = content.featuresLength;
            for (let i = 0; i < featuresLength; i++) {
                const feature = content.getFeature(i);
                callback(feature);
            }
        };
        
        // generate feature description
        const generateFeatureDescription = (properties: Record<string, unknown>): string => {
            const parts = [];
            
            if (properties.name) parts.push(`Name: ${properties.name}`);
            if (properties.Type) parts.push(`Type: ${properties.Type}`);
            if (properties.subcategory) parts.push(`Category: ${properties.subcategory}`);
            if (properties.system) parts.push(`System: ${properties.system}`);
            if (properties.assembly) parts.push(`Assembly: ${properties.assembly}`);
            
            if (parts.length === 0) {
                return 'No description available';
            }
            
            return parts.join(', ');
        };
        
        // update scene data
        const updateSceneData = (layers: Array<{
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
        }>) => {
            const sceneOverview = {
                totalLayers: layers.length,
                totalFeatures: features.length,
                sceneType: determineSceneType(layers, features),
                boundingSphere: { position: scene?.camera?.position }
            };
            
            // console.log(`🎯 Scene scan update: ${layers.length} layers, ${features.length} features`);
            
            setSceneData({
                layers,
                features,
                sceneOverview
            });
        };
        
        // execute scan
        scanLayers();
        
        // initial update
        updateSceneData(collectedLayers, collectedFeatures);
        
    }, []);
    

    
    // listen for scene changes
    const createSceneChangeListener = useCallback((viewer: Cesium.Viewer) => {
        const rescanScene = () => {
            console.log('scene changed, rescanning...');
            scanScene(viewer);
        };
        
        // listen for primitives changes    
        viewer.scene.primitives.primitiveAdded.addEventListener(rescanScene);
        viewer.scene.primitives.primitiveRemoved.addEventListener(rescanScene);
        
        // listen for data source changes
        viewer.dataSources.dataSourceAdded.addEventListener(rescanScene);
        viewer.dataSources.dataSourceRemoved.addEventListener(rescanScene);
        
        // return cleanup function
        return () => {
            viewer.scene.primitives.primitiveAdded.removeEventListener(rescanScene);
            viewer.scene.primitives.primitiveRemoved.removeEventListener(rescanScene);
            viewer.dataSources.dataSourceAdded.removeEventListener(rescanScene);
            viewer.dataSources.dataSourceRemoved.removeEventListener(rescanScene);
        };
    }, [scanScene]);

    useEffect(() => {
        if (viewerRef.current) {
            createSceneChangeListener(viewerRef.current);
        }
    }, [viewerRef.current]);
    

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