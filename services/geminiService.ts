import { GoogleGenAI } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import { ParkingLayout, ElementType, ConstraintViolation, LayoutElement, SceneDefinition } from "../types";
import { validateLayout, getIntersectionBox } from "../utils/geometry";
import { PROMPTS } from "../utils/prompts";

const MODEL_PRIMARY = "gemini-2.5-pro";
const MODEL_FALLBACK = "gemini-3-pro-preview"; 

let cachedTier: 'HIGH' | 'LOW' | null = null;
const getApiKey = () => process.env.API_KEY;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const mergeLayoutElements = (original: LayoutElement[], updates: LayoutElement[]): LayoutElement[] => {
  const elementMap = new Map(original.map(el => [el.id, el]));
  updates.forEach(update => {
    if (update.id && elementMap.has(update.id)) {
      const existing = elementMap.get(update.id)!;
      elementMap.set(update.id, { ...existing, ...update });
    } else {
      const newId = update.id || `el_${Math.random().toString(36).substr(2, 9)}`;
      elementMap.set(newId, { ...update, id: newId });
    }
  });
  return Array.from(elementMap.values());
};

const postProcessLayout = (layout: ParkingLayout): ParkingLayout => {
    return {
        ...layout,
        elements: layout.elements.map(el => {
            return { ...el, x: Math.round(el.x), y: Math.round(el.y), width: Math.round(el.width), height: Math.round(el.height) };
        })
    };
};

async function determineModelTier(ai: GoogleGenAI, onLog?: (m: string) => void): Promise<'HIGH' | 'LOW'> {
    if (cachedTier) return cachedTier;
    onLog?.("Checking high-tier model availability...");
    try {
        await ai.models.generateContent({ model: MODEL_PRIMARY, contents: "test", config: { maxOutputTokens: 1 } });
        cachedTier = 'HIGH';
        onLog?.("Gemini 2.5 Pro access confirmed.");
    } catch (e: any) {
        onLog?.(`Primary model unavailable (${e.message}). Switching to fallback.`);
        cachedTier = 'LOW';
    }
    return cachedTier;
}

const cleanAndParseJSON = (text: string): any => {
  try {
    let cleanText = text.replace(/```json\s*|```/g, "").trim();
    const firstOpen = cleanText.indexOf('{');
    const lastClose = cleanText.lastIndexOf('}');
    if (firstOpen !== -1 && lastClose !== -1) cleanText = cleanText.substring(firstOpen, lastClose + 1);
    const repaired = jsonrepair(cleanText);
    return JSON.parse(repaired);
  } catch (e) {
    throw new Error(`AI 返回的数据格式有误: ${(e as Error).message}`);
  }
};

const mapToInternalLayout = (rawData: any): ParkingLayout => ({
    width: Number(rawData.width || 800),
    height: Number(rawData.height || 600),
    elements: (rawData.elements || []).map((e: any) => ({
        id: String(e.id || `el_${Math.random().toString(36).substr(2, 9)}`),
        type: e.t || e.type, 
        x: Number(e.x || 0),
        y: Number(e.y || 0),
        width: Number(e.w ?? e.width ?? 10),
        height: Number(e.h ?? e.height ?? 10),
        rotation: Number(e.r || 0),
        label: e.l
    }))
});

const calculateScore = (violations: ConstraintViolation[]): number => {
    return violations.reduce((acc, v) => {
        if (v.type === 'overlap') return acc + 5;
        if (v.type === 'connectivity_error') return acc + 10;
        if (v.type === 'out_of_bounds') return acc + 8;
        return acc + 2;
    }, 0);
};

const generateWithRetry = async (ai: GoogleGenAI, params: any, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await ai.models.generateContent(params);
        } catch (e: any) {
            if (e.message?.includes("429") && i < retries - 1) {
              await sleep(3000 * Math.pow(2, i));
              continue;
            }
            if (i === retries - 1) throw e;
        }
    }
    throw new Error("Failed after retries");
};

