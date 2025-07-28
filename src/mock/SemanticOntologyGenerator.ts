// Semantic Industrial Ontology Generator with real-world domain knowledge
export class SemanticOntologyGenerator {
    private static cache = new Map<string, Record<string, unknown>>();
    private static ontology: {
      equipment_taxonomy: Record<string, {
        domain: string;
        concepts: Record<string, Record<string, unknown>>;
      }>;
      system_relationships: Record<string, Record<string, unknown>>;
      operating_contexts: Record<string, Record<string, unknown>>;
    } | null = null;
  
    // Initialize semantic ontology with real industrial knowledge
    private static initOntology() {
      if (this.ontology) return;
      
      this.ontology = {
        // Equipment taxonomy with semantic relationships
        equipment_taxonomy: {
          '579': { // Piping System
            domain: 'Fluid Transport',
            concepts: {
              'straight_pipe': {
                functions: ['fluid_transport', 'pressure_containment', 'flow_direction'],
                materials: {
                  'carbon_steel_a106': { temp_max: 850, pressure_max: 1500, cost_factor: 1.0 },
                  'stainless_steel_316l': { temp_max: 1200, pressure_max: 2000, cost_factor: 2.5 },
                  'chrome_moly_p11': { temp_max: 1000, pressure_max: 1800, cost_factor: 1.8 }
                },
                sizing_logic: (pressure: number): string[] => {
                  if (pressure > 900) return ['24"', '30"', '36"'];
                  if (pressure > 600) return ['18"', '24"', '30"'];
                  return ['6"', '8"', '12"', '18"'];
                },
                typical_systems: ['main_steam', 'feedwater', 'condensate', 'blowdown']
              },
              'pipe_elbow': {
                functions: ['flow_redirection', 'thermal_expansion_accommodation'],
                angles: [45, 90],
                radius_types: ['long_radius', 'short_radius']
              },
              'control_valve': {
                functions: ['flow_control', 'pressure_regulation', 'system_isolation'],
                actuator_types: ['pneumatic', 'electric', 'hydraulic'],
                control_signals: ['4-20mA', 'digital', 'pneumatic_3-15psi']
              },
              'check_valve': {
                functions: ['backflow_prevention', 'pump_protection'],
                types: ['swing', 'lift', 'tilting_disc']
              }
            }
          },
          
          '825': { // Electrical Equipment  
            domain: 'Power Systems',
            concepts: {
              'ac_motor': {
                functions: ['mechanical_drive', 'rotational_power_conversion'],
                power_classes: {
                  'low': { range: [1, 100], voltage: '480V', applications: ['fans', 'small_pumps'] },
                  'medium': { range: [100, 1000], voltage: '4160V', applications: ['large_pumps', 'compressors'] },
                  'high': { range: [1000, 10000], voltage: '13.8kV', applications: ['main_drives', 'critical_equipment'] }
                },
                protection_systems: ['overcurrent', 'thermal', 'ground_fault', 'differential'],
                efficiency_factors: { 'standard': 0.89, 'high_efficiency': 0.93, 'premium': 0.96 }
              },
              'power_cable': {
                functions: ['power_transmission', 'electrical_isolation'],
                insulation_types: {
                  'xlpe': { temp_rating: 90, voltage_max: '35kV' },
                  'epr': { temp_rating: 105, voltage_max: '69kV' },
                  'pvc': { temp_rating: 70, voltage_max: '600V' }
                },
                conductor_materials: ['copper', 'aluminum']
              },
              'motor_control_center': {
                functions: ['motor_control', 'protection', 'power_distribution'],
                typical_components: ['contactors', 'overloads', 'fuses', 'control_transformers']
              }
            }
          },
          
          '619': { // Heat Exchangers
            domain: 'Thermal Systems',
            concepts: {
              'shell_tube_hx': {
                functions: ['heat_transfer', 'temperature_regulation', 'thermal_recovery'],
                design_types: ['U-tube', 'straight_tube', 'floating_head'],
                tube_materials: {
                  'carbon_steel': { max_temp: 650, corrosion_resistance: 'low' },
                  'stainless_steel_316l': { max_temp: 900, corrosion_resistance: 'high' },
                  'titanium': { max_temp: 800, corrosion_resistance: 'excellent' }
                },
                thermal_design: {
                  effectiveness_range: [0.6, 0.95],
                  pressure_drop_target: 'minimize',
                  fouling_factors: { 'clean_service': 0.0001, 'dirty_service': 0.002 }
                }
              },
              'air_cooler': {
                functions: ['heat_rejection', 'process_cooling'],
                fan_types: ['forced_draft', 'induced_draft'],
                tube_finning: ['plain', 'low_fin', 'high_fin']
              }
            }
          },
          
          '623': { // Pressure Vessels
            domain: 'Containment Systems',
            concepts: {
              'pressure_vessel': {
                functions: ['fluid_storage', 'pressure_regulation', 'phase_separation'],
                orientations: ['horizontal', 'vertical'],
                head_types: ['ellipsoidal', 'torispherical', 'hemispherical'],
                design_codes: ['ASME_VIII_Div1', 'ASME_VIII_Div2'],
                material_selection: (pressure: number, temp: number, service: string): string => {
                  if (temp > 800) return 'chrome_moly_steel';
                  if (service === 'corrosive') return 'stainless_steel_316l';
                  return 'carbon_steel_sa516';
                }
              },
              'accumulator': {
                functions: ['energy_storage', 'pressure_smoothing', 'surge_protection'],
                gas_types: ['nitrogen', 'compressed_air'],
                bladder_materials: ['nitrile', 'viton', 'polyurethane']
              }
            }
          },
          
          '817': { // Control Systems
            domain: 'Process Control',
            concepts: {
              'dcs_controller': {
                functions: ['process_control', 'data_acquisition', 'alarm_management'],
                architectures: ['distributed', 'centralized', 'hybrid'],
                communication_protocols: ['ethernet_ip', 'profinet', 'modbus_tcp', 'hart'],
                redundancy_levels: ['simplex', 'duplex', 'triple_modular']
              },
              'hmi_panel': {
                functions: ['operator_interface', 'process_visualization', 'alarm_display'],
                screen_sizes: ['12_inch', '15_inch', '21_inch'],
                protection_ratings: ['ip65', 'nema_4x']
              },
              'field_transmitter': {
                functions: ['measurement', 'signal_transmission', 'process_monitoring'],
                measurement_types: ['pressure', 'temperature', 'flow', 'level'],
                accuracy_classes: ['0.1%', '0.25%', '0.5%']
              }
            }
          },
          
          '823': { // Safety Systems
            domain: 'Safety & Protection',
            concepts: {
              'safety_valve': {
                functions: ['overpressure_protection', 'equipment_protection', 'personnel_safety'],
                actuation_types: ['spring_loaded', 'pilot_operated', 'power_actuated'],
                certifications: ['asme_code', 'api_520', 'iso_4126'],
                sizing_criteria: 'relieving_capacity_vs_maximum_flow'
              },
              'rupture_disc': {
                functions: ['overpressure_protection', 'primary_relief', 'secondary_protection'],
                disc_types: ['tension_loaded', 'compression_loaded', 'shear_pin'],
                materials: ['inconel', 'stainless_steel', 'tantalum']
              }
            }
          },
          
          '47': { // Structural Systems
            domain: 'Structural Support',
            concepts: {
              'steel_beam': {
                functions: ['load_bearing', 'structural_support', 'equipment_mounting'],
                beam_types: ['i_beam', 'h_beam', 'channel', 'angle'],
                steel_grades: {
                  'a992': { yield_strength: 50000, applications: ['building_frames'] },
                  'a572_gr50': { yield_strength: 50000, applications: ['bridges', 'industrial'] },
                  'a36': { yield_strength: 36000, applications: ['general_construction'] }
                },
                load_calculations: (): { required_section: string; safety_factor: number } => {
                  // Semantic load calculation logic would go here
                  return { required_section: 'calculated_based_on_engineering', safety_factor: 2.0 };
                }
              }
            }
          }
        },
        
        // System integration patterns
        system_relationships: {
          'steam_cycle': {
            primary_flow: ['boiler', 'superheater', 'turbine', 'condenser', 'feedwater_pump'],
            support_systems: ['cooling_water', 'condensate_polishing', 'chemical_feed'],
            control_loops: ['drum_level', 'steam_temperature', 'turbine_speed']
          },
          'cooling_water': {
            primary_flow: ['cooling_tower', 'circulating_pump', 'heat_exchangers', 'return_line'],
            treatment_systems: ['biocide_injection', 'anti_scale', 'corrosion_inhibitor']
          }
        },
        
        // Operating context patterns
        operating_contexts: {
          'normal_operation': { availability: 0.98, load_factor: 0.85 },
          'startup': { duration_hours: 8, critical_parameters: ['temperature_ramp', 'pressure_buildup'] },
          'shutdown': { duration_hours: 12, safety_priorities: ['controlled_cooldown', 'isolation'] },
          'maintenance': { frequency_months: 18, duration_days: 30 }
        }
      };
    }
  
