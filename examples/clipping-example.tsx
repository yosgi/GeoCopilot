import React, { useRef, useEffect, useCallback } from 'react';
import * as Cesium from 'cesium';
import { useGeoCopilot, useSceneContext, useCameraControl, useClippingControl } from '../src';

const ClippingExample: React.FC = () => {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = React.useState('');
  
  // Initialize hooks
  const { contextManager } = useSceneContext();
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY || 'your-api-key-here';
  const { loading, error, lastResponse, run, clearHistory, initialize, layerControl } = useGeoCopilot(contextManager, apiKey);
  const cameraControl = useCameraControl();
  const [clippingState, clippingActions] = useClippingControl(viewerRef.current);

  const loadSampleTileset = useCallback(async () => {
    if (!viewerRef.current) return;

    try {
      // Load a sample 3D tileset (you can replace with your own)
      const tileset = await Cesium.Cesium3DTileset.fromUrl(
        'https://storage.googleapis.com/cesiumjs-public-assets/tilesets/Cesium3DTiles/Building/Building.json'
      );
      
      viewerRef.current.scene.primitives.add(tileset);
      
      // Zoom to the tileset
      viewerRef.current.zoomTo(tileset);
      
      // Apply clipping planes to the tileset
      clippingActions.applyToTileset(tileset);
      
    } catch (error) {
      console.error('Error loading tileset:', error);
    }
  }, [clippingActions]);

  // Initialize Cesium viewer
  useEffect(() => {
    if (cesiumContainerRef.current && !viewerRef.current) {
      // Create viewer
      viewerRef.current = new Cesium.Viewer(cesiumContainerRef.current, {
        globe: false,
      });

      // Initialize GeoCopilot
      initialize(viewerRef.current);
      
      // Set initial camera view
      viewerRef.current.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-79.886626, 40.021649, 235.65),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-20),
          roll: 0,
        },
      });

      // Load a sample 3D tileset for clipping demonstration
      loadSampleTileset();
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [initialize, cameraControl, layerControl, loadSampleTileset]);

  const handleCommand = async () => {
    if (!input.trim()) return;
    await run(input);
    setInput('');
  };

  const handleAddPlane = () => {
    clippingActions.addPlane({
      normal: new Cesium.Cartesian3(0.0, 0.0, -1.0), // Will be positioned in front of camera
      distance: 0.0, // Will be calculated based on camera position
      enabled: true,
      edgeWidth: 1.0,
      edgeColor: Cesium.Color.WHITE
    });
  };

  const handleRemoveAllPlanes = () => {
    clippingActions.reset();
  };

  const handleToggleEdgeStyling = () => {
    clippingActions.setEdgeStyling(!clippingState.edgeStylingEnabled);
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Control Panel */}
      <div style={{ width: 350, padding: 16, background: '#f8f9fa', overflowY: 'auto' }}>
        <h3>🔪 Clipping Plane Demo</h3>
        
        {/* AI Command Input */}
        <div style={{ marginBottom: 20 }}>
          <h4>🤖 AI Commands</h4>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Try: 'add a clipping plane' or 'slice through the building'"
            style={{ 
              width: '100%', 
              height: 80,
              marginBottom: 8,
              padding: 8,
              border: '1px solid #ddd',
              borderRadius: 4
            }}
          />

          <button 
            onClick={handleCommand}
            disabled={loading}
            style={{ 
              width: '100%',
              padding: 8,
              background: loading ? '#ccc' : '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: 8
            }}
          >
            {loading ? '🤔 AI thinking...' : '🚀 Execute Command'}
          </button>

          {error && (
            <div style={{ padding: 8, background: '#f8d7da', borderRadius: 4, marginBottom: 8 }}>
              ❌ {error}
            </div>
          )}

          {lastResponse && (
            <div style={{ padding: 8, background: '#d1edff', borderRadius: 4, marginBottom: 8 }}>
              ✅ {lastResponse}
            </div>
          )}
        </div>

        {/* Manual Clipping Controls */}
        <div style={{ marginBottom: 20 }}>
          <h4>🔧 Manual Controls</h4>
          
          <button 
            onClick={handleAddPlane}
            style={{ 
              width: '100%',
              padding: 8,
              background: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              marginBottom: 8
            }}
          >
            ➕ Add Clipping Plane
          </button>

          <button 
            onClick={handleRemoveAllPlanes}
            style={{ 
              width: '100%',
              padding: 8,
              background: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              marginBottom: 8
            }}
          >
            🗑️ Remove All Planes
          </button>

          <button 
            onClick={handleToggleEdgeStyling}
            style={{ 
              width: '100%',
              padding: 8,
              background: clippingState.edgeStylingEnabled ? '#ff9800' : '#9e9e9e',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              marginBottom: 8
            }}
          >
            {clippingState.edgeStylingEnabled ? '🔲 Disable' : '☑️ Enable'} Edge Styling
          </button>
        </div>

        {/* Status Display */}
        <div style={{ marginBottom: 20 }}>
          <h4>📊 Status</h4>
          <div style={{ padding: 8, background: '#e8f5e8', borderRadius: 4 }}>
            <p><strong>Active Planes:</strong> {clippingState.planes.length}</p>
            <p><strong>Edge Styling:</strong> {clippingState.edgeStylingEnabled ? 'Enabled' : 'Disabled'}</p>
            <p><strong>Debug Mode:</strong> {clippingState.debugBoundingVolumesEnabled ? 'Enabled' : 'Disabled'}</p>
            <p><strong>Selected Plane:</strong> {clippingState.selectedPlaneId || 'None'}</p>
            <p><strong>Dragging:</strong> {clippingState.isDragging ? 'Yes' : 'No'}</p>
          </div>
        </div>

        {/* Instructions */}
        <div style={{ marginBottom: 20 }}>
          <h4>📖 Instructions</h4>
          <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
            <p><strong>AI Commands:</strong></p>
            <ul>
              <li>"add a clipping plane"</li>
              <li>"slice through the building"</li>
              <li>"remove all clipping planes"</li>
              <li>"toggle edge styling"</li>
              <li>"show clipping status"</li>
            </ul>
            
            <p><strong>Manual Interaction:</strong></p>
            <ul>
              <li>Click and drag on clipping planes to adjust position</li>
              <li>Use buttons above for quick actions</li>
              <li>Planes will automatically apply to loaded 3D models</li>
            </ul>
          </div>
        </div>

        <button 
          onClick={clearHistory}
          style={{ 
            width: '100%',
            padding: 8,
            background: '#ff9800',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          🗑️ Clear History
        </button>
      </div>

      {/* Cesium 3D View */}
      <div style={{ flex: 1 }}>
        <div ref={cesiumContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
};

export default ClippingExample; 