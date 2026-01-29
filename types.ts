export type ElementType = string;

export const ElementTypes = {
  GROUND: 'ground',
  PARKING_SPACE: 'parking_space',
  ROAD: 'driving_lane',
  SIDEWALK: 'pedestrian_path',
  RAMP: 'slope',
  PILLAR: 'pillar',
  WALL: 'wall',
  ENTRANCE: 'entrance',
  EXIT: 'exit',
  STAIRCASE: 'staircase',
  ELEVATOR: 'elevator',
  CHARGING_STATION: 'charging_station',
  GUIDANCE_SIGN: 'guidance_sign',
  SAFE_EXIT: 'safe_exit',
  SPEED_BUMP: 'deceleration_zone',
  FIRE_EXTINGUISHER: 'fire_extinguisher',
  LANE_LINE: 'ground_line',
  CONVEX_MIRROR: 'convex_mirror'
};

export interface LayoutElement {
  id: string;
  type: ElementType; 
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number; // Degrees
  label?: string;
  subType?: string; 
  meta?: Record<string, any>; 
}

export interface ParkingLayout {
  width: number;
  height: number;
  elements: LayoutElement[];
}

export interface ConstraintViolation {
  elementId: string;
  targetId?: string; 
  type: 'overlap' | 'out_of_bounds' | 'invalid_dimension' | 'placement_error' | 'connectivity_error' | 'width_mismatch' | 'custom';
  message: string;
}

// --- ENGINE INTERFACES ---

export interface ElementStyle {
  fill: string;
  opacity: number;
  stroke?: string;
  strokeWidth?: number;
  rx?: number; 
}

// Custom D3 Drawer Function Context
export interface DrawerContext {
  layout: ParkingLayout;
  violations: ConstraintViolation[];
}

export type ElementDrawer = (
  g: any, // D3 Selection
  element: LayoutElement,
  style: ElementStyle,
  context: DrawerContext
) => void;

// Algorithmic Strategy (e.g., "Fill Spots", "Auto-Connect Roads")
export type LayoutAlgorithm = (layout: ParkingLayout) => ParkingLayout;

export interface SceneDefinition {
  id: string;
  name: string;
  description: string;
  
  // 1. Prompt Configuration
  promptConfig: {
    roleDefinition: string;
    geometricRules: string;
    requiredElements: string[];
    exampleJSON: string;
  };

  // 2. Visualization Configuration
  styles: Record<string, ElementStyle>;
  customDrawers?: Record<string, ElementDrawer>; 
  zOrder?: string[]; 
  
  // New: Handle AI Hallucinations (e.g. "column" -> "pillar")
  elementNormalization?: Record<string, string>;

  // 3. Logic & Algorithms
  postProcessAlgorithms?: LayoutAlgorithm[]; 
}