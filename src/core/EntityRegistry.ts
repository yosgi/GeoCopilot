export interface SpatialBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  minHeight: number;
  maxHeight: number;
}

export interface SpatialCenter {
  longitude: number;
  latitude: number;
  height: number;
}

export interface EntitySpatial {
  bounds: SpatialBounds;
  center: SpatialCenter;
  level?: number;
  floor?: string;
}

export interface EntitySemantic {
  category: string;
  description: string;
  properties: Record<string, unknown>;
  tags: string[];
}

export interface EntityMetadata {
  id: string;
  name: string;
  type: string;
  aliases: string[];
  spatial: EntitySpatial;
  semantic: EntitySemantic;
  cesiumObject?: unknown;
  visible: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface EntityQuery {
  name?: string;
  type?: string;
  category?: string;
  tags?: string[];
  spatial?: {
    bounds?: Partial<SpatialBounds>;
    near?: { longitude: number; latitude: number; radius: number };
  };
  visible?: boolean;
}

export class EntityRegistry {
  private entities: Map<string, EntityMetadata> = new Map();
  private spatialIndex: Map<string, Set<string>> = new Map(); // spatial hash -> entity ids
  private nameIndex: Map<string, Set<string>> = new Map(); // name -> entity ids
  private typeIndex: Map<string, Set<string>> = new Map(); // type -> entity ids

  constructor() {
    this.initializeIndexes();
  }

  private initializeIndexes() {
    // Initialize spatial index with grid cells
    for (let i = 0; i < 360; i += 1) { // 1-degree grid
      for (let j = 0; j < 180; j += 1) {
        const key = `${i},${j}`;
        this.spatialIndex.set(key, new Set());
      }
    }
  }

