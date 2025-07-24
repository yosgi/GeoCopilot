import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { useGeoCopilot } from "../hooks/useGeoCopilot";
import { useSceneContext } from "../hooks/useSceneContext";
import { useSceneUnderstanding } from "../hooks/useSceneUnderstanding";

export const PowerPlantDemo = () => {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const { contextManager } = useSceneContext();
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  const { loading, error, lastResponse, run, clearHistory, initialize, clarificationQuestions } = useGeoCopilot(contextManager, apiKey);
  const { 
    sceneData, 
    scanScene,  
    getFeatureContext, 
    getSceneSummary,
  } = useSceneUnderstanding();
  const [selectedElement, setSelectedElement] = useState<number | null>(null);
  const [hiddenElements] = useState<number[]>([
    112001, 113180, 131136, 113167, 71309, 109652, 111178, 113156, 113170, 124846,
    114076, 131122, 113179, 114325, 131134, 113164, 113153, 113179, 109656, 114095,
    114093, 39225, 39267, 113149, 113071, 112003, 39229, 113160, 39227, 39234,
    113985, 39230, 112004, 39223,
  ]);
  const elementMapRef = useRef<Record<number, Cesium.Cesium3DTileFeature[]>>({});
  const [perFeatureSelection, setPerFeatureSelection] = useState(false);
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
      setSelectedElement(Number(element));
    };

    const setElementColor = (element: number, color: Cesium.Color) => {
      const featuresToColor = elementMapRef.current[element];
      if (!featuresToColor) return;
      for (let i = 0; i < featuresToColor.length; ++i) {
        const feature = featuresToColor[i];
        feature.color = Cesium.Color.clone(color, feature.color);
      }
    };

     // Generate AI tooltip for hovered feature
  const generateAITooltip = async (elementId: number) => {
    const featureContext = getFeatureContext(elementId);
    const sceneSummary = getSceneSummary();
    console.log(featureContext);
    console.log(sceneSummary);
  };
  console.log(sceneData);

  // Generate smart tooltip based on feature properties
//   const generateSmartTooltip = (featureContext: any) => {
//     const { properties, nearbyFeatures } = featureContext;
    
//     let tooltip = '';
    
//     // Identify component type
//     if (properties.name) {
//       tooltip += `${properties.name}`;
//     } else if (properties.type) {
//       tooltip += `${properties.type}`;
//     } else {
//       tooltip += `Element ${featureContext.elementId}`;
//     }
    
//     // Add function/purpose
//     if (properties.function) {
//       tooltip += ` - ${properties.function}`;
//     } else if (properties.category) {
//       tooltip += ` (${properties.category})`;
//     }
    
//     // Add system context
//     if (properties.system) {
//       tooltip += `\nPart of: ${properties.system}`;
//     }
    
//     // Add nearby context if available
//     if (nearbyFeatures && nearbyFeatures.length > 0) {
//       tooltip += `\nNearby: ${nearbyFeatures.slice(0, 2).map(f => f.description.split(',')[0]).join(', ')}`;
//     }
    
