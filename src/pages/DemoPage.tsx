import { useCallback, useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { CesiumController } from "../core/CesiumController";
import { useGeoCopilot } from "../hooks/useGeoCopilot";
import { useSceneContext } from "../hooks/useSceneContext";

export const DemoPage = () => {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const { contextManager, context, getAIContext } = useSceneContext();
  const { commands, loading, error, lastResponse, run, clearHistory } = useGeoCopilot(contextManager);
  const tilesetMapRef = useRef<Map<string, Cesium.Cesium3DTileset>>(new Map());


  // Initialize Cesium viewer
  useEffect(() => {
    const tilesetMap = tilesetMapRef.current;
    
    const initViewer = async () => {
      if (cesiumContainerRef.current && !viewerRef.current) {
        // Create viewer with globe disabled
        viewerRef.current = new Cesium.Viewer(cesiumContainerRef.current, {
          globe: false,
        });
        contextManager.setViewer(viewerRef.current);

        // Enable rendering the sky
        viewerRef.current.scene.skyAtmosphere.show = true;

        // Configure Ambient Occlusion
        if (Cesium.PostProcessStageLibrary.isAmbientOcclusionSupported(viewerRef.current.scene)) {
          const ambientOcclusion = viewerRef.current.scene.postProcessStages.ambientOcclusion;
          ambientOcclusion.enabled = true;
          ambientOcclusion.uniforms.intensity = 2.0;
          ambientOcclusion.uniforms.bias = 0.1;
          ambientOcclusion.uniforms.lengthCap = 0.5;
          ambientOcclusion.uniforms.directionCount = 16;
          ambientOcclusion.uniforms.stepCount = 32;
        }

        // Set to 1 PM Philadelphia time in UTC
        viewerRef.current.clock.currentTime = Cesium.JulianDate.fromIso8601("2024-11-22T18:00:00Z");

        // Set the initial camera view
        viewerRef.current.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(-79.886626, 40.021649, 235.65),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-20),
            roll: 0,
          },
        });

        // Add Photorealistic 3D tiles
        let googleTileset;
        try {
          googleTileset = await Cesium.Cesium3DTileset.fromIonAssetId(2275207);
          viewerRef.current.scene.primitives.add(googleTileset);
        } catch (error) {
          console.log(`Error loading tileset: ${error}`);
        }

        // Add clipping for the site
        const positions = Cesium.Cartesian3.fromDegreesArray([
          -79.887735, 40.022564, -79.886341, 40.023087, -79.886161, 40.023087, -79.885493,
          40.022032, -79.88703, 40.021456, -79.887735, 40.022564,
        ]);

        const polygon = new Cesium.ClippingPolygon({
          positions: positions,
        });

        const polygons = new Cesium.ClippingPolygonCollection({
          polygons: [polygon],
        });

        if (googleTileset) {
          googleTileset.clippingPolygons = polygons;
        }

        // The Architectural Design is comprised of multiple tilesets
        const tilesetData = [
          { title: "Architecture", assetId: 2887123, visible: true },
          { title: "Facade", assetId: 2887125, visible: true },
          { title: "Structural", assetId: 2887130, visible: false },
          { title: "Electrical", assetId: 2887124, visible: true },
          { title: "HVAC", assetId: 2887126, visible: true },
          { title: "Plumbing", assetId: 2887127, visible: true },
          { title: "Site", assetId: 2887129, visible: true },
        ];

        // Initialize layer visibility state
        const initialVisibility: Record<string, boolean> = {};
        const layerInfos = [];
        tilesetData.forEach(({ title, visible }) => {
          initialVisibility[title] = visible;
        });
        setLayerVisibility(initialVisibility);
        tilesetMap.clear();
        // Load each tileset and create a corresponding visibility toggle button
        for (const { title, assetId, visible } of tilesetData) {
          try {
            const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(assetId);
            const addedTileset = viewerRef.current.scene.primitives.add(tileset);
            const layerId = title.toLowerCase();
            contextManager.registerCesiumObject(layerId, tileset, {
                name: title,
                type: 'BIM',
                description: title + ' layer for building visualization',
                assetId: assetId
              });
            tileset.show = visible;
            tilesetMap.set(title, addedTileset);
            layerInfos.push({
                id: layerId,
                name: title,
                type: 'BIM' as const,
                visible: visible,
                properties: {
                  assetId: assetId,
                  description: `${title} layer for building visualization`
                },
                assetId: assetId
              });
          } catch (error) {
            console.log(`Error loading tileset (${title}): ${error}`);
          }
        }
        contextManager.updateLayers(layerInfos);

        // Get default left click handler for when a feature is not picked on left click
        const clickHandler = viewerRef.current.screenSpaceEventHandler.getInputAction(
          Cesium.ScreenSpaceEventType.LEFT_CLICK,
        );

        // Create the HTML that will be put into the info box that shows
        // information about the currently selected feature
        function createPickedFeatureDescription(pickedFeature: Cesium.Cesium3DTileFeature) {
          let description = `${'<table class="cesium-infoBox-defaultTable"><tbody>'}`;

          const propertyIds = pickedFeature.getPropertyIds();

          // Sort properties alphabetically
          propertyIds.sort((a, b) => a.localeCompare(b));

          const length = propertyIds.length;
          for (let i = 0; i < length; ++i) {
            const propertyId = propertyIds[i];
            const propertyValue = pickedFeature.getProperty(propertyId);

            // Reject properties with default values
            if (Cesium.defined(propertyValue) && propertyValue !== "") {
              description += `<tr><th>${propertyId}</th><td>${propertyValue}</td></tr>`;
            }
          }

          description += `</tbody></table>`;

          return description;
        }

        // An entity object which will hold info about the currently selected feature for infobox display
        const selectedEntity = new Cesium.Entity();

        // Information about the currently selected feature
        const selected = {
          feature: undefined as Cesium.Cesium3DTileFeature | undefined,
          originalColor: new Cesium.Color(),
        };

        // Information about the currently highlighted feature
        const highlighted = {
          feature: undefined as Cesium.Cesium3DTileFeature | undefined,
          originalColor: new Cesium.Color(),
        };

        // Color a feature yellow on hover.
        viewerRef.current.screenSpaceEventHandler.setInputAction(function onMouseMove(movement: Cesium.ScreenSpaceEventHandler.MotionEvent) {
          // If a feature was previously highlighted, undo the highlight
          if (Cesium.defined(highlighted.feature)) {
            highlighted.feature.color = highlighted.originalColor;
            highlighted.feature = undefined;
          }
          // Pick a new feature
          const pickedFeature = viewerRef.current!.scene.pick(movement.endPosition);

          if (
            !Cesium.defined(pickedFeature) ||
            !(pickedFeature instanceof Cesium.Cesium3DTileFeature)
          ) {
            return;
          }

          // Highlight the feature if it's not already selected.
          if (pickedFeature !== selected.feature) {
            highlighted.feature = pickedFeature;
            Cesium.Color.clone(pickedFeature.color, highlighted.originalColor);
            pickedFeature.color = Cesium.Color.YELLOW;
          }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        // Color a feature on selection and show metadata in the InfoBox.
        viewerRef.current.screenSpaceEventHandler.setInputAction(function onLeftClick(movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) {
          // If a feature was previously selected, undo the highlight
          if (Cesium.defined(selected.feature)) {
            selected.feature.color = selected.originalColor;
            selected.feature = undefined;
          }
          // Pick a new feature
          const pickedFeature = viewerRef.current!.scene.pick(movement.position);
          if (
            !Cesium.defined(pickedFeature) ||
            !(pickedFeature instanceof Cesium.Cesium3DTileFeature)
          ) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            clickHandler(movement as any);
            return;
          }
          // Select the feature if it's not already selected
          if (selected.feature === pickedFeature) {
            return;
          }
          selected.feature = pickedFeature;
          // Save the selected feature's original color
          if (pickedFeature === highlighted.feature) {
            Cesium.Color.clone(highlighted.originalColor, selected.originalColor);
            highlighted.feature = undefined;
          } else {
            Cesium.Color.clone(pickedFeature.color, selected.originalColor);
          }
          // Highlight newly selected feature
          pickedFeature.color = Cesium.Color.LIME;

          // Set feature infobox description
          viewerRef.current!.selectedEntity = selectedEntity;
          selectedEntity.description = new Cesium.ConstantProperty(createPickedFeatureDescription(pickedFeature));
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        CesiumController.setViewer(viewerRef.current);
      }
    };
    
    initViewer();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
        tilesetMap.clear();
      }
    };
  }, [contextManager]);

  const handleCommand = async () => {
    if (!input.trim()) return;
    const aiContext = getAIContext();
    console.log('Current Scene Context:', aiContext);
    await run(input);
    setInput("");
  };

  const toggleLayerVisibility = useCallback((layerName: string) => {
    setLayerVisibility(prev => {
      const currentVisible = prev[layerName];
      const newVisible = !currentVisible;
      const tileset = tilesetMapRef.current.get(layerName);
      if (tileset) {
        tileset.show = newVisible;
        setTimeout(() => {
            viewerRef.current?.scene.requestRender();
          }, 50);
      } else {
        console.error(`❌ Tileset not found for layer: ${layerName}`);
      }
      
      const newVisibilityState = { ...prev, [layerName]: newVisible };
      
      const updatedLayers = context.layers.map(layer => 
        layer.name === layerName 
          ? { ...layer, visible: newVisible }
          : layer
      );
      contextManager.updateLayers(updatedLayers);
      
      return newVisibilityState;
    });
  }, [context.layers, contextManager]);

  


  const showAIContext = () => {
    const aiContext = contextManager.getAIContext();
    console.log('AI Context:', aiContext);
    
    const popup = window.open('', '_blank', 'width=800,height=600');
    popup?.document.write(`
      <html>
        <head><title>AI Scene Context</title></head>
        <body>
          <h1>AI Scene Understanding</h1>
          <h2>Scene Description:</h2>
          <pre>${aiContext.sceneDescription}</pre>
          <h2>Available Commands:</h2>
          <ul>
            ${aiContext.availableCommands.map(cmd => `<li>${cmd}</li>`).join('')}
          </ul>
          <h2>Raw Context Data:</h2>
          <pre>${JSON.stringify(aiContext.currentState, null, 2)}</pre>
        </body>
      </html>
    `);
  };

  

  return (
    <div style={{ display: "flex", height: "100vh" }}>
    <div style={{ width: 350, padding: 16, background: "#f8f9fa", overflowY: "auto" }}>
      <h2>🧠 GeoCopilot AI Dashboard</h2>


      <div style={{ marginBottom: 16, padding: 12, background: "#e3f2fd", borderRadius: 8 }}>
        <h3 style={{ margin: "0 0 8px 0", fontSize: 16 }}>🤖 AI Assistant</h3>
        
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="try:&#10;• fly to the main building&#10;• hide the structural layer&#10;• show all BIM layers&#10;• measure distance&#10;• switch to night mode"
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

        <button 
          onClick={showAIContext}
          style={{ 
            width: "100%",
            padding: 6,
            background: "#4caf50",
            color: "white",
            border: "none",
            borderRadius: 4,
            fontSize: 12,
            cursor: "pointer"
          }}
        >
          🔍 View AI scene understanding
        </button>
      </div>

      {/* AI response status */}
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
        <div style={{ padding: 8, background: "#d1edff", borderRadius: 4, marginBottom: 8 }}>
          ✅ {lastResponse}
        </div>
      )}

      {/* Scene status quick display */}
      <div style={{ marginBottom: 16, padding: 8, background: "#e8f5e8", borderRadius: 4, color: "#000" }}>
        <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>📍 Scene status</h4>
        <div style={{ fontSize: 12, lineHeight: 1.4 }}>
          <div><strong>Location:</strong> {context.location.name}</div>
          <div><strong>Camera height:</strong> {context.camera.position[2]?.toFixed(0)}m</div>
          <div><strong>Visible layers:</strong> {context.layers.filter(l => l.visible).length}/{context.layers.length}</div>
          <div><strong>Time:</strong> {context.environment.lighting === 'day' ? '☀️' : '🌙'} {new Date(context.environment.time).toLocaleTimeString()}</div>
        </div>
      </div>

      {/* AI command history */}
      {commands.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>🤖 Recent AI commands</h3>
          <div style={{ maxHeight: 150, overflowY: "auto" }}>
            {commands.map((command, index) => (
              <div key={index} style={{ 
                marginBottom: 6, 
                padding: 8, 
                background: "#fff", 
                borderRadius: 4,
                border: "1px solid #ddd",
                fontSize: 12
              }}>
                <div style={{ fontWeight: "bold", color: "#1976d2" }}>
                  {command.action}
                  {command.target && <span style={{ color: "#666" }}> → {command.target}</span>}
                </div>
                {command.parameters && (
                  <div style={{ marginTop: 4, color: "#666", fontSize: 11 }}>
                    {JSON.stringify(command.parameters)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Traditional layer control */}
      <div style={{ marginBottom: 16, color: "#000" }}>
        <h3 style={{ fontSize: 16, marginBottom: 8 }}>🏗️ Manual layer control</h3>
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          You can also click to switch layers, or say "show structural layer" to AI
        </div>
        {Object.entries(layerVisibility).map(([layerName, isVisible]) => (
          <div key={layerName} style={{ marginBottom: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={isVisible}
                onChange={() => toggleLayerVisibility(layerName)}
              />
              <span style={{ color: isVisible ? "#000" : "#999" }}>
                {layerName}
              </span>
            </label>
          </div>
        ))}
      </div>

      {/* AI command examples */}
      <div style={{ marginBottom: 16, color: "#000" }}>
        <h3 style={{ fontSize: 16, marginBottom: 8 }}>💡 AI command examples</h3>
        <div style={{ fontSize: 12 }}>
          {[
            { cmd: "fly to the main building", desc: "move the camera to the center of the building" },
            { cmd: "hide the structural layer", desc: "hide the structural layer" },
            { cmd: "only show the building and facade", desc: "only keep the specified layers" },
            { cmd: "go back to the initial view", desc: "reset the camera position" },
            { cmd: "switch to the top view", desc: "change the camera pitch" },
            { cmd: "show all layers", desc: "show all BIM layers" },
            { cmd: "zoom to 500 meters", desc: "set the camera height" }
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

      {/* Keyboard shortcuts */}
      <div style={{ 
        padding: 8, 
        background: "#f0f0f0", 
        borderRadius: 4, 
        fontSize: 11,
        color: "#666"
      }}>
        <strong>Keyboard shortcuts:</strong><br/>
        • Ctrl+Enter: Execute AI command<br/>
        • Click on example commands to quickly input<br/>
        • AI will respond intelligently based on the current scene state
      </div>

      {/* Debug information */}
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontSize: 14, color: "#666" }}>
          🔧 Developer debug information
        </summary>
        <div style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Scene layer status:</strong>
            <pre style={{ fontSize: 10, background: "#f5f5f5", padding: 4, margin: "4px 0" }}>
              {JSON.stringify(
                context.layers.map(l => ({ name: l.name, visible: l.visible })), 
                null, 2
              )}
            </pre>
          </div>
          
          <div style={{ marginBottom: 8 }}>
            <strong>Camera status:</strong>
            <pre style={{ fontSize: 10, background: "#f5f5f5", padding: 4, margin: "4px 0" }}>
              {JSON.stringify({
                height: context.camera.position[2]?.toFixed(2),
                heading: (context.camera.orientation.heading * 180 / Math.PI).toFixed(1) + "°",
                pitch: (context.camera.orientation.pitch * 180 / Math.PI).toFixed(1) + "°"
              }, null, 2)}
            </pre>
          </div>

          {commands.length > 0 && (
            <div>
              <strong>Last executed command:</strong>
              <pre style={{ fontSize: 10, background: "#f5f5f5", padding: 4, margin: "4px 0" }}>
                {JSON.stringify(commands[commands.length - 1], null, 2)}
              </pre>
            </div>
          )}
        </div>
      </details>
    </div>

    {/* Cesium 3D view */}
    <div style={{ flex: 1, position: "relative" }}>
      <div ref={cesiumContainerRef} style={{ width: "100%", height: "100%" }} />
      
      {/* Floating status indicator */}
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

        {/* CSS animation */}
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