  public register(
    id: string,
    name: string,
    type: string,
    spatial: EntitySpatial,
    semantic: EntitySemantic,
    cesiumObject?: unknown,
    aliases: string[] = []
  ): void {
    const entity: EntityMetadata = {
      id,
      name,
      type,
      aliases: [name, ...aliases],
      spatial,
      semantic,
      cesiumObject,
      visible: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.entities.set(id, entity);
    this.updateIndexes(entity);
  }

  public unregister(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    this.removeFromIndexes(entity);
    this.entities.delete(id);
    return true;
  }

  public get(id: string): EntityMetadata | undefined {
    return this.entities.get(id);
  }

  public find(query: EntityQuery): EntityMetadata[] {
    let candidates = new Set<string>(this.entities.keys());

    // Filter by name
    if (query.name) {
      const nameMatches = this.findByName(query.name);
      candidates = this.intersectSets(candidates, nameMatches);
    }

    // Filter by type
    if (query.type) {
      const typeMatches = this.typeIndex.get(query.type) || new Set();
      candidates = this.intersectSets(candidates, typeMatches);
    }

    // Filter by category
    if (query.category) {
      const categoryMatches = Array.from(this.entities.values())
        .filter(entity => entity.semantic.category === query.category)
        .map(entity => entity.id);
      candidates = this.intersectSets(candidates, new Set(categoryMatches));
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      const tagMatches = Array.from(this.entities.values())
        .filter(entity => query.tags!.some(tag => entity.semantic.tags.includes(tag)))
        .map(entity => entity.id);
      candidates = this.intersectSets(candidates, new Set(tagMatches));
    }

    // Filter by spatial constraints
    if (query.spatial) {
      if (query.spatial.bounds) {
        const boundsMatches = this.findByBounds(query.spatial.bounds);
        candidates = this.intersectSets(candidates, boundsMatches);
      }
      if (query.spatial.near) {
        const nearMatches = this.findNear(query.spatial.near);
        candidates = this.intersectSets(candidates, nearMatches);
      }
    }

    // Filter by visibility
    if (query.visible !== undefined) {
      const visibilityMatches = Array.from(this.entities.values())
        .filter(entity => entity.visible === query.visible)
        .map(entity => entity.id);
      candidates = this.intersectSets(candidates, new Set(visibilityMatches));
    }

    return Array.from(candidates).map(id => this.entities.get(id)!);
  }

  public findByName(name: string): Set<string> {
    const normalizedName = name.toLowerCase();
    const matches = new Set<string>();

    for (const [entityId, entity] of this.entities) {
      if (entity.name.toLowerCase().includes(normalizedName) ||
          entity.aliases.some(alias => alias.toLowerCase().includes(normalizedName))) {
        matches.add(entityId);
      }
    }

    return matches;
  }

  public findByType(type: string): EntityMetadata[] {
    const entityIds = this.typeIndex.get(type) || new Set();
    return Array.from(entityIds).map(id => this.entities.get(id)!);
  }

  public findByCategory(category: string): EntityMetadata[] {
    return Array.from(this.entities.values())
      .filter(entity => entity.semantic.category === category);
  }

  public findByBounds(bounds: Partial<SpatialBounds>): Set<string> {
    const matches = new Set<string>();

    for (const entity of this.entities.values()) {
      const entityBounds = entity.spatial.bounds;
      
      if (bounds.north !== undefined && entityBounds.north > bounds.north) continue;
      if (bounds.south !== undefined && entityBounds.south < bounds.south) continue;
      if (bounds.east !== undefined && entityBounds.east > bounds.east) continue;
      if (bounds.west !== undefined && entityBounds.west < bounds.west) continue;
      if (bounds.minHeight !== undefined && entityBounds.minHeight < bounds.minHeight) continue;
      if (bounds.maxHeight !== undefined && entityBounds.maxHeight > bounds.maxHeight) continue;

      matches.add(entity.id);
    }

    return matches;
  }

  public findNear(point: { longitude: number; latitude: number; radius: number }): Set<string> {
    const matches = new Set<string>();

    for (const entity of this.entities.values()) {
      const distance = this.calculateDistance(
        point.longitude, point.latitude,
        entity.spatial.center.longitude, entity.spatial.center.latitude
      );

      if (distance <= point.radius) {
        matches.add(entity.id);
      }
    }

    return matches;
  }

  public findSpatialRelations(targetId: string, relation: 'near' | 'above' | 'below' | 'inside' | 'adjacent'): EntityMetadata[] {
    const target = this.entities.get(targetId);
    if (!target) return [];

    const results: EntityMetadata[] = [];

    for (const entity of this.entities.values()) {
      if (entity.id === targetId) continue;

      let matches = false;

      switch (relation) {
        case 'near': {
          const distance = this.calculateDistance(
            target.spatial.center.longitude, target.spatial.center.latitude,
            entity.spatial.center.longitude, entity.spatial.center.latitude
          );
          matches = distance <= 100; // 100 meters threshold
          break;
        }

        case 'above':
          matches = entity.spatial.center.height > target.spatial.center.height &&
                   this.overlapsHorizontally(target, entity);
          break;

        case 'below':
          matches = entity.spatial.center.height < target.spatial.center.height &&
                   this.overlapsHorizontally(target, entity);
          break;

        case 'inside':
          matches = this.isInside(target, entity);
          break;

        case 'adjacent':
          matches = this.isAdjacent(target, entity);
          break;
      }

      if (matches) {
        results.push(entity);
      }
    }

    return results;
  }

  public updateVisibility(id: string, visible: boolean): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    entity.visible = visible;
    entity.updatedAt = Date.now();
    return true;
  }

  public updateSpatial(id: string, spatial: Partial<EntitySpatial>): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    entity.spatial = { ...entity.spatial, ...spatial };
    entity.updatedAt = Date.now();
    
    // Re-index spatial data
    this.removeFromIndexes(entity);
    this.updateIndexes(entity);
    
    return true;
  }

