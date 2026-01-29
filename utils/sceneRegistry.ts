import * as d3 from 'd3';
import { SceneDefinition, ElementTypes, ParkingLayout, LayoutElement, ElementDrawer } from '../types';
import { getIntersectionBox } from './geometry';

// --- MIGRATED ALGORITHMS (Parking Specific) ---

const fillParkingAutomatically = (layout: ParkingLayout): ParkingLayout => {
  const existingElements = [...layout.elements];
  const grounds = existingElements.filter(e => e.type === ElementTypes.GROUND);
  const roads = existingElements.filter(e => e.type === ElementTypes.ROAD);
  
  // Obstacles to avoid
  const obstacles = existingElements.filter(e => 
    [ElementTypes.WALL, ElementTypes.STAIRCASE, ElementTypes.ELEVATOR, ElementTypes.PILLAR,
     ElementTypes.ENTRANCE, ElementTypes.EXIT, ElementTypes.RAMP, ElementTypes.SAFE_EXIT,
     ElementTypes.SIDEWALK, ElementTypes.PARKING_SPACE].includes(e.type)
  );
  
  const genSpots: LayoutElement[] = [];
  const SPOT_S = 24; // Width
  const SPOT_L = 48; // Length
  const GAP = 2;     // Space between spots
  const BUFFER = 4;  
  const TOLERANCE = 12; 

  const isSafe = (rect: {x: number, y: number, w: number, h: number}) => {
      const m = 1; 
      const hitObstacle = obstacles.some(o => 
        rect.x + m < o.x + o.width && rect.x + rect.w - m > o.x &&
        rect.y + m < o.y + o.height && rect.y + rect.h - m > o.y
      );
      const hitSelf = genSpots.some(o => 
        rect.x + m < o.x + o.width && rect.x + rect.w - m > o.x &&
        rect.y + m < o.y + o.height && rect.y + rect.h - m > o.y
      );
      return !hitObstacle && !hitSelf;
  };

  let t = 0; 

  roads.forEach(r => {
      const rr = { l: r.x, r: r.x + r.width, t: r.y, b: r.y + r.height };
      
      grounds.forEach(g => {
          const gr = { l: g.x, r: g.x + g.width, t: g.y, b: g.y + g.height };
          
          if (Math.abs(rr.b - gr.t) < TOLERANCE && Math.min(rr.r, gr.r) > Math.max(rr.l, gr.l)) {
               const sx = Math.max(rr.l, gr.l) + BUFFER;
               const ex = Math.min(rr.r, gr.r) - BUFFER;
               const cnt = Math.floor((ex - sx) / (SPOT_S + GAP)); 
               
               for(let i=0; i<cnt; i++) {
                   const s = { x: sx + i*(SPOT_S+GAP), y: gr.t + 1, w: SPOT_S, h: SPOT_L };
                   if (isSafe(s)) {
                       genSpots.push({ id: `p_auto_${++t}`, type: ElementTypes.PARKING_SPACE, x: s.x, y: s.y, width: s.w, height: s.h, rotation: 0 });
                   }
               }
          }
          else if (Math.abs(rr.t - gr.b) < TOLERANCE && Math.min(rr.r, gr.r) > Math.max(rr.l, gr.l)) {
              const sx = Math.max(rr.l, gr.l) + BUFFER;
              const ex = Math.min(rr.r, gr.r) - BUFFER;
              const cnt = Math.floor((ex - sx) / (SPOT_S + GAP));
              for(let i=0; i<cnt; i++) {
                   const s = { x: sx + i*(SPOT_S+GAP), y: gr.b - SPOT_L - 1, w: SPOT_S, h: SPOT_L };
                   if (isSafe(s)) {
                       genSpots.push({ id: `p_auto_${++t}`, type: ElementTypes.PARKING_SPACE, x: s.x, y: s.y, width: s.w, height: s.h, rotation: 0 });
                   }
              }
          }
          else if (Math.abs(rr.r - gr.l) < TOLERANCE && Math.min(rr.b, gr.b) > Math.max(rr.t, gr.t)) {
              const sy = Math.max(rr.t, gr.t) + BUFFER;
              const ey = Math.min(rr.b, gr.b) - BUFFER;
              const cnt = Math.floor((ey - sy) / (SPOT_S + GAP));
              for(let i=0; i<cnt; i++) {
                  const s = { x: gr.l + 1, y: sy + i*(SPOT_S+GAP), w: SPOT_L, h: SPOT_S };
                  if (isSafe(s)) {
                      genSpots.push({ id: `p_auto_v_${++t}`, type: ElementTypes.PARKING_SPACE, x: s.x, y: s.y, width: s.w, height: s.h, rotation: 0 });
                  }
              }
          }
          else if (Math.abs(rr.l - gr.r) < TOLERANCE && Math.min(rr.b, gr.b) > Math.max(rr.t, gr.t)) {
              const sy = Math.max(rr.t, gr.t) + BUFFER;
              const ey = Math.min(rr.b, gr.b) - BUFFER;
              const cnt = Math.floor((ey - sy) / (SPOT_S + GAP));
              for(let i=0; i<cnt; i++) {
                  const s = { x: gr.r - SPOT_L - 1, y: sy + i*(SPOT_S+GAP), w: SPOT_L, h: SPOT_S };
                  if (isSafe(s)) {
                      genSpots.push({ id: `p_auto_v_${++t}`, type: ElementTypes.PARKING_SPACE, x: s.x, y: s.y, width: s.w, height: s.h, rotation: 0 });
                  }
              }
          }
      });
  });

  return { ...layout, elements: [...existingElements, ...genSpots] };
};

