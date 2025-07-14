# GeoCopilot

AI-powered 3D BIM scene control with natural language commands. Control your Cesium 3D scenes using simple, intuitive commands like "show all layers" or "fly to the building".

## Features

- 🤖 **AI-Powered Control**: Use natural language to control your 3D scene
- 🏗️ **Layer Management**: Show/hide BIM layers with voice commands
- 📷 **Camera Control**: Fly to positions, zoom, rotate with AI assistance
- 🎯 **Scene Context**: AI understands your scene and provides intelligent responses
- ⚡ **Real-time**: Immediate feedback and execution
- 🔧 **Developer Friendly**: Simple hooks and TypeScript support

## Installation

```bash
npm install GeoCopilot
```

## Quick Start

### 1. Basic Setup

```tsx
import React, { useRef, useEffect } from 'react';
import * as Cesium from 'cesium';
import { useGeoCopilot, useSceneContext, useCameraControl } from 'GeoCopilot';

const MyApp = () => {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = React.useState('');
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY || 'your-api-key-here';
  // Initialize hooks
  const { contextManager } = useSceneContext();
  const { loading, error, lastResponse, run, initialize } = useGeoCopilot(contextManager,apiKey);
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
    }
  }, [initialize, cameraControl]);

  const handleCommand = async () => {
    if (!input.trim()) return;
    await run(input);
    setInput('');
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 300, padding: 16 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Try: 'show all layers'"
        />
        <button onClick={handleCommand} disabled={loading}>
          {loading ? 'AI thinking...' : 'Execute Command'}
        </button>
        {error && <div>❌ {error}</div>}
        {lastResponse && <div>✅ {lastResponse}</div>}
      </div>
      <div style={{ flex: 1 }}>
        <div ref={cesiumContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
};
```

### 2. Environment Setup

Set your OpenAI API key:

```bash
# .env
REACT_APP_OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Add Layers

```tsx
// Register layers for AI control
layerControl.registerObject('building', tileset, {
  name: 'Building',
  type: 'BIM',
  visible: true
});

// Or register multiple layers
const layers = [
  { id: 'architecture', name: 'Architecture', visible: true },
  { id: 'structural', name: 'Structural', visible: false },
  { id: 'electrical', name: 'Electrical', visible: true },
];

layers.forEach(layer => {
  layerControl.registerObject(layer.id, null, {
    name: layer.name,
    type: 'BIM',
    visible: layer.visible
  });
});
```

## Available Commands

### Layer Control
- `"show all layers"` - Show all registered layers
- `"hide all layers"` - Hide all registered layers
- `"show building layer"` - Show specific layer
- `"hide structural layer"` - Hide specific layer
- `"only show architecture and electrical"` - Show only specified layers
- `"set building opacity to 0.5"` - Set layer transparency

### Camera Control
- `"fly to the building"` - Fly to a specific location
- `"zoom in"` - Zoom closer to the scene
- `"zoom out"` - Zoom away from the scene
- `"rotate left 90 degrees"` - Rotate camera
- `"switch to top view"` - Change camera angle
- `"reset view"` - Return to initial position

### Complex Commands
- `"hide structural and electrical, then fly to the main entrance"` - Multiple actions
- `"show only the building facade and zoom to 500 meters"` - Combined operations

## API Reference

### Hooks

#### `useGeoCopilot(contextManager)`
Main hook for AI-powered scene control.

```tsx
const { loading, error, lastResponse, run, clearHistory, initialize } = useGeoCopilot(contextManager);
```

**Returns:**
- `loading: boolean` - AI processing state
- `error: string | null` - Error message if any
- `lastResponse: string | null` - Last AI response
- `run(input: string): Promise<void>` - Execute AI command
- `clearHistory(): void` - Clear response history
- `initialize(viewer: Cesium.Viewer): void` - Initialize with Cesium viewer

#### `useLayerControl()`
Control layer visibility and properties.

```tsx
const { layers, loading, registerObject, setVisibility, showAll, hideAll } = useLayerControl();
```

**Methods:**
- `registerObject(id, cesiumObject, metadata)` - Register a layer
- `setVisibility(layerId, visible)` - Show/hide layer
- `showAll()` - Show all layers
- `hideAll()` - Hide all layers
- `showOnly(layerIds)` - Show only specified layers

#### `useCameraControl()`
Control camera position and orientation.

```tsx
const { flyTo, setPosition, zoom, rotate, resetView } = useCameraControl();
```

**Methods:**
- `flyTo(options)` - Smoothly fly to position
- `setPosition(options)` - Instantly set camera position
- `zoom(factor)` - Zoom in/out
- `rotate(heading, pitch)` - Rotate camera
- `resetView()` - Reset to default view

#### `useSceneContext()`
Access scene context and AI understanding.

```tsx
const { contextManager, context, getAIContext } = useSceneContext();
```

### Types

```tsx
interface GeoCopilotState {
  loading: boolean;
  error: string | null;
  lastResponse: string | null;
}