  public updateSemantic(id: string, semantic: Partial<EntitySemantic>): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    entity.semantic = { ...entity.semantic, ...semantic };
    entity.updatedAt = Date.now();
    return true;
  }

  public getAll(): EntityMetadata[] {
    return Array.from(this.entities.values());
  }

  public getCount(): number {
    return this.entities.size;
  }

  public clear(): void {
    this.entities.clear();
    this.spatialIndex.clear();
    this.nameIndex.clear();
    this.typeIndex.clear();
    this.initializeIndexes();
  }

  private updateIndexes(entity: EntityMetadata): void {
    // Update spatial index
    const spatialKey = this.getSpatialKey(entity.spatial.center);
    const spatialSet = this.spatialIndex.get(spatialKey) || new Set();
    spatialSet.add(entity.id);
    this.spatialIndex.set(spatialKey, spatialSet);

    // Update name index
    for (const alias of entity.aliases) {
      const normalizedName = alias.toLowerCase();
      const nameSet = this.nameIndex.get(normalizedName) || new Set();
      nameSet.add(entity.id);
      this.nameIndex.set(normalizedName, nameSet);
    }

    // Update type index
    const typeSet = this.typeIndex.get(entity.type) || new Set();
    typeSet.add(entity.id);
    this.typeIndex.set(entity.type, typeSet);
  }

  private removeFromIndexes(entity: EntityMetadata): void {
    // Remove from spatial index
    const spatialKey = this.getSpatialKey(entity.spatial.center);
    const spatialSet = this.spatialIndex.get(spatialKey);
    if (spatialSet) {
      spatialSet.delete(entity.id);
    }

    // Remove from name index
    for (const alias of entity.aliases) {
      const normalizedName = alias.toLowerCase();
      const nameSet = this.nameIndex.get(normalizedName);
      if (nameSet) {
        nameSet.delete(entity.id);
      }
    }

    // Remove from type index
    const typeSet = this.typeIndex.get(entity.type);
    if (typeSet) {
      typeSet.delete(entity.id);
    }
  }

  private getSpatialKey(center: SpatialCenter): string {
    const gridX = Math.floor(center.longitude + 180);
    const gridY = Math.floor(center.latitude + 90);
    return `${gridX},${gridY}`;
  }

  private intersectSets(set1: Set<string>, set2: Set<string>): Set<string> {
    return new Set([...set1].filter(x => set2.has(x)));
  }

  private calculateDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private overlapsHorizontally(entity1: EntityMetadata, entity2: EntityMetadata): boolean {
    const bounds1 = entity1.spatial.bounds;
    const bounds2 = entity2.spatial.bounds;
    
    return !(bounds1.east < bounds2.west || bounds1.west > bounds2.east ||
             bounds1.north < bounds2.south || bounds1.south > bounds2.north);
  }

  private isInside(inner: EntityMetadata, outer: EntityMetadata): boolean {
    const innerBounds = inner.spatial.bounds;
    const outerBounds = outer.spatial.bounds;
    
    return innerBounds.north <= outerBounds.north &&
           innerBounds.south >= outerBounds.south &&
           innerBounds.east <= outerBounds.east &&
           innerBounds.west >= outerBounds.west &&
           innerBounds.minHeight >= outerBounds.minHeight &&
           innerBounds.maxHeight <= outerBounds.maxHeight;
  }

  private isAdjacent(entity1: EntityMetadata, entity2: EntityMetadata): boolean {
    const bounds1 = entity1.spatial.bounds;
    const bounds2 = entity2.spatial.bounds;
    
    // Check if they share a boundary
    const tolerance = 1; // 1 meter tolerance
    
    const horizontalAdjacent = (Math.abs(bounds1.east - bounds2.west) <= tolerance ||
                               Math.abs(bounds1.west - bounds2.east) <= tolerance) &&
                              this.overlapsHorizontally(entity1, entity2);
    
    const verticalAdjacent = (Math.abs(bounds1.maxHeight - bounds2.minHeight) <= tolerance ||
                             Math.abs(bounds1.minHeight - bounds2.maxHeight) <= tolerance) &&
                            this.overlapsHorizontally(entity1, entity2);
    
    return horizontalAdjacent || verticalAdjacent;
  }
} 