const generateChargingStations = (layout: ParkingLayout): ParkingLayout => {
    const spots = layout.elements.filter(e => e.type === ElementTypes.PARKING_SPACE);
    const roads = layout.elements.filter(e => e.type === ElementTypes.ROAD);
    const stations: LayoutElement[] = [];
    
    const sortedSpots = [...spots].sort((a, b) => {
        if (Math.abs(a.y - b.y) < 10) return a.x - b.x; 
        return a.y - b.y;
    });

    let stationCount = 0;
    const STATION_SIZE = 10;
    const OFFSET = 2;

    sortedSpots.forEach((spot, index) => {
        if ((index + 1) % 3 === 0) {
            const candidates = [
                { x: spot.x + spot.width/2 - STATION_SIZE/2, y: spot.y + OFFSET, side: 'top' },
                { x: spot.x + spot.width/2 - STATION_SIZE/2, y: spot.y + spot.height - STATION_SIZE - OFFSET, side: 'bottom' },
                { x: spot.x + OFFSET, y: spot.y + spot.height/2 - STATION_SIZE/2, side: 'left' },
                { x: spot.x + spot.width - STATION_SIZE - OFFSET, y: spot.y + spot.height/2 - STATION_SIZE/2, side: 'right' }
            ];

            const isVerticalSpot = spot.height > spot.width;
            let validCandidates = candidates.filter(c => {
                 if (isVerticalSpot) return c.side === 'top' || c.side === 'bottom';
                 return c.side === 'left' || c.side === 'right';
            });

            let bestCandidate = validCandidates[0];
            let maxDistToRoad = -1;

            validCandidates.forEach(cand => {
                let minDistToRoad = Infinity;
                roads.forEach(r => {
                    const rcx = r.x + r.width / 2;
                    const rcy = r.y + r.height / 2;
                    const dist = Math.sqrt(Math.pow(cand.x - rcx, 2) + Math.pow(cand.y - rcy, 2));
                    if (dist < minDistToRoad) minDistToRoad = dist;
                });

                if (minDistToRoad > maxDistToRoad) {
                    maxDistToRoad = minDistToRoad;
                    bestCandidate = cand;
                }
            });

            if (bestCandidate) {
                stations.push({
                    id: `charging_${++stationCount}`,
                    type: ElementTypes.CHARGING_STATION,
                    x: bestCandidate.x,
                    y: bestCandidate.y,
                    width: STATION_SIZE,
                    height: STATION_SIZE,
                    rotation: 0
                });
            }
        }
    });

    return { ...layout, elements: [...layout.elements, ...stations] };
};