const runIterativeFix = async (layout: ParkingLayout, ai: GoogleGenAI, model: string, scene: SceneDefinition, onLog?: (m: string) => void, maxPasses = 4): Promise<ParkingLayout> => {
    let currentLayout = layout;
    let lastScore = Infinity;

    for (let pass = 1; pass <= maxPasses; pass++) {
        const violations = validateLayout(currentLayout);
        const score = calculateScore(violations);
        
        if (score === 0) {
            onLog?.(`🔧 Pass ${pass}: Layout validated (Score: 0).`);
            break;
        }
        if (score >= lastScore && pass > 1) {
            onLog?.(`🌡️ Stagnation at Pass ${pass} (Score: ${score}).`);
            break;
        }
        
        onLog?.(`🔧 Auto-fixing pass ${pass}/${maxPasses} (Score: ${score})...`);
        lastScore = score;

        const simplified = {
            width: currentLayout.width,
            height: currentLayout.height,
            elements: currentLayout.elements.map(e => ({ id: e.id, t: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.width), h: Math.round(e.height), r: e.rotation }))
        };

        try {
            const response = await generateWithRetry(ai, { 
                model, 
                contents: PROMPTS.fix(simplified as any, violations, scene), 
                config: { responseMimeType: "application/json", temperature: 0.1 } 
            }, 1);
            
            const rawData = cleanAndParseJSON(response.text || "{}");
            if (rawData.fix_strategy && onLog) rawData.fix_strategy.forEach((s: string) => onLog(`🤖 AI Action: ${s}`));
            
            const fixedLayout = mapToInternalLayout(rawData);
            currentLayout = { ...currentLayout, elements: mergeLayoutElements(currentLayout.elements, fixedLayout.elements) };
        } catch (e: any) {
            onLog?.(`⚠️ Fix failed: ${e.message}`);
            break;
        }
    }
    return currentLayout;
};

export const generateParkingLayout = async (description: string, scene: SceneDefinition, onLog?: (msg: string) => void): Promise<ParkingLayout> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("缺少 API Key。请点击 Key 图标进行设置。");
  
  const ai = new GoogleGenAI({ apiKey });
  let tier = await determineModelTier(ai, onLog);
  let currentModel = tier === 'HIGH' ? MODEL_PRIMARY : MODEL_FALLBACK;
  onLog?.(`Using model: ${currentModel}`);

  try {
    const response = await generateWithRetry(ai, { 
      model: currentModel, 
      contents: PROMPTS.generation(description, scene), 
      config: { responseMimeType: "application/json" } 
    }, 2);
    
    const rawData = cleanAndParseJSON(response.text);
    if (rawData.reasoning_plan && onLog) onLog(`🧠 Plan: ${rawData.reasoning_plan}`);
    
    let layout = mapToInternalLayout(rawData);
    layout = await runIterativeFix(layout, ai, currentModel, scene, onLog);
    return postProcessLayout(layout);
  } catch (error: any) {
    throw error;
  }
};

export const augmentLayoutWithRoads = async (currentLayout: ParkingLayout, scene: SceneDefinition, onLog?: (msg: string) => void): Promise<ParkingLayout> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("缺少 API Key");
  
  const ai = new GoogleGenAI({ apiKey });
  let tier = await determineModelTier(ai, onLog);
  let currentModel = tier === 'HIGH' ? MODEL_PRIMARY : MODEL_FALLBACK;

  try {
    const simplified = currentLayout.elements.map(e => ({ id: e.id, t: e.type, x: e.x, y: e.y, w: e.width, h: e.height }));
    const response = await generateWithRetry(ai, { 
        model: currentModel, 
        contents: PROMPTS.refinement({ elements: simplified }, currentLayout.width, currentLayout.height, scene), 
        config: { responseMimeType: "application/json" } 
    }, 2);
    
    const rawData = cleanAndParseJSON(response.text);
    if (rawData.reasoning_plan && onLog) onLog(`✨ AI Plan: ${rawData.reasoning_plan}`);

    const aiGeneratedLayout = mapToInternalLayout(rawData);
    let layout: ParkingLayout = { width: currentLayout.width, height: currentLayout.height, elements: [...currentLayout.elements, ...aiGeneratedLayout.elements] };

    // Execute Pluggable Algorithms
    if (scene.postProcessAlgorithms) {
        for (const algo of scene.postProcessAlgorithms) {
            layout = algo(layout);
        }
    }
    
    layout = await runIterativeFix(layout, ai, currentModel, scene, onLog);
    return postProcessLayout(layout);
  } catch (error: any) {
    throw error;
  }
};