    // Hash function for consistent randomization
    private static hash(str: string): number {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash);
    }
  
    // Seeded random for consistent results
    private static seededRandom(seed: number, min: number = 0, max: number = 1): number {
      const x = Math.sin(seed) * 10000;
      const random = x - Math.floor(x);
      return min + random * (max - min);
    }
  
    // Semantic equipment name generation
    private static generateSemanticName(subcategory: string, elementId: number, seed: number): string {
      this.initOntology();
      
      const domain = this.ontology!.equipment_taxonomy[subcategory];
      if (!domain) return `Equipment-${elementId}`;
      

      // Generate semantic system designation
      const systemTypes: Record<string, string[]> = {
        '579': ['MS', 'FW', 'CD', 'BD'], // Main Steam, Feedwater, Condensate, Blowdown
        '825': ['4KV', '480V', 'DC', 'UPS'], // Voltage levels
        '619': ['HX', 'AC', 'WH', 'CD'], // Heat Exchanger, Air Cooler, Waste Heat, Condenser
        '623': ['SA', 'CT', 'ST', 'DT'], // Steam Accumulator, Condensate Tank, etc.
        '817': ['DCS', 'PLC', 'HMI', 'SIS'], // Control system types
        '823': ['ESF', 'FP', 'SV', 'RD'], // Emergency, Fire Protection, Safety Valve, Rupture Disc
        '47': ['STR', 'FND', 'SUP', 'BRC'] // Structure, Foundation, Support, Brace
      };
      
      const systemPrefix = (systemTypes as Record<string, string[]>)[subcategory] || ['SYS'];
      const prefix = systemPrefix[Math.floor(this.seededRandom(seed + 1, 0, systemPrefix.length))];
      
      // Generate semantic numbering
      const train = String.fromCharCode(65 + Math.floor(this.seededRandom(seed + 2, 0, 4))); // A, B, C, D
      const number = String(Math.floor(this.seededRandom(seed + 3, 1, 99))).padStart(2, '0');
      
      return `${prefix}-${train}${number}`;
    }
  
    // Semantic function generation based on concept and context
    private static generateSemanticFunction(subcategory: string, concept: string): string {
      this.initOntology();
      const domain = this.ontology!.equipment_taxonomy[subcategory];
      if (!domain?.concepts[concept]) {
        return 'General equipment function';
      }
      const functions = (domain.concepts[concept] as { functions?: string[] }).functions || ['equipment_operation'];
      const primaryFunction = functions[0].replace(/_/g, ' ');
      
      // Add context based on element ID patterns
      const contextualPhrases: Record<string, string> = {
        '579': 'in the steam/water cycle',
        '825': 'for electrical power systems',
        '619': 'in thermal management systems',
        '623': 'for pressure containment and storage',
        '817': 'in process control and automation',
        '823': 'for safety and protection systems',
        '47': 'providing structural support'
      };
      
      const context = contextualPhrases[subcategory] || 'in industrial operations';
      return `${primaryFunction.charAt(0).toUpperCase() + primaryFunction.slice(1)} ${context}`;
    }
  
    // Generate semantically appropriate specifications
    private static generateSemanticSpecs(subcategory: string, concept: string, seed: number): Record<string, unknown> {
      this.initOntology();
      const domain = this.ontology!.equipment_taxonomy[subcategory];
      const conceptData = domain?.concepts[concept] as Record<string, unknown>;
      
      if (!conceptData) return {};
      
      const specs: Record<string, unknown> = {};
      
      // Generate specs based on semantic rules
      switch (subcategory) {
        case '579': // Piping
          if (concept.includes('pipe')) {
            const pressure = Math.floor(this.seededRandom(seed, 600, 1500));
            const temp = Math.floor(this.seededRandom(seed + 1, 400, 900));
            
            // Semantic material selection
            let material = 'Carbon Steel A106 Grade B';
            if (temp > 800) material = 'Chrome Moly P11';
            if (pressure > 1200) material = 'Stainless Steel 316L';
            
            // Semantic sizing
            if (typeof conceptData.sizing_logic === 'function') {
              const sizeOptions = (conceptData.sizing_logic as (pressure: number) => string[])(pressure);
              const diameter = sizeOptions[Math.floor(this.seededRandom(seed + 2, 0, sizeOptions.length))];
              specs.diameter = diameter;
            } else {
              specs.diameter = undefined;
            }
            specs.pressure_rating = `${pressure} PSI`;
            specs.temperature_rating = `${temp}°F`;
            specs.material = material;
            specs.pipe_schedule = pressure > 900 ? 'Schedule 80' : 'Schedule 40';
          }
          break;
          
        case '825': // Electrical
          if (concept.includes('motor')) {
            const powerClasses = conceptData.power_classes as Record<string, { range: [number, number]; voltage: string; applications: string[] }>;
            if (powerClasses && typeof powerClasses === 'object') {
              const classKeys = Object.keys(powerClasses);
              if (classKeys.length > 0) {
                const selectedClass = classKeys[Math.floor(this.seededRandom(seed, 0, classKeys.length))];
                const classData = powerClasses[selectedClass];
                if (classData && Array.isArray(classData.range) && typeof classData.voltage === 'string' && Array.isArray(classData.applications)) {
                  const power = Math.floor(this.seededRandom(seed + 1, classData.range[0], classData.range[1]));
                  specs.power_rating = `${power} HP`;
                  specs.voltage = classData.voltage;
                  specs.applications = classData.applications;
                  specs.efficiency = (this.seededRandom(seed + 2, 0.89, 0.96)).toFixed(3);
                  specs.rpm = [1200, 1800, 3600][Math.floor(this.seededRandom(seed + 3, 0, 3))];
                }
              }
            }
          }
          break;
          
        case '619': // Heat Exchangers
          if (concept.includes('hx')) {
            const area = Math.floor(this.seededRandom(seed, 500, 5000));
            specs.heat_transfer_area = `${area} sq ft`;
            specs.effectiveness = (this.seededRandom(seed + 1, 0.6, 0.95)).toFixed(2);
            const tubeMaterials = ['carbon_steel', 'stainless_steel_316l', 'titanium'];
            const designTypes = ['U-tube', 'straight_tube', 'floating_head'];
            const tubeMatIndex = Math.floor(this.seededRandom(seed + 2, 0, tubeMaterials.length));
            if (tubeMaterials[tubeMatIndex]) {
              specs.tube_material = tubeMaterials[tubeMatIndex];
            }
            const designTypeIndex = Math.floor(this.seededRandom(seed + 3, 0, designTypes.length));
            if (designTypes[designTypeIndex]) {
              specs.design_type = designTypes[designTypeIndex];
            }
          }
          break;
      }
      
      return specs;
    }
  
    // Main generation function with semantic intelligence
    static generateSemanticData(elementId: number, properties: Record<string, unknown> = {}): Record<string, unknown> {
      this.initOntology();
      
      const cacheKey = `semantic_${elementId}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }
  
      const seed = this.hash(elementId.toString());
      const subcategory = (properties.subcategory as string) || '579';
      const type = properties.Type || 0;
      
      // Select semantic concept
      const domain = this.ontology!.equipment_taxonomy[subcategory];
      const concepts = domain ? Object.keys(domain.concepts) : ['generic_equipment'];
      const concept = concepts[Math.floor(this.seededRandom(seed, 0, concepts.length))];
      
      // Generate semantic name and specifications
      const name = this.generateSemanticName(subcategory, elementId, seed);
      const semanticFunction = this.generateSemanticFunction(subcategory, concept);
      const specs = this.generateSemanticSpecs(subcategory, concept, seed);
      
      // Generate contextually appropriate operational data
      const operatingContext = Math.random() > 0.8 ? 'maintenance' : 'normal_operation';
      // const contextData = this.ontology!.operating_contexts[operatingContext]; // removed unused variable
      
      const enhanced: Record<string, unknown> = {
        element: elementId.toString(),
        subcategory,
        assembly: properties.assembly,
        Type: type,
        
        // Semantically generated core data
        name,
        function: semanticFunction,
        equipment_concept: concept,
        domain: domain?.domain || 'Industrial Equipment',
        
        // System integration
        system: this.generateSystemContext(subcategory, seed),
        subsystem: this.generateSubsystemContext(subcategory, concept),
        
        // Technical specifications (semantically appropriate)
        ...specs,
        
        // Operational context
        operational_status: this.generateOperationalStatus(operatingContext, seed),
        criticality_level: this.generateCriticalityLevel(subcategory, concept, seed),
        
        // Maintenance semantics
        maintenance_strategy: this.generateMaintenanceStrategy(subcategory),
        inspection_requirements: this.generateInspectionRequirements(subcategory),
        
        // Safety and regulatory
        safety_class: this.generateSafetyClassification(subcategory, concept),
        applicable_codes: this.generateApplicableCodes(subcategory),
        
        // Relationships (based on semantic understanding)
        functional_relationships: this.generateFunctionalRelationships(subcategory, concept),
        
        // Tags (semantically meaningful)
        tags: this.generateSemanticTags(subcategory, concept, specs)
      };
  
      this.cache.set(cacheKey, enhanced);
      return enhanced;
    }
  
    // Helper methods for semantic generation
    private static generateSystemContext(subcategory: string, seed: number): string {
      const systemContexts: Record<string, string[]> = {
        '579': ['Primary Steam System', 'Feedwater System', 'Condensate System', 'Cooling Water System'],
        '825': ['Main Electrical System', 'Emergency Power System', 'Motor Control System', 'Lighting & Small Power'],
        '619': ['Primary Heat Removal', 'Secondary Cooling', 'Waste Heat Recovery', 'HVAC Systems'],
        '623': ['Steam Generation', 'Water Storage', 'Chemical Storage', 'Waste Systems'],
        '817': ['Distributed Control System', 'Safety Instrumented System', 'Fire & Gas System', 'Emergency Shutdown'],
        '823': ['Primary Safety Systems', 'Fire Protection', 'Emergency Response', 'Pressure Relief'],
        '47': ['Primary Structure', 'Equipment Support', 'Seismic Systems', 'Building Systems']
      };
      
      const contexts = systemContexts[subcategory] || ['General Systems'];
      return contexts[Math.floor(this.seededRandom(seed, 0, contexts.length))];
    }
  
    private static generateSubsystemContext(subcategory: string, concept: string): string {
      // Generate subsystem based on concept and semantic understanding
      const subsystemMap: Record<string, string> = {
        'straight_pipe': 'Primary Flow Path',
        'control_valve': 'Flow Control Loop',
        'ac_motor': 'Motor Drive Assembly',
        'shell_tube_hx': 'Heat Exchange Circuit',
        'safety_valve': 'Overpressure Protection',
        'steel_beam': 'Load Path Structure'
      };
      
      return subsystemMap[concept] || `${concept.replace(/_/g, ' ')} Subsystem`;
    }
  
    private static generateOperationalStatus(context: string, seed: number): string {
      const statusByContext: Record<string, string[]> = {
        'normal_operation': ['Active', 'Standby', 'Running'],
        'maintenance': ['Maintenance', 'Out of Service', 'Testing'],
        'startup': ['Starting Up', 'Warming Up', 'Commissioning'],
        'shutdown': ['Shutting Down', 'Cooling Down', 'Secured']
      };
      
      const statuses = statusByContext[context] || ['Active'];
      return statuses[Math.floor(this.seededRandom(seed, 0, statuses.length))];
    }
  
    private static generateCriticalityLevel(subcategory: string, concept: string, seed: number): string {
      // Safety and production critical equipment
      const criticalConcepts = ['safety_valve', 'emergency_shutdown', 'main_steam', 'reactor_coolant'];
      const isCritical = criticalConcepts.some(c => concept.includes(c)) || subcategory === '823';
      
      if (isCritical) return 'Safety Critical';
      if (this.seededRandom(seed, 0, 1) > 0.7) return 'Production Critical';
      if (this.seededRandom(seed, 0, 1) > 0.5) return 'Important';
      return 'Standard';
    }
  
    private static generateMaintenanceStrategy(subcategory: string): string {
      const strategies: Record<string, string> = {
        '579': 'Predictive - Vibration & Thermal monitoring',
        '825': 'Predictive - Motor current signature analysis',
        '619': 'Performance-based - Heat transfer monitoring',
        '623': 'Time-based - Periodic inspection',
        '817': 'Functional testing - Loop checks',
        '823': 'Regulatory - Mandatory testing schedule',
        '47': 'Condition-based - Visual inspection'
      };
      
      return strategies[subcategory] || 'Time-based maintenance';
    }
  
    private static generateInspectionRequirements(subcategory: string): string[] {
      const requirements: Record<string, string[]> = {
        '579': ['Ultrasonic thickness testing', 'Visual inspection for corrosion', 'Pressure testing'],
        '825': ['Thermal imaging', 'Vibration analysis', 'Electrical testing'],
        '619': ['Performance testing', 'Tube inspection', 'Fouling assessment'],
        '623': ['Internal inspection', 'Pressure testing', 'Material condition assessment'],
        '817': ['Functional testing', 'Calibration check', 'Communication verification'],
        '823': ['Function testing', 'Set pressure verification', 'Seat leakage test'],
        '47': ['Structural integrity check', 'Connection inspection', 'Load assessment']
      };
      
      return requirements[subcategory] || ['General inspection'];
    }
  
    private static generateSafetyClassification(subcategory: string, concept: string): string {
      if (subcategory === '823') return 'Safety Class 1';
      if (concept.includes('safety') || concept.includes('emergency')) return 'Safety Class 2';
      if (['579', '619', '623'].includes(subcategory)) return 'Quality Class';
      return 'Commercial Grade';
    }
  
    private static generateApplicableCodes(subcategory: string): string[] {
      const codes: Record<string, string[]> = {
        '579': ['ASME B31.1 Power Piping', 'ASME Section III'],
        '825': ['IEEE 841 Motors', 'NEMA MG-1', 'NEC Article 430'],
        '619': ['ASME Section VIII', 'TEMA Standards'],
        '623': ['ASME Section VIII Division 1', 'API 650'],
        '817': ['ISA 84 SIS', 'IEC 61511', 'IEEE 603'],
        '823': ['ASME Section III', 'API 520/521', 'ISO 4126'],
        '47': ['AISC Steel Construction', 'ACI 318 Concrete', 'ASCE 7 Loads']
      };
      
      return codes[subcategory] || ['General Industrial Standards'];
    }
  
    private static generateFunctionalRelationships(subcategory: string, concept: string): string[] {
      // Generate semantically meaningful relationships
      const relationships: string[] = [];
      
      if (subcategory === '579') { // Piping
        relationships.push('Connected to upstream equipment');
        relationships.push('Feeds downstream process');
        if (concept.includes('valve')) {
          relationships.push('Controlled by automation system');
        }
      }
      
      if (subcategory === '825') { // Electrical
        relationships.push('Powered from electrical distribution');
        if (concept.includes('motor')) {
          relationships.push('Drives mechanical equipment');
          relationships.push('Protected by motor control center');
        }
      }
      
      return relationships;
    }
  
    private static generateSemanticTags(subcategory: string, concept: string, specs: Record<string, unknown>): string[] {
      const tags = [concept.replace(/_/g, '-')];
      
      // Add domain-specific tags
      const domainTags: Record<string, string[]> = {
        '579': ['fluid-system', 'pressure-boundary'],
        '825': ['electrical', 'rotating-equipment'],
        '619': ['thermal', 'heat-transfer'],
        '623': ['pressure-vessel', 'containment'],
        '817': ['control-system', 'instrumentation'],
        '823': ['safety-system', 'protection'],
        '47': ['structural', 'support-system']
      };
      
      tags.push(...(domainTags[subcategory] || []));
      
      // Add specification-based tags
      if (specs.pressure_rating && parseInt(specs.pressure_rating as string) > 900) {
        tags.push('high-pressure');
      }
      if (specs.temperature_rating && parseInt(specs.temperature_rating as string) > 650) {
        tags.push('high-temperature');
      }
      if (specs.power_rating && parseInt((specs.power_rating as string)) > 1000) {
        tags.push('high-power');
      }
      
      return tags;
    }
  
    // Clear cache
    static clearCache(): void {
      this.cache.clear();
    }
  }
  
  // Enhanced tooltip with semantic data
  export const generateSemanticTooltip = (elementId: number, basicProperties: Record<string, unknown> = {}): string => {
    const enhanced = SemanticOntologyGenerator.generateSemanticData(elementId, basicProperties);
    
    let tooltip = `⚙️ ${enhanced.name}\n`;
    tooltip += `🎯 ${enhanced.function}\n`;
    tooltip += `🏗️ ${enhanced.system} > ${enhanced.subsystem}\n`;
    
    // Add technical specs semantically
    if (enhanced.diameter && enhanced.pressure_rating) {
      tooltip += `📏 ${enhanced.diameter} @ ${enhanced.pressure_rating}\n`;
    }
    if (enhanced.power_rating && enhanced.voltage) {
      tooltip += `⚡ ${enhanced.power_rating} @ ${enhanced.voltage}\n`;
    }
    if (enhanced.heat_transfer_area) {
      tooltip += `🔥 ${enhanced.heat_transfer_area} (η=${enhanced.effectiveness})\n`;
    }
    
    tooltip += `🔒 ${enhanced.criticality_level}\n`;
    tooltip += `🛡️ ${enhanced.safety_class}\n`;
    tooltip += `🔧 ${enhanced.maintenance_strategy}\n`;
    tooltip += `📊 Status: ${enhanced.operational_status}`;
    
    return tooltip;
  };