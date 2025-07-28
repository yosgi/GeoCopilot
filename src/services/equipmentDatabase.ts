import equipmentData from '../data/complete_database.json';

export interface EquipmentData {
  element: string;
  subcategory: string;
  assembly?: string;
  Type: number;
  name: string;
  function: string;
  equipment_concept: string;
  domain: string;
  system: string;
  subsystem: string;
  operational_status: string;
  criticality_level: string;
  maintenance_strategy: string;
  inspection_requirements: string[];
  safety_class: string;
  applicable_codes: string[];
  functional_relationships: string[];
  tags: string[];
}

class EquipmentDatabaseService {
  private equipmentDatabase: EquipmentData[];

  constructor() {
    // assume the data structure is { equipment_database: EquipmentData[] }
    this.equipmentDatabase = (equipmentData as { equipment_database: EquipmentData[] }).equipment_database || [];
  }

  // get equipment by elementId
  getEquipmentByElementId(elementId: string | number): EquipmentData | null {
    const id = elementId.toString();
    return this.equipmentDatabase.find(equipment => equipment.element === id) || null;
  }

  // get equipment by subcategory
  getEquipmentBySubcategory(subcategory: string): EquipmentData[] {
    return this.equipmentDatabase.filter(equipment => equipment.subcategory === subcategory);
  }

  // get equipment by inspection_requirements
  getEquipmentByInspectionRequirements(requirement: string): EquipmentData[] {
    return this.equipmentDatabase.filter(equipment => 
      equipment.inspection_requirements.some(req => 
        req.toLowerCase().includes(requirement.toLowerCase())
      )
    );
  }

  // get all equipment
  getAllEquipment(): EquipmentData[] {
    return this.equipmentDatabase;
  }

  // get equipment stats
  getEquipmentStats() {
    const total = this.equipmentDatabase.length;
    const subcategories = new Set(this.equipmentDatabase.map(e => e.subcategory)).size;
    const systems = new Set(this.equipmentDatabase.map(e => e.system)).size;
    
    return {
      total,
      subcategories,
      systems
    };
  }
}

export const equipmentDatabaseService = new EquipmentDatabaseService(); 