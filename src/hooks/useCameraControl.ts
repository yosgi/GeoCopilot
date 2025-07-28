import { useCallback, useRef, useState } from 'react';
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as Cesium from "cesium";

// camera control hook
export const useCameraControl = () => {
    const [loading, setLoading] = useState(false);
    const viewerRef = useRef<Cesium.Viewer | null>(null);
    const cameraRef = useRef<Cesium.Camera | null>(null);

    // register Cesium viewer
    const registerViewer = useCallback((viewer: Cesium.Viewer) => {
        viewerRef.current = viewer;
        cameraRef.current = viewer.camera;
    }, []);

    // fly to position
    const flyTo = useCallback(async (options: {
        longitude?: number;
        latitude?: number;
        height?: number;
        heading?: number;
        pitch?: number;
        roll?: number;
        duration?: number;
    }) => {
        if (!cameraRef.current) {
            throw new Error('Camera not initialized');
        }

        setLoading(true);
        try {
            const {
                longitude,
                latitude,
                height = 1000,
                heading = 0,
                pitch = -Math.PI / 2,
                roll = 0,
                duration = 2.0
            } = options;

            if (longitude !== undefined && latitude !== undefined) {
                await cameraRef.current.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
                    orientation: {
                        heading: Cesium.Math.toRadians(heading),
                        pitch: Cesium.Math.toRadians(pitch),
                        roll: Cesium.Math.toRadians(roll)
                    },
                    duration
                });
            }

            return { 
                success: true, 
                message: `Successfully flew to position: ${longitude?.toFixed(4)}, ${latitude?.toFixed(4)}, height: ${height}m` 
            };
        } finally {
            setLoading(false);
        }
    }, []);

    // set camera position
    const setPosition = useCallback(async (options: {
        longitude: number;
        latitude: number;
        height?: number;
        heading?: number;
        pitch?: number;
        roll?: number;
    }) => {
        if (!cameraRef.current) {
            throw new Error('Camera not initialized');
        }

        setLoading(true);
        try {
            const {
                longitude,
                latitude,
                height = 1000,
                heading = 0,
                pitch = -Math.PI / 2,
                roll = 0
            } = options;

            cameraRef.current.setView({
                destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
                orientation: {
                    heading: Cesium.Math.toRadians(heading),
                    pitch: Cesium.Math.toRadians(pitch),
                    roll: Cesium.Math.toRadians(roll)
                }
            });

            return { 
                success: true, 
                message: `Successfully set camera position to: ${longitude.toFixed(4)}, ${latitude.toFixed(4)}, height: ${height}m` 
            };
        } finally {
            setLoading(false);
        }
    }, []);

    // zoom in/out
    const zoom = useCallback(async (factor: number) => {
        if (!cameraRef.current) {
            throw new Error('Camera not initialized');
        }

        setLoading(true);
        try {
            // Simple zoom by adjusting the camera's distance
            const currentPosition = cameraRef.current.position;
            const currentHeading = cameraRef.current.heading;
            const currentPitch = cameraRef.current.pitch;
            
            // Move camera closer or further based on factor
            const direction = factor > 1 ? -1 : 1;
            const moveDistance = 1000 * Math.abs(factor - 1);
            
            const normalizedPosition = Cesium.Cartesian3.normalize(currentPosition, new Cesium.Cartesian3());
            const scaledVector = Cesium.Cartesian3.multiplyByScalar(normalizedPosition, direction * moveDistance, new Cesium.Cartesian3());
            const newPosition = Cesium.Cartesian3.add(currentPosition, scaledVector, new Cesium.Cartesian3());
            
            await cameraRef.current.flyTo({
                destination: newPosition,
                orientation: {
                    heading: currentHeading,
                    pitch: currentPitch,
                    roll: cameraRef.current.roll
                },
                duration: 1.0
            });

            return { 
                success: true, 
                message: `Successfully zoomed ${factor > 1 ? 'in' : 'out'} by factor ${factor}` 
            };
        } finally {
            setLoading(false);
        }
    }, []);

    // rotate camera
    const rotate = useCallback(async (heading: number, pitch?: number) => {
        if (!cameraRef.current) {
            throw new Error('Camera not initialized');
        }

        setLoading(true);
        try {
            const currentHeading = cameraRef.current.heading;
            const currentPitch = cameraRef.current.pitch;
            
            await cameraRef.current.flyTo({
                destination: cameraRef.current.position,
                orientation: {
                    heading: currentHeading + Cesium.Math.toRadians(heading),
                    pitch: pitch !== undefined ? Cesium.Math.toRadians(pitch) : currentPitch,
                    roll: cameraRef.current.roll
                },
                duration: 1.0
            });

            return { 
                success: true, 
                message: `Successfully rotated camera by ${heading} degrees` 
            };
        } finally {
            setLoading(false);
        }
    }, []);

    // look at point
    const lookAt = useCallback(async (options: {
        longitude: number;
        latitude: number;
        height?: number;
        distance?: number;
    }) => {
        if (!cameraRef.current) {
            throw new Error('Camera not initialized');
        }

        setLoading(true);
        try {
            const {
                longitude,
                latitude,
                height = 0,
                distance = 1000
            } = options;

            const target = Cesium.Cartesian3.fromDegrees(longitude, latitude, height);
            
            // Calculate position at distance from target
            const targetNormalized = Cesium.Cartesian3.normalize(target, new Cesium.Cartesian3());
            const cameraPosition = Cesium.Cartesian3.add(
                target,
                Cesium.Cartesian3.multiplyByScalar(targetNormalized, distance, new Cesium.Cartesian3()),
                new Cesium.Cartesian3()
            );
            
            await cameraRef.current.flyTo({
                destination: cameraPosition,
                orientation: {
                    heading: cameraRef.current.heading,
                    pitch: cameraRef.current.pitch,
                    roll: cameraRef.current.roll
                },
                duration: 2.0
            });

            return { 
                success: true, 
                message: `Successfully looking at point: ${longitude.toFixed(4)}, ${latitude.toFixed(4)}` 
            };
        } finally {
            setLoading(false);
        }
    }, []);

    // reset view
    const resetView = useCallback(async () => {
        if (!cameraRef.current) {
            throw new Error('Camera not initialized');
        }

        setLoading(true);
        try {
            await cameraRef.current.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(0, 0, 10000),
                orientation: {
                    heading: 0,
                    pitch: -Math.PI / 2,
                    roll: 0
                },
                duration: 2.0
            });

            return { 
                success: true, 
                message: 'Successfully reset camera view' 
            };
        } finally {
            setLoading(false);
        }
    }, []);

    // get current camera info
    const getCameraInfo = useCallback(() => {
        if (!cameraRef.current) {
            throw new Error('Camera not initialized');
        }

        const position = cameraRef.current.position;
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        
        return {
            longitude: Cesium.Math.toDegrees(cartographic.longitude),
            latitude: Cesium.Math.toDegrees(cartographic.latitude),
            height: cartographic.height,
            heading: Cesium.Math.toDegrees(cameraRef.current.heading),
            pitch: Cesium.Math.toDegrees(cameraRef.current.pitch),
            roll: Cesium.Math.toDegrees(cameraRef.current.roll)
        };
    }, []);

    return {
        // state
        loading,
        viewerRef,
        cameraRef,

        // register method
        registerViewer,

        // control methods
        flyTo,
        setPosition,
        zoom,
        rotate,
        lookAt,
        resetView,
        getCameraInfo,

        // convenient methods
        zoomIn: (factor = 0.5) => zoom(factor),
        zoomOut: (factor = 2.0) => zoom(factor),
        rotateLeft: (degrees = 90) => rotate(-degrees),
        rotateRight: (degrees = 90) => rotate(degrees),
        lookDown: (degrees = 45) => rotate(0, -degrees),
        lookUp: (degrees = 45) => rotate(0, degrees)
    };
};

