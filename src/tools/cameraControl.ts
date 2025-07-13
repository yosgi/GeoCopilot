import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as Cesium from "cesium";
import { SceneContextManager } from "../hooks/useSceneContext";


interface CameraControlResult {
  success: boolean;
  message: string;
  finalPosition?: {
    longitude: number;
    latitude: number;
    height: number;
    heading: number;
    pitch: number;
    roll: number;
  };
}

interface CameraPreset {
  name: string;
  position: [number, number, number]; // [lng, lat, height]
  orientation: {
    heading: number; // 度数
    pitch: number;   // 度数
    roll: number;    // 度数
  };
  description: string;
}

// extend SceneContextManager to support camera control
declare module "../hooks/useSceneContext" {
  interface SceneContextManager {
    // camera control methods
    flyToLocation(coords: [number, number, number], duration?: number): Promise<CameraControlResult>;
    flyToTarget(targetName: string, duration?: number): Promise<CameraControlResult>;
    setViewOrientation(heading: number, pitch: number, roll: number): Promise<CameraControlResult>;
    setCameraHeight(height: number, duration?: number): Promise<CameraControlResult>;
    applyPreset(presetName: string, duration?: number): Promise<CameraControlResult>;
    resetCameraView(duration?: number): Promise<CameraControlResult>;
    
    // preset management
    registerCameraPreset(preset: CameraPreset): void;
    getCameraPresets(): CameraPreset[];
    getCurrentCameraState(): CameraState;
  }
}

// 相机状态接口
interface CameraState {
  position: [number, number, number];
  orientation: {
    heading: number;
    pitch: number;
    roll: number;
  };
  viewDistance: number;
}

// 相机控制器类
class CameraController {
  private viewer: Cesium.Viewer;
  private presets: Map<string, CameraPreset> = new Map();
  private sceneContext: SceneContextManager; // 场景上下文引用

  constructor(viewer: Cesium.Viewer, sceneContext: SceneContextManager) {
    this.viewer = viewer;
    this.sceneContext = sceneContext;
    this.initializeDefaultPresets();
  }

  // 初始化默认预设视角
  private initializeDefaultPresets() {
    const defaultPresets: CameraPreset[] = [
      {
        name: "overview",
        position: [-79.886626, 40.021649, 500],
        orientation: { heading: 0, pitch: -45, roll: 0 },
        description: "建筑群全景视角"
      },
      {
        name: "topview",
        position: [-79.886626, 40.021649, 300],
        orientation: { heading: 0, pitch: -90, roll: 0 },
        description: "俯视视角"
      },
      {
        name: "closeup",
        position: [-79.886626, 40.021649, 100],
        orientation: { heading: 0, pitch: -20, roll: 0 },
        description: "近距离视角"
      },
      {
        name: "north",
        position: [-79.886626, 40.021649, 250],
        orientation: { heading: 0, pitch: -30, roll: 0 },
        description: "朝北视角"
      },
      {
        name: "south",
        position: [-79.886626, 40.021649, 250],
        orientation: { heading: 180, pitch: -30, roll: 0 },
        description: "朝南视角"
      },
      {
        name: "east",
        position: [-79.886626, 40.021649, 250],
        orientation: { heading: 90, pitch: -30, roll: 0 },
        description: "朝东视角"
      },
      {
        name: "west",
        position: [-79.886626, 40.021649, 250],
        orientation: { heading: 270, pitch: -30, roll: 0 },
        description: "朝西视角"
      },
      {
        name: "initial",
        position: [-79.886626, 40.021649, 235.65],
        orientation: { heading: 0, pitch: -20, roll: 0 },
        description: "初始视角"
      }
    ];

    defaultPresets.forEach(preset => {
      this.presets.set(preset.name, preset);
    });
  }

