import * as Cesium from "cesium";
let viewer: Cesium.Viewer | null = null;

export const CesiumController = {
  setViewer: (v: Cesium.Viewer) => {
    viewer = v;
  },

  flyTo: async (entityId: string) => {
    if (!viewer) throw new Error("Viewer not set");

    const entity = viewer.entities.getById(entityId);
    if (!entity) throw new Error(`Entity ${entityId} not found`);

    await viewer.flyTo(entity);
  },

  highlight: async (entityId: string, color: string = "yellow") => {
    if (!viewer) throw new Error("Viewer not set");
    const entity = viewer.entities.getById(entityId);
    if (!entity) throw new Error(`Entity ${entityId} not found`);
    // Type-safe color lookup
    const colorKey = color.toUpperCase() as keyof typeof Cesium.Color;
    const cesiumColor = Cesium.Color[colorKey] instanceof Cesium.Color
      ? Cesium.Color[colorKey] as Cesium.Color
      : Cesium.Color.YELLOW;
    if (entity.polygon) {
      entity.polygon.material = new Cesium.ColorMaterialProperty(cesiumColor.withAlpha(0.7));
    } else if (entity.polyline) {
      entity.polyline.material = new Cesium.ColorMaterialProperty(cesiumColor);
    } else if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(cesiumColor);
    } else {
      // fallback: try to set color property if exists
      (entity as unknown as Record<string, unknown>).color = cesiumColor;
    }
  }
};