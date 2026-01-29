import { ParkingLayout, ConstraintViolation, SceneDefinition } from '../types';

export const PROMPTS = {
  generation: (description: string, scene: SceneDefinition) => `
  You are an **${scene.promptConfig.roleDefinition}**. 
  Generate a COARSE-GRAINED JSON layout (0,0 at top-left) for: "${description}".
  
  **CANVAS CONSTRAINTS**: Width: 800, Height: 600.
  
  **CRITICAL GEOMETRIC RULES**:
  ${scene.promptConfig.geometricRules}
  
  **REQUIRED ELEMENTS**:
  ${scene.promptConfig.requiredElements.map(e => `- '${e}'`).join('\n')}

  **JSON EXAMPLE**:
  ${scene.promptConfig.exampleJSON}
  `,

  refinement: (simplifiedLayout: any, width: number, height: number, scene: SceneDefinition) => `
    You are a **Spatial Algorithm Engine**.
    Task: Inject NEW detailed structural and facility elements into the existing layout.

    **INPUT DATA**: 
    - Canvas: ${width}x${height}
    - Existing Elements: 
    ${JSON.stringify(simplifiedLayout.elements)}

    **ALLOWED NEW ELEMENT TYPES**:
    ${Object.keys(scene.styles).filter(k => !['ground','driving_lane','parking_space','wall'].includes(k)).join(', ')}

    **CRITICAL DESIGN RULES**:
    ${scene.promptConfig.geometricRules}

    **STRICT GENERATION CONSTRAINTS**:
    1. **DO NOT GENERATE 'parking_space'**. (These are added automatically by the geometric engine).
    2. **DO NOT GENERATE 'ground', 'driving_lane', or 'wall'**. (Structural elements are immutable).
    3. **DO NOT INVENT TYPES**. Use only the allowed list (e.g., use 'pillar', not 'column').
    4. Focus on facilities: 'pillar', 'fire_extinguisher', 'guidance_sign', 'speed_bump', 'pedestrian_path'.

    **OUTPUT FORMAT**:
    - JSON with 'reasoning_plan' and 'elements'.
    - Short keys: t, x, y, w, h.
  `,

  fix: (layout: ParkingLayout, violations: ConstraintViolation[], scene: SceneDefinition) => `
    You are a **Topological Constraint Solver**.
    
    **INPUT**: ${layout.width}x${layout.height} Canvas.
    **VIOLATIONS**: ${JSON.stringify(violations)}

    **CRITICAL RULES**:
    ${scene.promptConfig.geometricRules}

    **SURGICAL EXECUTION PLAN**:
    - **Gap Fix**: Resize elements to close gaps.
    - **Overlap Fix**: Shrink or move elements to stop overlapping.
    - **Placement Fix**: Move items to valid containers (e.g., furniture on floor).

    **OUTPUT**: Return the FULL JSON layout with "fix_strategy" list.
  `
};