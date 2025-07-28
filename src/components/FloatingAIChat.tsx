import React, { useState, useRef, useEffect } from 'react';
import { FormattedAIResponse } from './FormattedAIResponse';
import type { SceneData } from '../hooks/useSceneUnderstanding';

interface FloatingAIChatProps {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  initialOpen?: boolean;
  // GeoCopilot props
  loading: boolean;
  error: string | null;
  lastResponse: string | null;
  run: (input: string) => Promise<void>;
  clearHistory: () => void;
  clarificationQuestions: string[];
  sceneData: SceneData;
  getAIContext: () => string;
  // AI Capabilities management
  onCapabilitiesChange?: (capabilities: AICapabilities) => void;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

interface AICapabilities {
  layerControl: boolean;
  featureControl: boolean;
  cameraControl: boolean;
  selectionAnalysis: boolean;
}

export const FloatingAIChat: React.FC<FloatingAIChatProps> = ({
  position = 'bottom-right',
  initialOpen = false,
  loading,
  error,
  lastResponse,
  run,
  clearHistory,
  clarificationQuestions,
  sceneData,
  getAIContext,
  onCapabilitiesChange
}) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showContextModal, setShowContextModal] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [input, setInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [aiCapabilities, setAICapabilities] = useState<AICapabilities>({
    layerControl: true,
    featureControl: true,
    cameraControl: true,
    selectionAnalysis: true
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, lastResponse]);

  // Add AI response to chat history when it arrives
  useEffect(() => {
    if (lastResponse && !loading) {
      setChatHistory(prev => [...prev, {
        id: Date.now().toString(),
        type: 'ai',
        content: lastResponse,
        timestamp: new Date()
      }]);
    }
  }, [lastResponse, loading]);

  // Add error to chat history
  useEffect(() => {
    if (error) {
      setChatHistory(prev => [...prev, {
        id: Date.now().toString(),
        type: 'ai',
        content: `❌ Error: ${error}`,
        timestamp: new Date()
      }]);
    }
  }, [error]);

  // Update last scan time when sceneData changes
  useEffect(() => {
    if (sceneData && sceneData.layers.length > 0) {
      setLastScanTime(new Date());
    }
  }, [sceneData]);

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: input,
      timestamp: new Date()
    };

    setChatHistory(prev => [...prev, userMessage]);
    setInput('');

    try {
      await run(input);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setChatHistory([]);
    clearHistory();
  };

  const toggleCapability = (capability: keyof AICapabilities) => {
    const newCapabilities = {
      ...aiCapabilities,
      [capability]: !aiCapabilities[capability]
    };
    setAICapabilities(newCapabilities);
    onCapabilitiesChange?.(newCapabilities);
  };

  const getPositionStyles = () => {
    const baseStyles = {
      position: 'fixed' as const,
      zIndex: 1000,
    };

    switch (position) {
      case 'bottom-right':
        return { ...baseStyles, bottom: '20px', right: '20px' };
      case 'bottom-left':
        return { ...baseStyles, bottom: '150px', left: '20px' };
      case 'top-right':
        return { ...baseStyles, top: '20px', right: '20px' };
      case 'top-left':
        return { ...baseStyles, top: '20px', left: '20px' };
      default:
        return { ...baseStyles, bottom: '20px', right: '20px' };
    }
  };

  return (
    <>
      <div style={getPositionStyles()}>
        {/* Chat Button (when closed) */}
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: '#333',
              border: 'none',
              color: 'white',
              fontSize: '24px',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.background = '#555';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.background = '#333';
            }}
          >
            🤖
          </button>
        )}

        {/* Chat Window */}
        {isOpen && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-end'
          }}>
            {/* Main Chat Window */}
            <div style={{
              width: isMinimized ? '300px' : '350px',
              height: isMinimized ? '60px' : '500px',
              background: 'white',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              border: '1px solid #e0e0e0'
            }}>
              {/* Header */}
              <div style={{
                background: '#333',
                color: 'white',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
              onClick={() => setIsMinimized(!isMinimized)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>🤖</span>
                  <span style={{ fontWeight: '600' }}>AI Assistant</span>
                  {loading && (
                    <div style={{
                      width: '12px',
                      height: '12px',
                      border: '2px solid transparent',
                      borderTop: '2px solid white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSettings(!showSettings);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px',
                      borderRadius: '4px',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    title="Settings"
                  >
                    ⚙️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearChat();
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px',
                      borderRadius: '4px',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    title="Clear chat"
                  >
                    🗑️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px',
                      borderRadius: '4px',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Chat Content */}
              {!isMinimized && (
                <>
                  {/* Messages */}
                  <div style={{
                    flex: 1,
                    padding: '16px',
                    overflowY: 'auto',
                    background: '#f8f9fa'
                  }}>
                    {chatHistory.length === 0 && (
                      <div style={{
                        textAlign: 'center',
                        color: '#666',
                        fontSize: '14px',
                        marginTop: '20px'
                      }}>
                        👋 Hi! I'm your AI assistant. How can I help you today?
                      </div>
                    )}
                    
                    {chatHistory.map((message) => (
                      <div
                        key={message.id}
                        style={{
                          marginBottom: '12px',
                          display: 'flex',
                          justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start'
                        }}
                      >
                        <div style={{
                          maxWidth: '80%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: message.type === 'user' 
                            ? '#333'
                            : 'white',
                          color: message.type === 'user' ? 'white' : '#333',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                          fontSize: '14px',
                          lineHeight: '1.4',
                          border: message.type === 'ai' ? '1px solid #e0e0e0' : 'none'
                        }}>
                          {message.type === 'ai' ? (
                            <FormattedAIResponse response={message.content} />
                          ) : (
                            message.content
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Clarification Questions */}
                    {clarificationQuestions && clarificationQuestions.length > 0 && (
                      <div style={{
                        background: '#f8f9fa',
                        border: '1px solid #e0e0e0',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '12px'
                      }}>
                        <div style={{ marginBottom: '8px', fontWeight: '600', color: '#333' }}>
                          🤔 Clarification needed:
                        </div>
                        {clarificationQuestions.map((q: string, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              cursor: 'pointer',
                              padding: '4px 8px',
                              marginBottom: '4px',
                              background: 'white',
                              borderRadius: '4px',
                              border: '1px solid #e0e0e0',
                              fontSize: '13px',
                              color: '#333',
                              transition: 'background 0.2s ease'
                            }}
                            onClick={() => setInput(q)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#f0f0f0';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'white';
                            }}
                          >
                            {q}
                          </div>
                        ))}
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input Area */}
                  <div style={{
                    padding: '16px',
                    borderTop: '1px solid #e0e0e0',
                    background: 'white'
                  }}>
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'flex-end'
                    }}>
                      <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask me anything about the scene..."
                        disabled={loading}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: '1px solid #e0e0e0',
                          borderRadius: '20px',
                          fontSize: '14px',
                          color: '#333',
                          outline: 'none',
                          background: loading ? '#f5f5f5' : 'white',
                          transition: 'border-color 0.2s ease'
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#333';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e0e0e0';
                        }}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!input.trim() || loading}
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: input.trim() && !loading 
                            ? '#333'
                            : '#ccc',
                          border: 'none',
                          color: 'white',
                          cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (input.trim() && !loading) {
                            e.currentTarget.style.background = '#555';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (input.trim() && !loading) {
                            e.currentTarget.style.background = '#333';
                          }
                        }}
                      >
                        ➤
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Settings Panel (Right Side) */}
            {showSettings && !isMinimized && (
              <div style={{
                width: '280px',
                height: '500px',
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
                marginLeft: '12px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: '1px solid #e0e0e0'
              }}>
                {/* Settings Header */}
                <div style={{
                  background: '#555',
                  color: 'white',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>⚙️</span>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>Settings</span>
                  </div>
                  <button
                    onClick={() => setShowSettings(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px',
                      borderRadius: '4px',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Settings Content */}
                <div style={{
                  flex: 1,
                  padding: '16px',
                  overflowY: 'auto',
                  background: '#f8f9fa'
                }}>
                  {/* Scene Information */}
                  <div style={{ marginBottom: '20px' }}>
                    <h5 style={{ margin: '0 0 12px 0', color: '#333', fontSize: '14px', fontWeight: '600' }}>
                      📊 Scene Overview
                    </h5>
                    <div style={{
                      background: 'white',
                      padding: '12px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: '#333',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                      border: '1px solid #e0e0e0'
                    }}>
                      {sceneData && sceneData.layers.length > 0 ? (
                        <>
                          <div style={{ marginBottom: '6px' }}>
                            <strong>Type:</strong> {sceneData.sceneOverview?.sceneType || 'Unknown'}
                          </div>
                          <div style={{ marginBottom: '6px' }}>
                            <strong>Layers:</strong> {sceneData.sceneOverview?.totalLayers || sceneData.layers.length}
                          </div>
                          <div>
                            <strong>Features:</strong> {sceneData.sceneOverview?.totalFeatures || sceneData.features.length}
                          </div>
                          {sceneData.features.length === 0 && sceneData.layers.length > 0 && (
                            <div style={{ 
                              marginTop: '8px',
                              color: '#666', 
                              fontStyle: 'italic',
                              fontSize: '11px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <div style={{
                                width: '8px',
                                height: '8px',
                                border: '2px solid transparent',
                                borderTop: '2px solid #666',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite'
                              }} />
                              Loading features...
                            </div>
                          )}
                          {lastScanTime && (
                            <div style={{ 
                              marginTop: '8px',
                              color: '#666', 
                              fontSize: '11px',
                              borderTop: '1px solid #e0e0e0',
                              paddingTop: '8px'
                            }}>
                              <strong>Last scan:</strong> {lastScanTime.toLocaleTimeString()}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ 
                          color: '#666', 
                          fontStyle: 'italic',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <div style={{
                            width: '12px',
                            height: '12px',
                            border: '2px solid transparent',
                            borderTop: '2px solid #666',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                          }} />
                          Scanning scene...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AI Capabilities */}
                  <div style={{ marginBottom: '20px' }}>
                    <h5 style={{ margin: '0 0 12px 0', color: '#333', fontSize: '14px', fontWeight: '600' }}>
                      🧠 AI Capabilities
                    </h5>
                    <div style={{
                      background: 'white',
                      padding: '12px',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                      border: '1px solid #e0e0e0'
                    }}>
                      {Object.entries(aiCapabilities).map(([key, enabled]) => (
                        <label key={key} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          fontSize: '13px',
                          cursor: 'pointer',
                          color: '#333',
                          marginBottom: '8px',
                          padding: '4px 0'
                        }}>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => toggleCapability(key as keyof AICapabilities)}
                            style={{ 
                              margin: 0, 
                              transform: 'scale(1.1)',
                              accentColor: '#333'
                            }}
                          />
                          <span>
                            {key === 'layerControl' && 'Layer Control'}
                            {key === 'featureControl' && 'Feature Control'}
                            {key === 'cameraControl' && 'Camera Control'}
                            {key === 'selectionAnalysis' && 'Selection Analysis'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* AI Context Button */}
                  <button
                    onClick={() => setShowContextModal(true)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#333',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.background = '#555';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.background = '#333';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                    }}
                  >
                    🔍 View AI Context
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Context Modal */}
      {showContextModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '1000px',
            height: '90%',
            maxHeight: '800px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            border: '1px solid #e0e0e0'
          }}>
            {/* Modal Header */}
            <div style={{
              background: '#333',
              color: 'white',
              padding: '16px 20px',
              borderRadius: '8px 8px 0 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                🤖 AI Context & Memory
              </h3>
              <button
                onClick={() => setShowContextModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '20px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{
              flex: 1,
              padding: '20px',
              overflowY: 'auto',
              background: '#f8f9fa'
            }}>
              <div style={{
                fontFamily: 'monospace',
                color: '#000',
                fontSize: '13px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                background: 'white',
                padding: '20px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
              }}>
                {getAIContext()}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}; 