import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { CesiumController } from "../core/CesiumController";
import { useGeoCopilot } from "../hooks/useGeoCopilot";

export const DemoPage = () => {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const { run, commands, loading, error } = useGeoCopilot();

  // Initialize Cesium viewer
  useEffect(() => {
    if (cesiumContainerRef.current && !viewerRef.current) {
      viewerRef.current = new Cesium.Viewer(cesiumContainerRef.current);
      CesiumController.setViewer(viewerRef.current);
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  const handleCommand = async () => {
    if (!input.trim()) return;
    await run(input);
    setInput("");
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: 300, padding: 16, background: "#f8f9fa" }}>
        <h2>🧠 GeoCopilot dashboard</h2>

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="for example: fly to the main building"
          style={{ width: "100%", marginBottom: 8, padding: 8 }}
        />

        <button onClick={handleCommand} disabled={loading}>
          🚀 Execute command
        </button>

        {loading && <p>Parsing command...</p>}
        {error && <p style={{ color: "red" }}>❌ {error}</p>}

        <pre style={{ fontSize: 12, background: "#eee", padding: 8 }}>
          {JSON.stringify(commands, null, 2)}
        </pre>
      </div>

      <div style={{ flex: 1 }}>
        <div ref={cesiumContainerRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
};