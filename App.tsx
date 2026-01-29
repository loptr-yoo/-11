import React, { useRef, useEffect, useState } from 'react';
import MapRenderer, { MapRendererHandle } from './components/MapRenderer';
import LayoutControl from './components/LayoutControl';
import { generateParkingLayout, augmentLayoutWithRoads } from './services/geminiService';
import { useStore } from './store';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}

const App: React.FC = () => {
  const { 
    layout, violations, isGenerating, error, logs, activeScene,
    setLayout, setViolations, setIsGenerating, setError, addLog, setGenerationTime, clearLogs 
  } = useStore();

  const mapRef = useRef<MapRendererHandle>(null);
  const [hasKey, setHasKey] = useState<boolean>(true);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasKey(true);
      setError(null);
    }
  };

  const handleGenerate = async (prompt: string) => {
    setIsGenerating(true);
    setError(null);
    clearLogs();
    setGenerationTime(null);
    const startTime = Date.now();
    
    try {
      const newLayout = await generateParkingLayout(prompt, activeScene, addLog);
      setLayout(newLayout);
      setViolations([]); 
      addLog("Generation complete.");
    } catch (e: any) {
      console.error(e);
      const msg = e.message || "";
      if (msg.includes("429") || msg.includes("quota")) {
        setError("API 配额已耗尽。请点击右侧按钮选择自己的付费 API Key 以继续使用 Gemini 3 Pro。");
      } else if (msg.includes("not found")) {
        setError("无法找到指定的模型。请尝试重新选择 API Key。");
        setHasKey(false);
      } else {
        setError(msg || "生成布局失败。");
      }
    } finally {
      setIsGenerating(false);
      setGenerationTime((Date.now() - startTime) / 1000);
    }
  };

  const handleRefine = async () => {
    if (!layout) return;
    setIsGenerating(true);
    addLog("--- Refinement ---");
    const startTime = Date.now();
    
    try {
      const augmented = await augmentLayoutWithRoads(layout, activeScene, addLog);
      if (augmented && augmented.elements.length > 0) {
        setLayout(augmented);
        setViolations([]);
        addLog("Refinement complete.");
      }
    } catch (e: any) {
      const msg = e.message || "";
      if (msg.includes("429")) {
        setError("配额不足，细化操作失败。请使用自定义 API Key。");
      } else {
        setError(msg || "细化布局失败。");
      }
    } finally {
      setIsGenerating(false);
      setGenerationTime((Date.now() - startTime) / 1000);
    }
  };

  const handleDownload = () => {
      if (mapRef.current) {
          mapRef.current.downloadJpg();
      }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans">
      <div className="flex-1 flex flex-col p-4 min-w-0">
        <header className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-white">
                <span className="text-blue-500">S</span>patial<span className="text-purple-500">E</span>ngine
                <span className="ml-2 text-xs font-normal text-slate-500">
                    Scenario: <span className="text-white font-semibold">{activeScene.name}</span>
                </span>
            </h1>
            <div className="flex gap-4 text-xs text-slate-500">
               {!hasKey && (
                 <div className="flex items-center gap-1 text-amber-500 animate-pulse">
                   ⚠️ 请关联 API Key 以开启 Gemini 3 Pro
                 </div>
               )}
               <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Coarse</div>
               <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Fine</div>
            </div>
        </header>

        {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-3 rounded mb-4 text-sm flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="hover:bg-red-500/20 px-2 rounded">✕</button>
                </div>
                {(error.includes("配额") || error.includes("Key")) && (
                  <button 
                    onClick={handleSelectKey}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs w-fit font-bold"
                  >
                    立即设置自定义 API Key
                  </button>
                )}
            </div>
        )}

        <main className="flex-1 min-h-0 relative">
            {layout ? <MapRenderer ref={mapRef} /> : (
                <div className="w-full h-full flex flex-col items-center justify-center border border-slate-800 rounded-lg bg-slate-900/50 gap-4">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                      <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <p className="text-slate-500 text-sm">Enter prompt to generate {activeScene.name}.</p>
                </div>
            )}
        </main>
      </div>

      <LayoutControl 
        onGenerate={handleGenerate} 
        onRefine={handleRefine}
        onDownload={handleDownload}
        onSelectKey={handleSelectKey}
      />
    </div>
  );
};

export default App;