import React, { useRef, useEffect } from 'react';
import * as Cesium from 'cesium';
import { useGeoCopilot, useSceneContext, useCameraControl } from '../src';

const BasicExample: React.FC = () => {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = React.useState('');
  
  // Initialize hooks
  const { contextManager } = useSceneContext();
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY || 'your-api-key-here';
  const { loading, error, lastResponse, run, clearHistory, initialize, layerControl } = useGeoCopilot(contextManager, apiKey);
  const cameraControl = useCameraControl();

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

      // Add some sample layers
      const sampleLayers = [
        { id: 'building', name: 'Building', visible: true },
        { id: 'site', name: 'Site', visible: true },
      ];

      sampleLayers.forEach(layer => {
        layerControl.registerObject(layer.id, null, {
          name: layer.name,
          type: 'BIM',
          visible: layer.visible
        });
      });
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [initialize, cameraControl, layerControl]);

  const handleCommand = async () => {
    if (!input.trim()) return;
    await run(input);
    setInput('');
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Control Panel */}
      <div style={{ width: 300, padding: 16, background: '#f8f9fa' }}>
        <h3>🤖 GeoCopilot Demo</h3>
        
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Try: 'show all layers' or 'fly to building'"
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
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '🤔 AI thinking...' : '🚀 Execute Command'}
        </button>

        {error && (
          <div style={{ padding: 8, background: '#f8d7da', borderRadius: 4, marginTop: 8 }}>
            ❌ {error}
          </div>
        )}

        {lastResponse && (
          <div style={{ padding: 8, background: '#d1edff', borderRadius: 4, marginTop: 8 }}>
            ✅ {lastResponse}
          </div>
        )}

        <button 
          onClick={clearHistory}
          style={{ 
            width: '100%',
            marginTop: 8,
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

export default BasicExample; 