const cleanIntersections = (layout: ParkingLayout): ParkingLayout => {
    const roads = layout.elements.filter(e => e.type === ElementTypes.ROAD);
    let elementsToRemove = new Set<string>();

    for (let i = 0; i < roads.length; i++) {
        for (let j = i + 1; j < roads.length; j++) {
            const intersection = getIntersectionBox(roads[i], roads[j]);
            if (intersection && intersection.width > 20 && intersection.height > 20) {
                const debris = layout.elements.filter(el => {
                    if (elementsToRemove.has(el.id)) return false;
                    const isDebrisType = [ElementTypes.LANE_LINE, ElementTypes.PARKING_SPACE, ElementTypes.SPEED_BUMP, ElementTypes.GUIDANCE_SIGN].includes(el.type);
                    if (!isDebrisType) return false;
                    const cx = el.x + el.width / 2;
                    const cy = el.y + el.height / 2;
                    return cx > intersection.x && cx < intersection.x + intersection.width &&
                           cy > intersection.y && cy < intersection.y + intersection.height;
                });
                debris.forEach(d => elementsToRemove.add(d.id));
            }
        }
    }
    return elementsToRemove.size > 0 ? { ...layout, elements: layout.elements.filter(e => !elementsToRemove.has(e.id)) } : layout;
};

const cleanupPillars = (layout: ParkingLayout): ParkingLayout => {
    const roads = layout.elements.filter(e => e.type === ElementTypes.ROAD);
    const spots = layout.elements.filter(e => e.type === ElementTypes.PARKING_SPACE);
    return {
        ...layout,
        elements: layout.elements.filter(el => {
            if (el.type !== ElementTypes.PILLAR) return true;
            const isOnRoad = roads.some(r => el.x < r.x + r.width && el.x + el.width > r.x && el.y < r.y + r.height && el.y + el.height > r.y);
            const isInsideSpot = spots.some(s => el.x > s.x + 2 && el.x + el.width < s.x + s.width - 2 && el.y > s.y + 2 && el.y + el.height < s.y + s.height - 2);
            return !isOnRoad && !isInsideSpot;
        })
    };
};

const resolvePriorityConflicts = (layout: ParkingLayout): ParkingLayout => {
    const elements = layout.elements;
    const sidewalks = elements.filter(e => e.type === ElementTypes.SIDEWALK);
    const filtered = elements.filter(el => {
        if (el.type === ElementTypes.SPEED_BUMP) {
            const hasConflict = sidewalks.some(s => {
                const intersection = getIntersectionBox(el, s);
                return intersection !== null && (intersection.width > 2 || intersection.height > 2);
            });
            return !hasConflict;
        }
        return true;
    });
    return { ...layout, elements: filtered };
};

const orientGuidanceSigns = (layout: ParkingLayout): ParkingLayout => {
    const exits = layout.elements.filter(e => e.type === ElementTypes.EXIT);
    const roads = layout.elements.filter(e => e.type === ElementTypes.ROAD);
    if (exits.length === 0) return layout;

    const updated = layout.elements.map(el => {
        if (el.type === ElementTypes.GUIDANCE_SIGN) {
            const parentRoad = roads.find(r => el.x >= r.x - 5 && el.x + el.width <= r.x + r.width + 5 && el.y >= r.y - 5 && el.y + el.height <= r.y + r.height + 5);
            let nearestExit = exits[0], minDist = Infinity;
            const scx = el.x + el.width / 2;
            const scy = el.y + el.height / 2;
            exits.forEach(ex => {
                const ecx = ex.x + ex.width / 2;
                const ecy = ex.y + ex.height / 2;
                const d = Math.abs(ecx - scx) + Math.abs(ecy - scy);
                if (d < minDist) { minDist = d; nearestExit = ex; }
            });
            const ecx = nearestExit.x + nearestExit.width / 2;
            const ecy = nearestExit.y + nearestExit.height / 2;
            if (parentRoad) {
                const isHorizontal = parentRoad.width > parentRoad.height;
                return { ...el, rotation: isHorizontal ? (ecx > scx ? 0 : 180) : (ecy > scy ? 90 : 270) };
            }
            const dx = ecx - scx;
            const dy = ecy - scy;
            return Math.abs(dx) > Math.abs(dy) ? { ...el, rotation: dx > 0 ? 0 : 180 } : { ...el, rotation: dy > 0 ? 90 : 270 };
        }
        return el;
    });
    return { ...layout, elements: updated };
};

// --- SCENE DEFINITION: UNDERGROUND PARKING ---

const sidewalkDrawer: ElementDrawer = (g, d, style) => {
    g.append("rect").attr("width", d.width).attr("height", d.height).attr("fill", style.fill).attr("opacity", 0.3);
    const isHorizontal = d.width > d.height;
    const stripeSize = 4, gap = 4;
    const count = Math.floor((isHorizontal ? d.width : d.height) / (stripeSize + gap));
    for(let i=0; i<count; i++) {
        g.append("rect")
            .attr("x", isHorizontal ? i*(stripeSize+gap) : 0)
            .attr("y", isHorizontal ? 0 : i*(stripeSize+gap))
            .attr("width", isHorizontal ? stripeSize : d.width)
            .attr("height", isHorizontal ? d.height : stripeSize)
            .attr("fill", "#e2e8f0");
    }
};

