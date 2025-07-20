import React, { useRef, useEffect, useState } from 'react';
import * as Cesium from 'cesium';
import { GeoCopilot } from '../src/core/GeoCopilot';
import type { ExecutionResult, StreamStep } from '../src/core/GeoCopilot';

const EnhancedExample: React.FC = () => {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [streamProgress, setStreamProgress] = useState<StreamStep | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [contextInfo, setContextInfo] = useState<string>('');

  // Initialize GeoCopilot with enhanced configuration
  const geoCopilotRef = useRef<GeoCopilot | null>(null);

  useEffect(() => {
    if (!geoCopilotRef.current) {
      geoCopilotRef.current = new GeoCopilot({
        confidenceThreshold: 0.7,
        maxResults: 10,
        enableValidation: true,
        enableSuggestions: true,
        enableHistory: true,
        plugins: [
          // Example plugin for custom commands
          {
            name: 'customCommands',
            version: '1.0.0',
            initialize: () => {
              console.log('Custom commands plugin initialized');
            },
            execute: async (command) => {
              if (command === 'custom_measure') {
                return 'Custom measurement executed';
              }
              return undefined; // Let default handler take over
            }
          }
        ],
        middleware: [
          // Example middleware for logging
          {
            name: 'logger',
            before: async (input) => {
              console.log('Processing input:', input);
              return input;
            },
            after: async (result) => {
              console.log('Execution result:', result);
              return result;
            },
            error: async (error) => {
              console.error('Execution error:', error);
            }
          }
        ]
      });

      // Initialize GeoCopilot
      geoCopilotRef.current.initialize();
    }
  }, []);

  // Initialize Cesium viewer
  useEffect(() => {
    if (cesiumContainerRef.current && !viewerRef.current) {
      viewerRef.current = new Cesium.Viewer(cesiumContainerRef.current, {
        globe: false,
      });

      // Set initial camera view
      viewerRef.current.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-79.886626, 40.021649, 235.65),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-20),
          roll: 0,
        },
      });

      // Register sample entities with enhanced metadata
      if (geoCopilotRef.current) {
        const entityRegistry = geoCopilotRef.current.getEntityRegistry();
        
        // Register building with rich metadata
        entityRegistry.register(
          'building_01',
          'Main Building',
          'building',
          {
            bounds: {
              north: 40.022,
              south: 40.021,
              east: -79.885,
              west: -79.887,
              minHeight: 0,
              maxHeight: 100
            },
            center: {
              longitude: -79.886,
              latitude: 40.0215,
              height: 50
            },
            level: 1,
            floor: 'Ground Floor'
          },
          {
            category: 'Architecture',
            description: 'Main office building with 5 floors',
            properties: {
              floors: 5,
              yearBuilt: 2020,
              architect: 'Modern Architects Inc.'
            },
            tags: ['office', 'commercial', 'modern']
          },
          null, // Cesium object (null for demo)
          ['main building', 'office building', 'primary structure']
        );

        // Register site elements
        entityRegistry.register(
          'site_01',
          'Site Plan',
          'site',
          {
            bounds: {
              north: 40.023,
              south: 40.020,
              east: -79.884,
              west: -79.888,
              minHeight: 0,
              maxHeight: 10
            },
            center: {
              longitude: -79.886,
              latitude: 40.0215,
              height: 5
            }
          },
          {
            category: 'Site',
            description: 'Landscaped site with parking and green areas',
            properties: {
              area: '5000 sqm',
              parkingSpaces: 50
            },
            tags: ['landscape', 'parking', 'green space']
          }
        );

        // Register structural elements
        entityRegistry.register(
          'structural_01',
          'Structural Frame',
          'structural',
          {
            bounds: {
              north: 40.022,
              south: 40.021,
              east: -79.885,
              west: -79.887,
              minHeight: 0,
              maxHeight: 100
            },
            center: {
              longitude: -79.886,
              latitude: 40.0215,
              height: 50
            }
          },
          {
            category: 'Structural',
            description: 'Steel frame structure with concrete foundations',
            properties: {
              material: 'steel',
              foundationType: 'concrete'
            },
            tags: ['steel', 'concrete', 'foundation']
          }
        );

        // Update validation context
        const validationLayer = geoCopilotRef.current.getValidationLayer();
        validationLayer.updateContext({
          availableEntities: entityRegistry.getAll(),
          currentScene: {
            bounds: { north: 40.023, south: 40.020, east: -79.884, west: -79.888 },
            camera: { position: [-79.886626, 40.021649, 235.65], orientation: { heading: 0, pitch: -20, roll: 0 } }
          },
          userPermissions: ['layer_control', 'camera_control'],
          systemCapabilities: ['layer_management', 'camera_control']
        });
      }
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  const handleCommand = async () => {
    if (!input.trim() || !geoCopilotRef.current) return;

    setLoading(true);
    setResult(null);
    setStreamProgress(null);

    try {
      // Execute command with enhanced features
      const executionResult = await geoCopilotRef.current.execute(input);
      setResult(executionResult);

      // Get suggestions
      const contextManager = geoCopilotRef.current.getContextManager();
      setSuggestions(contextManager.getSuggestions());
      setContextInfo(contextManager.getContextForAI());

    } catch (error) {
      setResult({
        success: false,
        output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTime: 0
      });
    } finally {
      setLoading(false);
      setInput('');
    }
  };

  const handleStreamCommand = async () => {
    if (!input.trim() || !geoCopilotRef.current) return;

    setLoading(true);
    setResult(null);
    setStreamProgress(null);

    try {
      // Execute command with streaming feedback
      for await (const step of geoCopilotRef.current.executeStream(input)) {
        setStreamProgress(step);
        
        if (step.type === 'complete' && step.data) {
          setResult(step.data as ExecutionResult);
        }
      }

      // Get suggestions
      const contextManager = geoCopilotRef.current.getContextManager();
      setSuggestions(contextManager.getSuggestions());

    } catch (error) {
      setResult({
        success: false,
        output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTime: 0
      });
    } finally {
      setLoading(false);
      setInput('');
    }
  };

  const showStatus = () => {
    if (!geoCopilotRef.current) return;
    
    const status = geoCopilotRef.current.getStatus();
    console.log('GeoCopilot Status:', status);
    
    const popup = window.open('', '_blank', 'width=600,height=400');
    popup?.document.write(`
      <html>
        <head><title>GeoCopilot Status</title></head>
        <body>
          <h1>GeoCopilot Status</h1>
          <pre>${JSON.stringify(status, null, 2)}</pre>
        </body>
      </html>
    `);
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 400, padding: 16, background: '#f8f9fa', overflowY: 'auto' }}>
        <h2>🤖 Enhanced GeoCopilot</h2>
        
        {/* Input Section */}
        <div style={{ marginBottom: 16 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Try: 'show building near the entrance' or 'fly to structural elements'"
            style={{ width: '100%', height: 80, marginBottom: 8 }}
          />
          
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={handleCommand}
              disabled={loading}
              style={{ flex: 1, padding: 8 }}
            >
              {loading ? '🤔 Processing...' : '🚀 Execute'}
            </button>
            
            <button 
              onClick={handleStreamCommand}
              disabled={loading}
              style={{ flex: 1, padding: 8 }}
            >
              {loading ? '📊 Streaming...' : '📊 Stream'}
            </button>
          </div>
        </div>

        {/* Progress Indicator */}
        {streamProgress && (
          <div style={{ marginBottom: 16, padding: 12, background: '#e3f2fd', borderRadius: 4 }}>
            <div style={{ marginBottom: 8 }}>
              <strong>{streamProgress.message}</strong>
            </div>
            <div style={{ 
              width: '100%', 
              height: 8, 
              background: '#ddd', 
              borderRadius: 4,
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${streamProgress.progress * 100}%`,
                height: '100%',
                background: '#2196f3',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ marginBottom: 16 }}>
            <h4>Result:</h4>
            <div style={{ 
              padding: 12, 
              background: result.success ? '#e8f5e8' : '#ffebee',
              borderRadius: 4,
              marginBottom: 8
            }}>
              <div style={{ color: result.success ? 'green' : 'red', marginBottom: 4 }}>
                {result.success ? '✅' : '❌'} {result.output}
              </div>
              {result.executionTime > 0 && (
                <small>Execution time: {result.executionTime}ms</small>
              )}
            </div>

            {/* Intent Information */}
            {result.intent && (
              <div style={{ marginBottom: 8 }}>
                <strong>Intent:</strong> {result.intent.type} 
                (confidence: {(result.intent.confidence * 100).toFixed(1)}%)
              </div>
            )}

            {/* Entity Information */}
            {result.entities && result.entities.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <strong>Entities:</strong>
                <ul style={{ margin: 4, paddingLeft: 20 }}>
                  {result.entities.map(entity => (
                    <li key={entity.id}>
                      {entity.name} ({entity.semantic.category})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Validation Information */}
            {result.validation && (
              <div style={{ marginBottom: 8 }}>
                <strong>Validation:</strong>
                {result.validation.errors.length > 0 && (
                  <div style={{ color: 'red', fontSize: 'small' }}>
                    Errors: {result.validation.errors.join(', ')}
                  </div>
                )}
                {result.validation.warnings.length > 0 && (
                  <div style={{ color: 'orange', fontSize: 'small' }}>
                    Warnings: {result.validation.warnings.join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4>💡 Suggestions:</h4>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {suggestions.map((suggestion, index) => (
                <li key={index} style={{ marginBottom: 4 }}>
                  <button
                    onClick={() => setInput(suggestion.replace('Try: ', ''))}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: '#2196f3', 
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: 0
                    }}
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Context Information */}
        {contextInfo && (
          <div style={{ marginBottom: 16 }}>
            <h4>📊 Context:</h4>
            <pre style={{ 
              fontSize: 'small', 
              background: '#f5f5f5', 
              padding: 8, 
              borderRadius: 4,
              overflow: 'auto',
              maxHeight: 100
            }}>
              {contextInfo}
            </pre>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={showStatus} style={{ flex: 1, padding: 8 }}>
            📈 Status
          </button>
          <button 
            onClick={() => {
              if (geoCopilotRef.current) {
                const contextManager = geoCopilotRef.current.getContextManager();
                contextManager.clearDialogHistory();
                setResult(null);
                setSuggestions([]);
              }
            }}
            style={{ flex: 1, padding: 8 }}
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div ref={cesiumContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
};

export default EnhancedExample; 