//     return tooltip || 'Industrial component - click for more details';
//   };


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
        viewer = new Cesium.Viewer(cesiumContainerRef.current, {
          globe: false,
        });
        viewerRef.current = viewer;
        initialize(viewer);
       
        scene = viewer.scene;
        viewer.clock.currentTime = Cesium.JulianDate.fromIso8601("2022-08-01T00:00:00Z");

        try {
          tileset = await Cesium.Cesium3DTileset.fromIonAssetId(2464651);
          scene.primitives.add(tileset);
          viewer.zoomTo(
            tileset,
            new Cesium.HeadingPitchRange(0.5, -0.2, tileset.boundingSphere.radius * 4.0),
          );
          tileset.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.REPLACE;
          tileset.tileLoad.addEventListener(function (tile) {
            processTileFeatures(tile, loadFeature);
          });
          tileset.tileUnload.addEventListener(function (tile) {
            processTileFeatures(tile, unloadFeature);
          });
        } catch (error) {
          console.log(`Error loading tileset: ${error}`);
        }
        await scanScene(viewer);
        handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
        handler.setInputAction(function (click: Cesium.ScreenSpaceEventHandler.PositionedEvent) {
            console.log('🖱️ Click event at:', click.position);
            
            const feature = scene!.pick(click.position);
            
            if (feature instanceof Cesium.Cesium3DTileFeature) {
              const elementId = Number(feature.getProperty("element"));
              console.log(`✅ Clicked on element: ${elementId}`);
              
              // Generate AI tooltip for this element
            //   const clickPos = {
            //     x: click.position.x,
            //     y: click.position.y
            //   };
            //   generateAITooltipOnClick(elementId, clickPos);
            generateAITooltip(elementId);
              
              // Handle existing selection logic
              unselectFeature(selectedFeature);
              selectFeature(feature);
            } else {
              console.log('❌ Click did not hit a feature');
              // Hide tooltip when clicking on empty space
            //   setAiTooltip(prev => ({ ...prev, show: false }));
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
  }, [perFeatureSelection]);

  const handleCommand = async () => {
    if (!input.trim()) return;
    await run(input);
    setInput("");
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: 350, padding: 16, background: "#f8f9fa", overflowY: "auto" }}>
        <h3 style={{ margin: "0 0 8px 0", fontSize: 16, color: "#000" }}>⚡ Power Plant Demo</h3>
        <div style={{ marginBottom: 12, padding: 8, background: "#e3f2fd", borderRadius: 4 }}>
          <div style={{ fontSize: 12, color: "#000" }}>
            <strong>Scene:</strong> {sceneData.sceneOverview.sceneType}<br/>
            <strong>Layers:</strong> {sceneData.sceneOverview.totalLayers}<br/>
            <strong>Features:</strong> {sceneData.sceneOverview.totalFeatures}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <button
            style={{ padding: 8, borderRadius: 4, background: perFeatureSelection ? "#2196f3" : "#ccc", color: "#fff", border: "none", marginRight: 8 }}
            onClick={() => setPerFeatureSelection((v) => !v)}
          >
            {perFeatureSelection ? "Disable" : "Enable"} Per-feature selection
          </button>
          {selectedElement !== null && (
            <span style={{ marginLeft: 8, color: "#333" }}>Selected element: {selectedElement}</span>
          )}
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Try: 'highlight element 112001' or 'show all elements'"
          style={{
            width: "100%",
            height: 80,
            marginBottom: 8,
            padding: 8,
            border: "1px solid #ddd",
            borderRadius: 4,
            resize: "vertical"
          }}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
              handleCommand();
            }
          }}
        />
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            onClick={handleCommand}
            disabled={loading}
            style={{
              flex: 1,
              padding: 8,
              background: loading ? "#ccc" : "#2196f3",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            {loading ? "🤔 AI thinking..." : "🚀 Execute command (Ctrl+Enter)"}
          </button>
          <button
            onClick={clearHistory}
            style={{
              padding: 8,
              background: "#ff9800",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer"
            }}
          >
            🗑️
          </button>
        </div>
        {loading && (
          <div style={{ padding: 8, background: "#fff3cd", borderRadius: 4, marginBottom: 8 }}>
            🔄 AI is analyzing the scene and generating commands...
          </div>
        )}
        {error && (
          <div style={{ padding: 8, background: "#f8d7da", borderRadius: 4, marginBottom: 8, color: "#721c24" }}>
            ❌ {error}
          </div>
        )}
        {lastResponse && !loading && !error && (
          <div style={{ padding: 8, background: "#d1edff", borderRadius: 4, marginBottom: 8, color: "#000" }}>
            ✅ {lastResponse}
          </div>
        )}
        {clarificationQuestions && clarificationQuestions.length > 0 && (
          <div style={{
            background: '#fffbe6',
            border: '1px solid #ffe58f',
            borderRadius: 6,
            padding: 12,
            marginBottom: 12,
            color: '#ad8b00',
            fontWeight: 500
          }}>
            <div style={{ marginBottom: 6 }}>🤔 Clarification needed:</div>
            {clarificationQuestions.map((q, idx) => (
              <div key={idx} style={{ marginBottom: 4 }}>
                <span style={{ cursor: 'pointer', textDecoration: 'underline', color: '#fa8c16' }}
                  onClick={() => setInput(q)}
                  title="Click to fill this question into the input box"
                >{q}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 24, color: "#000" }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>💡 AI command examples</h3>
          <div style={{ fontSize: 12 }}>
            {[
              { cmd: "highlight element 112001", desc: "Highlight a specific element by ID" },
              { cmd: "show all elements", desc: "Show all elements in the model" },
              { cmd: "hide element 39225", desc: "Hide a specific element by ID" },
              { cmd: "reset view", desc: "Reset the camera position" },
              { cmd: "select element 113180", desc: "Select and highlight an element" }
            ].map((example, index) => (
              <div
                key={index}
                style={{
                  cursor: "pointer",
                  padding: "6px 8px",
                  margin: "2px 0",
                  background: "#f8f9fa",
                  borderRadius: 3,
                  border: "1px solid #e9ecef",
                  transition: "all 0.2s",
                }}
                onClick={() => setInput(example.cmd)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#e3f2fd";
                  e.currentTarget.style.borderColor = "#2196f3";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#f8f9fa";
                  e.currentTarget.style.borderColor = "#e9ecef";
                }}
                title={example.desc}
              >
                "{example.cmd}"
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={cesiumContainerRef} style={{ width: "100%", height: "100%" }} />
        {loading && (
          <div style={{
            position: "absolute",
            top: 20,
            right: 20,
            padding: "8px 16px",
            background: "rgba(33, 150, 243, 0.9)",
            color: "white",
            borderRadius: 20,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: 1000
          }}>
            <div style={{
              width: 16,
              height: 16,
              border: "2px solid transparent",
              borderTop: "2px solid white",
              borderRadius: "50%",
              animation: "spin 1s linear infinite"
            }} />
            AI is executing command...
          </div>
        )}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}; 