const speedBumpDrawer: ElementDrawer = (g, d, style, ctx) => {
     const cx = d.x + d.width / 2;
     const cy = d.y + d.height / 2;
     const parentRoad = ctx.layout?.elements.find(r => 
         r.type === ElementTypes.ROAD && 
         cx >= r.x && cx <= r.x + r.width &&
         cy >= r.y && cy <= r.y + r.height
     );

     let renderW = d.width;
     let renderH = d.height;
     let offsetX = 0;
     let offsetY = 0;

     if (parentRoad) {
         const isRoadHorizontal = parentRoad.width > parentRoad.height;
         const isBumpHorizontal = d.width > d.height;
         if (isRoadHorizontal === isBumpHorizontal) {
             renderW = d.height;
             renderH = d.width;
             offsetX = (d.width - renderW) / 2;
             offsetY = (d.height - renderH) / 2;
         }
     }
     g.append("rect")
       .attr("x", offsetX).attr("y", offsetY)
       .attr("width", renderW).attr("height", renderH)
       .attr("fill", style.fill) 
       .attr("rx", 2);  
};

const laneLineDrawer: ElementDrawer = (g, d) => {
     const isVertical = d.height > d.width;
     const cx = d.width / 2;
     const cy = d.height / 2;
     g.append("line")
       .attr("x1", isVertical ? cx : 0).attr("y1", isVertical ? 0 : cy)
       .attr("x2", isVertical ? cx : d.width).attr("y2", isVertical ? d.height : cy)
       .attr("stroke", "#facc15").attr("stroke-width", 1.5).attr("stroke-dasharray", "8,8")
       .style("shape-rendering", "geometricPrecision"); 
};

const guidanceSignDrawer: ElementDrawer = (g, d, style) => {
    const w = d.width, h = d.height;
    const cx = w / 2, cy = h / 2;
    g.append("rect").attr("width", w).attr("height", h).attr("fill", style.fill).attr("rx", 2);
    const s = Math.min(w, h) * 0.7;
    const rot = d.rotation || 0;
    g.append("path")
     .attr("d", `M ${cx - s/4} ${cy - s/2} L ${cx + s/2} ${cy} L ${cx - s/4} ${cy + s/2} M ${cx + s/2} ${cy} L ${cx - s/2} ${cy}`)
     .attr("stroke", "white").attr("fill", "none").attr("stroke-width", 2)
     .attr("stroke-linecap", "round").attr("stroke-linejoin", "round")
     .attr("transform", `rotate(${rot}, ${cx}, ${cy})`)
     .style("shape-rendering", "geometricPrecision");
};

const PARKING_NORMALIZATION = {
    'column': ElementTypes.PILLAR,
    'post': ElementTypes.PILLAR,
    'barrier': ElementTypes.WALL,
    'utility_box': ElementTypes.PILLAR, // Treat as generic obstacle
    'parking_spot': ElementTypes.PARKING_SPACE,
    'parking_bay': ElementTypes.PARKING_SPACE,
    'road': ElementTypes.ROAD,
    'lane': ElementTypes.ROAD,
    'path': ElementTypes.SIDEWALK,
    'pedestrian_walkway': ElementTypes.SIDEWALK
};