  // 飞行到指定坐标
  async flyToLocation(coords: [number, number, number], duration: number = 2.0): Promise<CameraControlResult> {
    try {
      const [longitude, latitude, height] = coords;
      
      // 验证坐标有效性
      if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || height < 0) {
        return {
          success: false,
          message: `无效的坐标: 经度=${longitude}, 纬度=${latitude}, 高度=${height}`
        };
      }

      const destination = Cesium.Cartesian3.fromDegrees(longitude, latitude, height);

      await this.viewer.camera.flyTo({
        destination,
        duration
      });

      const finalState = this.getCurrentCameraState();

      return {
        success: true,
        message: `相机已飞行到坐标 (${longitude.toFixed(6)}, ${latitude.toFixed(6)}, ${height.toFixed(2)}m)`,
        finalPosition: {
          longitude: finalState.position[0],
          latitude: finalState.position[1],
          height: finalState.position[2],
          heading: finalState.orientation.heading,
          pitch: finalState.orientation.pitch,
          roll: finalState.orientation.roll
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `飞行失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // 飞行到预定义目标
  async flyToTarget(targetName: string, duration: number = 2.0): Promise<CameraControlResult> {
    const targets: Record<string, [number, number, number]> = {
      'building': [-79.886626, 40.021649, 150],
      'main_building': [-79.886626, 40.021649, 150],
      'architecture': [-79.886626, 40.021649, 120],
      'site_entrance': [-79.887735, 40.022564, 100],
      'center': [-79.886626, 40.021649, 200],
      'scene_center': [-79.886626, 40.021649, 200]
    };

    const targetCoords = targets[targetName.toLowerCase()];
    if (!targetCoords) {
      return {
        success: false,
        message: `未知目标 '${targetName}'。可用目标: ${Object.keys(targets).join(', ')}`
      };
    }

    return this.flyToLocation(targetCoords, duration);
  }

  // 设置相机朝向
  async setViewOrientation(heading: number, pitch: number, roll: number): Promise<CameraControlResult> {
    try {
      // 将度数转换为弧度
      const headingRad = Cesium.Math.toRadians(heading);
      const pitchRad = Cesium.Math.toRadians(pitch);
      const rollRad = Cesium.Math.toRadians(roll);

      this.viewer.camera.setView({
        orientation: {
          heading: headingRad,
          pitch: pitchRad,
          roll: rollRad
        }
      });

      return {
        success: true,
        message: `相机朝向已设置: 朝向=${heading}°, 俯仰=${pitch}°, 翻滚=${roll}°`
      };
    } catch (error) {
      return {
        success: false,
        message: `设置朝向失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // 设置相机高度
  async setCameraHeight(height: number, duration: number = 1.5): Promise<CameraControlResult> {
    try {
      if (height <= 0) {
        return {
          success: false,
          message: `高度必须大于0，当前值: ${height}`
        };
      }

      const currentPosition = this.viewer.camera.positionWC;
      const cartographic = Cesium.Cartographic.fromCartesian(currentPosition);
      
      const newDestination = Cesium.Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        height
      );

      await this.viewer.camera.flyTo({
        destination: newDestination,
        duration
      });

      return {
        success: true,
        message: `相机高度已设置为 ${height.toFixed(2)} 米`
      };
    } catch (error) {
      return {
        success: false,
        message: `设置高度失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // 应用预设视角
  async applyPreset(presetName: string, duration: number = 2.0): Promise<CameraControlResult> {
    const preset = this.presets.get(presetName.toLowerCase());
    if (!preset) {
      const availablePresets = Array.from(this.presets.keys()).join(', ');
      return {
        success: false,
        message: `未找到预设 '${presetName}'。可用预设: ${availablePresets}`
      };
    }

    try {
      const destination = Cesium.Cartesian3.fromDegrees(
        preset.position[0],
        preset.position[1],
        preset.position[2]
      );

      await this.viewer.camera.flyTo({
        destination,
        orientation: {
          heading: Cesium.Math.toRadians(preset.orientation.heading),
          pitch: Cesium.Math.toRadians(preset.orientation.pitch),
          roll: Cesium.Math.toRadians(preset.orientation.roll)
        },
        duration
      });

      return {
        success: true,
        message: `已应用预设视角 '${preset.name}': ${preset.description}`
      };
    } catch (error) {
      return {
        success: false,
        message: `应用预设失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // 重置到初始视角
  async resetCameraView(duration: number = 2.0): Promise<CameraControlResult> {
    return this.applyPreset('initial', duration);
  }

  // 注册新的相机预设
  registerCameraPreset(preset: CameraPreset): void {
    this.presets.set(preset.name.toLowerCase(), preset);
    console.log(`✅ 注册相机预设: ${preset.name} - ${preset.description}`);
  }

  // 获取所有预设
  getCameraPresets(): CameraPreset[] {
    return Array.from(this.presets.values());
  }

  // 获取当前相机状态
  getCurrentCameraState(): CameraState {
    const camera = this.viewer.camera;
    const position = camera.positionWC;
    const cartographic = Cesium.Cartographic.fromCartesian(position);

    return {
      position: [
        Cesium.Math.toDegrees(cartographic.longitude),
        Cesium.Math.toDegrees(cartographic.latitude),
        cartographic.height
      ],
      orientation: {
        heading: Cesium.Math.toDegrees(camera.heading),
        pitch: Cesium.Math.toDegrees(camera.pitch),
        roll: Cesium.Math.toDegrees(camera.roll)
      },
      viewDistance: cartographic.height
    };
  }
}

// 扩展 SceneContextManager
export function extendSceneContextManagerWithCamera(
  contextManager: SceneContextManager
): void {
  let cameraController: CameraController | null = null;

  // 当设置 viewer 时，初始化相机控制器
  const originalSetViewer = contextManager.setViewer.bind(contextManager);
  contextManager.setViewer = function(viewer: Cesium.Viewer) {
    originalSetViewer(viewer);
    cameraController = new CameraController(viewer, this);
    console.log('🎥 Camera controller initialized');
  };

  // 添加相机控制方法
  contextManager.flyToLocation = async function(coords, duration = 2.0) {
    if (!cameraController) {
      return { success: false, message: 'Camera controller not initialized' };
    }
    return cameraController.flyToLocation(coords, duration);
  };

  contextManager.flyToTarget = async function(targetName, duration = 2.0) {
    if (!cameraController) {
      return { success: false, message: 'Camera controller not initialized' };
    }
    return cameraController.flyToTarget(targetName, duration);
  };

  contextManager.setViewOrientation = async function(heading, pitch, roll) {
    if (!cameraController) {
      return { success: false, message: 'Camera controller not initialized' };
    }
    return cameraController.setViewOrientation(heading, pitch, roll);
  };

  contextManager.setCameraHeight = async function(height, duration = 1.5) {
    if (!cameraController) {
      return { success: false, message: 'Camera controller not initialized' };
    }
    return cameraController.setCameraHeight(height, duration);
  };

  contextManager.applyPreset = async function(presetName, duration = 2.0) {
    if (!cameraController) {
      return { success: false, message: 'Camera controller not initialized' };
    }
    return cameraController.applyPreset(presetName, duration);
  };

  contextManager.resetCameraView = async function(duration = 2.0) {
    if (!cameraController) {
      return { success: false, message: 'Camera controller not initialized' };
    }
    return cameraController.resetCameraView(duration);
  };

  contextManager.registerCameraPreset = function(preset) {
    if (!cameraController) {
      console.warn('Camera controller not initialized, preset will be registered when available');
      return;
    }
    cameraController.registerCameraPreset(preset);
  };

  contextManager.getCameraPresets = function() {
    if (!cameraController) {
      return [];
    }
    return cameraController.getCameraPresets();
  };

  contextManager.getCurrentCameraState = function() {
    if (!cameraController) {
      return {
        position: [0, 0, 0],
        orientation: { heading: 0, pitch: 0, roll: 0 },
        viewDistance: 1000
      };
    }
    return cameraController.getCurrentCameraState();
  };
}

// LangChain 相机控制工具
export const createCameraControlTool = (contextManager: SceneContextManager) => {
  return tool(
    async ({ action, coordinates, target, heading, pitch, roll, height, preset, duration }) => {
      try {
        console.log(`🎥 Camera control:`, { action, coordinates, target, heading, pitch, roll, height, preset, duration });

        switch (action.toLowerCase()) {
          case 'flyto':
            if (coordinates && coordinates.length >= 2) {
              const coords: [number, number, number] = [
                coordinates[0],
                coordinates[1],
                coordinates[2] || 200
              ];
              const result = await contextManager.flyToLocation(coords, duration);
              return result.message;
            } else if (target) {
              const result = await contextManager.flyToTarget(target, duration);
              return result.message;
            } else {
              throw new Error("需要 coordinates 或 target 参数");
            }

          case 'setorientation': {
            if (heading === undefined || pitch === undefined) {
              throw new Error("需要 heading 和 pitch 参数");
            }
            const result = await contextManager.setViewOrientation(
              heading, 
              pitch, 
              roll || 0
            );
            return result.message;
          }

          case 'setheight': {
            if (height === undefined) {
              throw new Error("需要 height 参数");
            }
            const heightResult = await contextManager.setCameraHeight(height, duration);
            return heightResult.message;
          }

          case 'preset': {
            if (!preset) {
              throw new Error("需要 preset 名称");
            }
            const presetResult = await contextManager.applyPreset(preset, duration);
            return presetResult.message;
          }

          case 'reset': {
            const resetResult = await contextManager.resetCameraView(duration);
            return resetResult.message;
          }

          case 'listpresets': {
            const presets = contextManager.getCameraPresets();
            const presetList = presets.map(p => `${p.name}: ${p.description}`).join('\n');
            return `🎥 可用相机预设:\n${presetList}`;
          }

          case 'status': {
            const currentState = contextManager.getCurrentCameraState();
            return `📍 当前相机状态:
位置: (${currentState.position[0].toFixed(6)}, ${currentState.position[1].toFixed(6)}, ${currentState.position[2].toFixed(2)}m)
朝向: ${currentState.orientation.heading.toFixed(1)}°
俯仰: ${currentState.orientation.pitch.toFixed(1)}°
翻滚: ${currentState.orientation.roll.toFixed(1)}°`;
          }

          default:
            throw new Error(`未知的相机操作: ${action}`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        console.error('🎥 Camera control error:', errorMessage);
        return `❌ 相机控制失败: ${errorMessage}`;
      }
    },
    {
      name: "cameraControl",
      description: `控制3D场景中的相机位置和朝向。支持飞行、旋转、缩放等操作。

可用操作:
- flyTo: 飞行到指定位置或目标
- setOrientation: 设置相机朝向
- setHeight: 设置相机高度
- preset: 应用预设视角
- reset: 重置到初始视角
- listPresets: 列出所有预设
- status: 查看当前相机状态

预设视角: overview, topview, closeup, north, south, east, west, initial

用户命令示例:
- "飞到建筑物" → flyTo + target="building"
- "切换到俯视视角" → preset="topview"  
- "设置高度500米" → setHeight + height=500
- "朝北看" → preset="north"
- "回到初始位置" → reset`,
      schema: z.object({
        action: z.enum([
          "flyTo", "setOrientation", "setHeight", 
          "preset", "reset", "listPresets", "status"
        ]).describe("相机操作类型"),
        coordinates: z.array(z.number()).optional().describe("目标坐标 [经度, 纬度, 高度]"),
        target: z.string().optional().describe("预定义目标名称"),
        heading: z.number().optional().describe("朝向角度(度)"),
        pitch: z.number().optional().describe("俯仰角度(度)"),
        roll: z.number().optional().describe("翻滚角度(度)"),
        height: z.number().optional().describe("相机高度(米)"),
        preset: z.string().optional().describe("预设视角名称"),
        duration: z.number().optional().describe("动画持续时间(秒)，默认2.0")
      })
    }
  );
};