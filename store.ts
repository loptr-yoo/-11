import { create } from 'zustand';
import { ParkingLayout, ConstraintViolation, SceneDefinition } from './types';
import { SCENE_REGISTRY, ParkingScene } from './utils/sceneRegistry';

interface AppState {
  layout: ParkingLayout | null;
  violations: ConstraintViolation[];
  isGenerating: boolean;
  error: string | null;
  logs: string[];
  generationTime: number | null;
  
  // Scene Management
  activeScene: SceneDefinition;

  // Actions
  setLayout: (layout: ParkingLayout | null) => void;
  setViolations: (violations: ConstraintViolation[]) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setError: (error: string | null) => void;
  addLog: (msg: string) => void;
  clearLogs: () => void;
  setGenerationTime: (time: number | null) => void;
  switchScene: (sceneId: string) => void;
}

export const useStore = create<AppState>((set) => ({
  layout: null,
  violations: [],
  isGenerating: false,
  error: null,
  logs: [],
  generationTime: null,
  activeScene: ParkingScene, 

  setLayout: (layout) => set({ layout }),
  setViolations: (violations) => set({ violations }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setError: (error) => set({ error }),
  addLog: (msg) => set((state) => ({ logs: [...state.logs, msg] })),
  clearLogs: () => set({ logs: [] }),
  setGenerationTime: (time) => set({ generationTime: time }),
  switchScene: (sceneId) => {
    const scene = SCENE_REGISTRY[sceneId];
    if (scene) set({ activeScene: scene });
  }
}));