export const ParkingScene: SceneDefinition = {
  id: 'parking_underground',
  name: 'Underground Parking',
  description: 'Automated vehicle flow and high-density parking layout.',
  
  promptConfig: {
    roleDefinition: "Architectural Spatial Planner specialized in Underground Parking",
    geometricRules: `
      1. **CLOSED LOOP PERIMETER**: Walls MUST overlap or touch at corners. NO perimeter gaps.
      2. **The "Racetrack" Pattern**:
         - Create a main loop of 'driving_lane' (Roads).
         - **MANDATORY SETBACK**: The Road Loop must be **INSET** from the perimeter walls.
      3. **'ground' Elements (CRITICAL FOR VOID FIXING)**:
         - **NO FLOATING ISLANDS**: Every 'ground' element MUST touch a 'driving_lane' or another 'ground' on all sides.
         - **INTERNAL FILL**: The empty space INSIDE the road loop (the "donut hole") must be **100% FILLED** with 'ground' strips.
         - **STRIP LOGIC**: If splitting the center into multiple 'ground' strips, they must **TOUCH**.
      4. **Boundary Snapping**: 'entrance' and 'exit' MUST touch the edges of the canvas.
      5. **ZERO-VOID POLICY**:
         - The final layout must look like a **Solid Mosaic**. 
         - Any space not occupied by a 'wall' or 'driving_lane' MUST be covered by 'ground'.
    `,
    requiredElements: ['wall', 'driving_lane', 'ground', 'entrance', 'exit', 'slope'],
    exampleJSON: `
      {
        "reasoning_plan": "Racetrack road with solid central island ground strips touching each other.",
        "width": 800, "height": 600,
        "elements": [
          {"t": "wall", "x": 0, "y": 0, "w": 800, "h": 20},
          {"t": "driving_lane", "x": 60, "y": 60, "w": 680, "h": 60},
          {"t": "ground", "x": 120, "y": 120, "w": 560, "h": 100}, 
          {"t": "ground", "x": 120, "y": 220, "w": 560, "h": 100} 
        ]
      }
    `
  },

  styles: {
    [ElementTypes.GROUND]: { fill: '#334155', opacity: 1 }, 
    [ElementTypes.ROAD]: { fill: '#1e293b', opacity: 1 },   
    [ElementTypes.PARKING_SPACE]: { fill: '#3b82f6', opacity: 0.9 },
    [ElementTypes.SIDEWALK]: { fill: '#1e293b', opacity: 1 }, 
    [ElementTypes.RAMP]: { fill: '#c026d3', opacity: 1 },
    [ElementTypes.PILLAR]: { fill: '#94a3b8', opacity: 1, rx: 4 },
    [ElementTypes.WALL]: { fill: '#f1f5f9', opacity: 1 },
    [ElementTypes.ENTRANCE]: { fill: '#15803d', opacity: 1 },
    [ElementTypes.EXIT]: { fill: '#b91c1c', opacity: 1 },
    [ElementTypes.STAIRCASE]: { fill: '#fbbf24', opacity: 1 },
    [ElementTypes.ELEVATOR]: { fill: '#06b6d4', opacity: 1 },
    [ElementTypes.CHARGING_STATION]: { fill: '#22c55e', opacity: 1 },
    [ElementTypes.GUIDANCE_SIGN]: { fill: '#f59e0b', opacity: 1 },
    [ElementTypes.SAFE_EXIT]: { fill: '#10b981', opacity: 1 },
    [ElementTypes.SPEED_BUMP]: { fill: '#eab308', opacity: 1 },
    [ElementTypes.FIRE_EXTINGUISHER]: { fill: '#ef4444', opacity: 1 },
    [ElementTypes.LANE_LINE]: { fill: 'none', opacity: 1 },
    [ElementTypes.CONVEX_MIRROR]: { fill: '#38bdf8', opacity: 1 }
  },

  customDrawers: {
    [ElementTypes.SIDEWALK]: sidewalkDrawer,
    [ElementTypes.SPEED_BUMP]: speedBumpDrawer,
    [ElementTypes.LANE_LINE]: laneLineDrawer,
    [ElementTypes.GUIDANCE_SIGN]: guidanceSignDrawer
  },

  elementNormalization: PARKING_NORMALIZATION,

  postProcessAlgorithms: [
    cleanIntersections,
    fillParkingAutomatically,
    cleanIntersections,
    generateChargingStations,
    cleanupPillars,
    cleanIntersections,
    resolvePriorityConflicts,
    orientGuidanceSigns
  ],
  
  zOrder: [
    ElementTypes.WALL, ElementTypes.GROUND, ElementTypes.ROAD, ElementTypes.RAMP,
    ElementTypes.SIDEWALK, ElementTypes.PARKING_SPACE, ElementTypes.LANE_LINE,
    ElementTypes.SPEED_BUMP, ElementTypes.PILLAR, ElementTypes.STAIRCASE,
    ElementTypes.ELEVATOR, ElementTypes.SAFE_EXIT, ElementTypes.FIRE_EXTINGUISHER,
    ElementTypes.GUIDANCE_SIGN
  ]
};

export const SCENE_REGISTRY: Record<string, SceneDefinition> = {
  [ParkingScene.id]: ParkingScene
};