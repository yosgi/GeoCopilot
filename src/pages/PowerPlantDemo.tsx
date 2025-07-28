import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { useGeoCopilot } from "../hooks/useGeoCopilot";

import { equipmentDatabaseService } from "../services/equipmentDatabase";
import { FloatingAIChat } from "../components/FloatingAIChat";

export interface SemanticData {
  element: string;
  subcategory: string;
  assembly?: string;
  Type: number;
  name: string;
  function: string;
  equipment_concept: string;
  domain: string;
  system: string;
  subsystem: string;
  diameter?: string;
  pressure_rating?: string;
  temperature_rating?: string;
  material?: string;
  pipe_schedule?: string;
  power_rating?: string;
  voltage?: string;
  applications?: string[];
  efficiency?: string;
  rpm?: number;
  heat_transfer_area?: string;
  effectiveness?: string;
  tube_material?: string;
  design_type?: string;
  operational_status: string;
  criticality_level: string;
  maintenance_strategy: string;
  inspection_requirements: string[];
  safety_class: string;
  applicable_codes: string[];
  functional_relationships: string[];
  tags: string[];
}



export const PowerPlantDemo = () => {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const elementMapRef = useRef<Record<number, Cesium.Cesium3DTileFeature[]>>({});

  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  const {
    loading,
    error,
    lastResponse,
    run,
    clearHistory,
    clarificationQuestions,
    sceneData,
    getAIContext,
    initialize,
    updateCapabilities,
    aiCapabilities
  } = useGeoCopilot(apiKey);



  const [hiddenElements] = useState<number[]>([
    112001, 113180, 131136, 113167, 71309, 109652, 111178, 113156, 113170, 124846,
    114076, 131122, 113179, 114325, 131134, 113164, 113153, 113179, 109656, 114095,
    114093, 39225, 39267, 113149, 113071, 112003, 39229, 113160, 39227, 39234,
    113985, 39230, 112004, 39223,
  ]);
  // const elementMapRef = useRef<Record<number, Cesium.Cesium3DTileFeature[]>>({});

  // const [hoveredElement, setHoveredElement] = useState<number | null>(null);

  // Cesium viewer and power plant model setup
  useEffect(() => {
    let handler: Cesium.ScreenSpaceEventHandler | undefined;
    let tileset: Cesium.Cesium3DTileset | undefined;
    let scene: Cesium.Scene | undefined;
    let viewer: Cesium.Viewer | null = null;
    let selectedFeature: Cesium.Cesium3DTileFeature | undefined;

    const unselectFeature = (feature?: Cesium.Cesium3DTileFeature) => {
      if (!Cesium.defined(feature)) return;
      const element = feature.getProperty("element");
      setElementColor(element, Cesium.Color.WHITE);
      if (feature === selectedFeature) {
        selectedFeature = undefined;
      }
    };

    const selectFeature = (feature: Cesium.Cesium3DTileFeature) => {
      const element = feature.getProperty("element");
      setElementColor(element, Cesium.Color.YELLOW);
      selectedFeature = feature;
    };

    const setElementColor = (element: number, color: Cesium.Color) => {
      const featuresToColor = elementMapRef.current[element];
      if (!featuresToColor) return;
      for (let i = 0; i < featuresToColor.length; ++i) {
        const feature = featuresToColor[i];
        feature.color = Cesium.Color.clone(color, feature.color);
      }
    };





    const unloadFeature = (feature: Cesium.Cesium3DTileFeature) => {
      unselectFeature(feature);
      const element = Number(feature.getProperty("element"));
      const features = elementMapRef.current[element];
      if (!features) return;
      const index = features.indexOf(feature);
      if (index > -1) {
        features.splice(index, 1);
      }
    };

    const loadFeature = (feature: Cesium.Cesium3DTileFeature) => {
      const element = Number(feature.getProperty("element"));
      let features = elementMapRef.current[element];
      if (!Cesium.defined(features)) {
        features = [];
        elementMapRef.current[element] = features;
      }
      features.push(feature);
      if (hiddenElements.indexOf(element) > -1) {
        feature.show = false;
      }
    };

    const processContentFeatures = (content: Cesium.Cesium3DTileContent, callback: (feature: Cesium.Cesium3DTileFeature) => void) => {
      const featuresLength = content.featuresLength;
      for (let i = 0; i < featuresLength; ++i) {
        const feature = content.getFeature(i);

        callback(feature);
      }
    };

    const processTileFeatures = (tile: Cesium.Cesium3DTile, callback: (feature: Cesium.Cesium3DTileFeature) => void) => {
      const content = tile.content;
      const innerContents = content.innerContents;
      if (Cesium.defined(innerContents)) {
        for (let i = 0; i < innerContents.length; ++i) {
          processContentFeatures(innerContents[i], callback);
        }
      } else {
        processContentFeatures(content, callback);
      }
    };

    const initViewer = async () => {
      if (cesiumContainerRef.current && !viewerRef.current) {
        viewer = new Cesium.Viewer(cesiumContainerRef.current);
        viewerRef.current = viewer;


        scene = viewer.scene;
        viewer.clock.currentTime = Cesium.JulianDate.fromIso8601("2022-08-01T00:00:00Z");

        try {
          tileset = await Cesium.Cesium3DTileset.fromIonAssetId(2464651);
          scene.primitives.add(tileset);
          viewer.zoomTo(
            tileset,
            new Cesium.HeadingPitchRange(0.5, -0.2, tileset.boundingSphere.radius * 4.0),
          );
          tileset.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.HIGHLIGHT;
          tileset.tileLoad.addEventListener(function (tile) {
            processTileFeatures(tile, loadFeature);
          });
          tileset.tileUnload.addEventListener(function (tile) {
            processTileFeatures(tile, unloadFeature);
          });
        } catch (error) {
          console.log(`Error loading tileset: ${error}`);
        }
        initialize(viewer);
        handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
        handler.setInputAction(async function (click: Cesium.ScreenSpaceEventHandler.PositionedEvent) {
          console.log('🖱️ Click event at:', click.position);

          const feature = scene!.pick(click.position);

          if (feature instanceof Cesium.Cesium3DTileFeature) {
            const elementId = Number(feature.getProperty("element"));
            console.log(`✅ Clicked on element: ${elementId}`);

            // Check if selectionAnalysis is enabled before calling AI
            if (!aiCapabilities.selectionAnalysis) {
              console.log('🔒 Selection Analysis is disabled, skipping AI call');
              // Still update visual selection but don't call AI
              unselectFeature(selectedFeature);
              selectFeature(feature);
              return;
            }

            try {
              // get equipment info from database
              const equipment = equipmentDatabaseService.getEquipmentByElementId(elementId);
              if (equipment) {
                console.log('📋 Equipment data:', equipment);

                // find related equipment
                const sameSubcategory = equipmentDatabaseService.getEquipmentBySubcategory(equipment.subcategory);
                const sameInspectionRequirements = equipmentDatabaseService.getEquipmentByInspectionRequirements(equipment.inspection_requirements[0]);

                // build message to send to AI
                const equipmentInfo = `Equipment information:
                Equipment ID: ${equipment.element}
                Name: ${equipment.name}
                Function: ${equipment.function}
                System: ${equipment.system}
                Subsystem: ${equipment.subsystem}
                Operational Status: ${equipment.operational_status}
                Criticality Level: ${equipment.criticality_level}
                Maintenance Strategy: ${equipment.maintenance_strategy}
                Inspection Requirements: ${equipment.inspection_requirements.join(', ')}
                Safety Class: ${equipment.safety_class}
                Applicable Codes: ${equipment.applicable_codes.join(', ')}

                As an engineer, what are the important information I should pay attention to?

                Related equipment statistics:
                - Equipment with the same subcategory (${equipment.subcategory}): ${sameSubcategory.length}
                - Equipment with the same inspection requirements: ${sameInspectionRequirements.length}

                Do you want to query other equipment information with the same subcategory or inspection requirements?`;

                // send to AI chat
                run(equipmentInfo);
              } else {
                console.log(`❌ Equipment with elementId ${elementId} not found in database`);
                run(`Sorry, the equipment information with elementId ${elementId} is not found in the database.`);
              }
            } catch (error) {
              console.error('❌ Error analyzing equipment:', error);
              run(`Error analyzing equipment: ${error}`);
            }

            unselectFeature(selectedFeature);
            selectFeature(feature);
          } else {
            console.log('❌ Click did not hit a feature');
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      }
    };

    initViewer();
    return () => {
      if (handler) handler.destroy();
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      elementMapRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  return (
    <div style={{ height: "100vh", position: "relative" }}>
      {/* Floating AI Chat */}
      <FloatingAIChat
        position="bottom-left"
        initialOpen={true}
        loading={loading}
        error={error}
        lastResponse={lastResponse}
        run={run}
        clearHistory={clearHistory}
        clarificationQuestions={clarificationQuestions}
        sceneData={sceneData}
        getAIContext={getAIContext}
        onCapabilitiesChange={updateCapabilities}
      />

      {/* Cesium Viewer */}
      <div style={{ width: "100%", height: "100%" }}>
        <div ref={cesiumContainerRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}; 