export const createCameraControlTool = (cameraControl: ReturnType<typeof useCameraControl>) => {
    return tool(
        async ({ action, longitude, latitude, height, heading, pitch, roll, duration, factor, distance }) => {
            try {
                console.log(`📷 Camera control tool:`, { action, longitude, latitude, height, heading, pitch, roll, duration, factor, distance });

                switch (action.toLowerCase()) {
                    case 'flyto': {
                        if (longitude === undefined || latitude === undefined) {
                            throw new Error("longitude and latitude are required");
                        }
                        const result = await cameraControl.flyTo({ longitude, latitude, height, heading, pitch, roll, duration });
                        return result.message;
                    }

                    case 'setposition': {
                        if (longitude === undefined || latitude === undefined) {
                            throw new Error("longitude and latitude are required");
                        }
                        const result = await cameraControl.setPosition({ longitude, latitude, height, heading, pitch, roll });
                        return result.message;
                    }

                    case 'zoom': {
                        if (factor === undefined) {
                            throw new Error("factor is required");
                        }
                        const result = await cameraControl.zoom(factor);
                        return result.message;
                    }

                    case 'rotate': {
                        if (heading === undefined) {
                            throw new Error("heading is required");
                        }
                        const result = await cameraControl.rotate(heading, pitch);
                        return result.message;
                    }

                    case 'lookat': {
                        if (longitude === undefined || latitude === undefined) {
                            throw new Error("longitude and latitude are required");
                        }
                        const result = await cameraControl.lookAt({ longitude, latitude, height, distance });
                        return result.message;
                    }

                    case 'reset': {
                        const result = await cameraControl.resetView();
                        return result.message;
                    }

                    case 'zoomin': {
                        const result = await cameraControl.zoomIn(factor);
                        return result.message;
                    }

                    case 'zoomout': {
                        const result = await cameraControl.zoomOut(factor);
                        return result.message;
                    }

                    case 'rotateleft': {
                        const result = await cameraControl.rotateLeft(heading);
                        return result.message;
                    }

                    case 'rotateright': {
                        const result = await cameraControl.rotateRight(heading);
                        return result.message;
                    }

                    case 'lookdown': {
                        const result = await cameraControl.lookDown(pitch);
                        return result.message;
                    }

                    case 'lookup': {
                        const result = await cameraControl.lookUp(pitch);
                        return result.message;
                    }

                    case 'info': {
                        const info = cameraControl.getCameraInfo();
                        return `Current camera position:
Longitude: ${info.longitude.toFixed(4)}°
Latitude: ${info.latitude.toFixed(4)}°
Height: ${info.height.toFixed(1)}m
Heading: ${info.heading.toFixed(1)}°
Pitch: ${info.pitch.toFixed(1)}°
Roll: ${info.roll.toFixed(1)}°`;
                    }

                    default:
                        throw new Error(`Unknown action: ${action}`);
                }
            } catch (error) {
                return `❌ ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        },
        {
            name: "cameraControl",
            description: `Control camera position and orientation in the 3D scene.

Available Actions:
- flyTo: Smoothly fly to a position
- setPosition: Instantly set camera position
- zoom: Zoom in/out by factor
- rotate: Rotate camera by heading/pitch
- lookAt: Look at a specific point
- reset: Reset to default view
- zoomIn: Zoom in (factor 0.5)
- zoomOut: Zoom out (factor 2.0)
- rotateLeft: Rotate left by degrees
- rotateRight: Rotate right by degrees
- lookDown: Look down by degrees
- lookUp: Look up by degrees
- info: Get current camera information

Examples:
- "fly to Beijing" → action: "flyTo", longitude: 116.4074, latitude: 39.9042
- "zoom in" → action: "zoomIn"
- "rotate left 90 degrees" → action: "rotateLeft", heading: 90`,
            schema: z.object({
                action: z.enum([
                    "flyTo", "setPosition", "zoom", "rotate", "lookAt", "reset",
                    "zoomIn", "zoomOut", "rotateLeft", "rotateRight", "lookDown", "lookUp", "info"
                ]).describe("Action to perform"),
                longitude: z.number().optional().describe("Longitude in degrees"),
                latitude: z.number().optional().describe("Latitude in degrees"),
                height: z.number().optional().describe("Height in meters"),
                heading: z.number().optional().describe("Heading in degrees"),
                pitch: z.number().optional().describe("Pitch in degrees"),
                roll: z.number().optional().describe("Roll in degrees"),
                duration: z.number().optional().describe("Animation duration in seconds"),
                factor: z.number().optional().describe("Zoom factor"),
                distance: z.number().optional().describe("Distance in meters")
            })
        }
    );
};