interface LayerInfo {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  [key: string]: unknown;
}

interface CameraInfo {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}
```

## Advanced Usage

### Custom AI Tools

You can extend the AI capabilities by creating custom tools:

```tsx
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const createCustomTool = (myFunction) => {
  return tool(
    async ({ action, parameter }) => {
      // Your custom logic here
      return "Successfully executed custom action";
    },
    {
      name: "customTool",
      description: "Your custom tool description",
      schema: z.object({
        action: z.string(),
        parameter: z.string().optional()
      })
    }
  );
};
```

### Scene Context Management

```tsx
const { contextManager } = useSceneContext();

// Get current scene context
const context = contextManager.getContext();

// Get AI-optimized context
const aiContext = contextManager.getAIContext();

// Update scene description
contextManager.updateSceneDescription("A modern office building with 5 floors");
```

## Examples

### Complete Example with Layer Management

```tsx
import React, { useRef, useEffect } from 'react';
import * as Cesium from 'cesium';
import { useGeoCopilot, useSceneContext, useLayerControl, useCameraControl } from 'GeoCopilot';

const CompleteExample = () => {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = React.useState('');
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY || 'your-api-key-here';
  const { contextManager } = useSceneContext();
  const { loading, error, lastResponse, run, initialize, layerControl } = useGeoCopilot(contextManager,apiKey);
  const cameraControl = useCameraControl();

  useEffect(() => {
    if (cesiumContainerRef.current && !viewerRef.current) {
      viewerRef.current = new Cesium.Viewer(cesiumContainerRef.current, {
        globe: false,
      });

      initialize(viewerRef.current);

      // Add sample layers
      const layers = [
        { id: 'architecture', name: 'Architecture', visible: true },
        { id: 'structural', name: 'Structural', visible: false },
        { id: 'electrical', name: 'Electrical', visible: true },
        { id: 'hvac', name: 'HVAC', visible: true },
      ];

      layers.forEach(layer => {
        layerControl.registerObject(layer.id, null, {
          name: layer.name,
          type: 'BIM',
          visible: layer.visible
        });
      });
    }
  }, [initialize, cameraControl, layerControl]);

  const handleCommand = async () => {
    if (!input.trim()) return;
    await run(input);
    setInput('');
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 300, padding: 16, background: '#f8f9fa' }}>
        <h3>🤖 GeoCopilot</h3>
        
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Try: 'show all layers' or 'fly to building'"
          style={{ width: '100%', height: 80, marginBottom: 8 }}
        />

        <button 
          onClick={handleCommand}
          disabled={loading}
          style={{ width: '100%', padding: 8 }}
        >
          {loading ? '🤔 AI thinking...' : '🚀 Execute Command'}
        </button>

        {error && <div style={{ color: 'red' }}>❌ {error}</div>}
        {lastResponse && <div style={{ color: 'green' }}>✅ {lastResponse}</div>}

        {/* Layer Controls */}
        <div style={{ marginTop: 16 }}>
          <h4>Manual Layer Control</h4>
          {layerControl.layers.map(layer => (
            <label key={layer.id} style={{ display: 'block', marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={layer.visible}
                onChange={() => layerControl.setVisibility(layer.id, !layer.visible)}
              />
              {layer.name}
            </label>
          ))}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div ref={cesiumContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
};
```

## Requirements

- React 18+ or 19+
- Cesium 1.131.0+
- LangChain 0.3.29+
- OpenAI API key

## License

MIT
