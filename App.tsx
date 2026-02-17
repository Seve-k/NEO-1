
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Mood, ChatMessage, RobotState, InteractionMode, MemoryItem } from './types';
import RobotFace from './components/RobotFace';
import { 
  startLiveSession, 
  decodeBase64, 
  decodeAudioData, 
  createPcmBlob 
} from './services/geminiLive';

const App: React.FC = () => {
  const [robot, setRobot] = useState<RobotState>(() => {
    const savedMemory = localStorage.getItem('neo-memory');
    const savedSettings = localStorage.getItem('neo-settings');
    return {
      isAwake: false,
      mood: 'neutral',
      battery: 100,
      isListening: false,
      isProcessing: false,
      interactionMode: 'voice',
      memory: savedMemory ? JSON.parse(savedMemory) : [],
      settings: savedSettings ? JSON.parse(savedSettings) : { robotSfx: true, voiceName: 'Kore', faceTracking: true }
    };
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [trackingPos, setTrackingPos] = useState({ x: 0, y: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('neo-memory', JSON.stringify(robot.memory));
  }, [robot.memory]);

  useEffect(() => {
    localStorage.setItem('neo-settings', JSON.stringify(robot.settings));
  }, [robot.settings]);

  useEffect(() => {
    if (showHistory) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showHistory]);

  // Eye Tracking Logic: Mouse + Camera Activity Simulation
  useEffect(() => {
    if (!robot.isAwake || !robot.settings.faceTracking) return;
    
    const updateTracking = (e: MouseEvent) => {
      // Normalize to -1 to 1 range
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      // Damping for smooth movement
      setTrackingPos({ x: x * 0.7, y: y * 0.7 });
    };

    window.addEventListener('mousemove', updateTracking);
    return () => window.removeEventListener('mousemove', updateTracking);
  }, [robot.isAwake, robot.settings.faceTracking]);

  const playSfx = (type: 'on' | 'off' | 'process' | 'chirp') => {
    if (!robot.settings.robotSfx) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      
      if (type === 'on') { 
        osc.type = 'square'; 
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
      } else if (type === 'off') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      } else if (type === 'process') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.05);
      }
      
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    } catch (e) { console.warn("SFX blocked by browser"); }
  };

  const analyzeMood = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('feliz') || lower.includes('incrível') || lower.includes('ótimo') || lower.includes('sim')) return 'happy';
    if (lower.includes('triste') || lower.includes('ruim') || lower.includes('não')) return 'confused';
    if (lower.includes('raiva') || lower.includes('chato') || lower.includes('pare')) return 'angry';
    if (lower.includes('legal') || lower.includes('irado') || lower.includes('top')) return 'cool';
    if (lower.includes('uau') || lower.includes('surpresa') || lower.includes('caramba')) return 'surprised';
    if (lower.includes('te amo') || lower.includes('coração') || lower.includes('gosto')) return 'love';
    if (lower.includes('pensando') || lower.includes('hum')) return 'thinking';
    return 'neutral';
  };

  const addMessage = useCallback((text: string, role: 'user' | 'bot') => {
    setMessages(prev => [...prev.slice(-50), { text, role, timestamp: new Date() }]);
    if (role === 'bot') {
      const newMood = analyzeMood(text);
      setRobot(prev => ({ ...prev, mood: newMood, isProcessing: false }));
      
      // Auto-memory detection (Simulated)
      if (text.toLowerCase().includes('lembre') || text.toLowerCase().includes('aprendi')) {
        const fact = text.substring(0, 50) + "...";
        setRobot(p => ({ ...p, memory: [...p.memory, { id: Date.now().toString(), fact, timestamp: Date.now() }] }));
      }
    } else {
      setRobot(prev => ({ ...prev, isProcessing: true, mood: 'thinking' }));
    }
  }, []);

  const handleWake = async () => {
    setIsConnecting(true);
    playSfx('on');
    try {
      // Ensure AudioContexts are initialized and resumed
      if (!outputAudioCtxRef.current) {
        outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (outputAudioCtxRef.current.state === 'suspended') {
        await outputAudioCtxRef.current.resume();
      }

      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
      
      const session = await startLiveSession(process.env.API_KEY || '', robot.settings.voiceName, {
        onAudioChunk: async (base64) => {
          const ctx = outputAudioCtxRef.current!;
          if (ctx.state === 'suspended') await ctx.resume();
          
          nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
          const audioBuffer = await decodeAudioData(decodeBase64(base64), ctx, 24000, 1);
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          
          source.onended = () => {
             sourcesRef.current.delete(source);
             if (sourcesRef.current.size === 0) {
               setRobot(p => ({ ...p, isProcessing: false }));
             }
          };
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += audioBuffer.duration;
          sourcesRef.current.add(source);
        },
        onInterrupted: () => {
          sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
          sourcesRef.current.clear();
          nextStartTimeRef.current = 0;
          setRobot(p => ({ ...p, isProcessing: false }));
        },
        onTranscription: (text, isUser) => addMessage(text, isUser ? 'user' : 'bot'),
        onTurnComplete: () => {
          playSfx('chirp');
        }
      });

      // Mic Stream
      const micSource = audioCtxRef.current.createMediaStreamSource(stream);
      const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setAudioLevel(Math.sqrt(sum / inputData.length));
        if (session && robot.interactionMode === 'voice') {
          session.sendRealtimeInput({ media: createPcmBlob(inputData) });
        }
      };
      micSource.connect(processor);
      processor.connect(audioCtxRef.current.destination);

      sessionRef.current = session;
      setRobot(prev => ({ ...prev, isAwake: true, mood: 'happy' }));
    } catch (err) {
      console.error("Wake Error:", err);
      alert("Erro ao acessar hardware. Verifique as permissões de câmera e microfone.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSleep = () => {
    playSfx('off');
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch(e) {}
    }
    sessionRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
    setRobot(prev => ({ ...prev, isAwake: false, mood: 'sleepy' }));
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || robot.isProcessing) return;
    const userMsg = textInput;
    setTextInput('');
    addMessage(userMsg, 'user');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const resp = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: userMsg,
        config: { systemInstruction: "Você é o NEO-1. Responda de forma curta e robótica." }
      });
      addMessage(resp.text || "...", 'bot');
    } catch (e) { 
      addMessage("Falha na conexão neural...", 'bot');
      setRobot(p => ({...p, isProcessing: false, mood: 'confused'}));
    }
  };

  return (
    <div className="min-h-screen bg-[#020202] text-zinc-300 font-mono flex flex-col items-center justify-center p-4 overflow-hidden relative">
      {/* Visual Ambiance */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_50%_50%,#0891b2,transparent)] pointer-events-none"></div>
      
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* Left: Quick Actions */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <ToolBtn active={showMemory} onClick={() => setShowMemory(!showMemory)} icon="brain" label="Memória" />
          <ToolBtn active={showSettings} onClick={() => setShowSettings(!showSettings)} icon="sliders" label="Config" />
          <ToolBtn active={showCamera} onClick={() => setShowCamera(!showCamera)} icon={showCamera ? "video" : "video-slash"} label="Câmera" />
          <ToolBtn active={showHistory} onClick={() => setShowHistory(!showHistory)} icon="message" label="Histórico" />
          
          {/* Camera Feed Popup */}
          {showCamera && (
            <div className="mt-4 bg-zinc-900 border border-zinc-800 p-2 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
               <div className="aspect-video bg-black rounded-xl overflow-hidden relative">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1] opacity-40 grayscale" />
                  <div className="absolute inset-0 bg-cyan-500/5 mix-blend-overlay"></div>
               </div>
            </div>
          )}
        </div>

        {/* Center: The Robot (NEO-1) */}
        <div className="lg:col-span-8 flex flex-col items-center justify-center space-y-10">
          <div className="relative group">
            <div className={`w-72 h-72 md:w-[520px] md:h-[520px] transition-all duration-1000 ${robot.isAwake ? 'scale-100' : 'scale-90 opacity-20 blur-md grayscale'}`}>
              <RobotFace 
                mood={robot.isAwake ? robot.mood : 'sleepy'} 
                isProcessing={robot.isProcessing} 
                audioLevel={audioLevel}
                trackingPos={trackingPos}
              />
            </div>
            {/* Glow Base */}
            <div className={`absolute -bottom-12 left-1/2 -translate-x-1/2 w-3/4 h-12 bg-cyan-500/10 blur-[80px] rounded-full transition-opacity duration-1000 ${robot.isAwake ? 'opacity-100' : 'opacity-0'}`}></div>
          </div>

          <div className="w-full max-w-md space-y-6">
            {!robot.isAwake ? (
              <button 
                onClick={handleWake} 
                disabled={isConnecting}
                className="w-full py-5 bg-white text-black rounded-[3rem] font-black uppercase tracking-[0.3em] text-sm hover:bg-cyan-400 transition-all shadow-2xl shadow-white/10 active:scale-95 flex items-center justify-center gap-3"
              >
                {isConnecting ? <i className="fas fa-sync animate-spin"></i> : <i className="fas fa-power-off"></i>}
                {isConnecting ? 'CONECTANDO...' : 'ATUALIZAR NEO-1'}
              </button>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-500">
                <div className="flex justify-center gap-2">
                  <ModeToggle active={robot.interactionMode === 'voice'} onClick={() => setRobot(p => ({...p, interactionMode: 'voice'}))} icon="microphone" label="VOZ" />
                  <ModeToggle active={robot.interactionMode === 'text'} onClick={() => setRobot(p => ({...p, interactionMode: 'text'}))} icon="font" label="TEXTO" />
                  <button onClick={handleSleep} className="px-6 py-2 bg-red-950/20 border border-red-900/40 text-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10">DESLIGAR</button>
                </div>
                
                {robot.interactionMode === 'text' && (
                  <form onSubmit={handleTextSubmit} className="flex gap-2 group">
                    <input 
                      type="text" 
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Transmita comando..."
                      className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:border-cyan-500 transition-all placeholder:text-zinc-700"
                    />
                    <button className="w-12 bg-zinc-800 text-zinc-400 rounded-2xl hover:bg-cyan-500 hover:text-black transition-all"><i className="fas fa-chevron-right"></i></button>
                  </form>
                )}
                
                <div className="flex justify-center items-center gap-4 text-zinc-700">
                   <div className="h-0.5 w-16 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 animate-[loading_2s_infinite]" style={{ width: robot.isProcessing ? '100%' : '20%' }}></div>
                   </div>
                   <span className="text-[9px] font-black uppercase tracking-[0.2em]">{robot.isProcessing ? 'PROCESSANDO_SINAL' : 'ESTADO_OK'}</span>
                   <div className="h-0.5 w-16 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 animate-[loading_2s_infinite_reverse]" style={{ width: robot.isProcessing ? '100%' : '20%' }}></div>
                   </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: History (Drawer/Sidebar Style) */}
        {showHistory && (
          <div className="lg:col-span-2 fixed lg:relative right-4 top-24 bottom-24 lg:top-0 lg:bottom-0 w-80 lg:w-full z-40 bg-zinc-900/60 lg:bg-transparent backdrop-blur-2xl lg:backdrop-blur-none border border-zinc-800 lg:border-none rounded-[2rem] lg:rounded-none flex flex-col shadow-2xl animate-in slide-in-from-right-10 duration-300">
            <div className="p-5 border-b border-zinc-800/50 flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">History_Log</span>
              <button onClick={() => setMessages([])} className="text-[10px] text-zinc-800 hover:text-red-500"><i className="fas fa-trash"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.length === 0 ? (
                <div className="text-center py-20 opacity-10">
                  <i className="fas fa-terminal text-4xl mb-4"></i>
                  <p className="text-[10px] uppercase font-black">Null_Set</p>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[90%] px-4 py-2 rounded-2xl text-[11px] leading-snug ${
                      m.role === 'user' 
                      ? 'bg-zinc-800 text-zinc-500' 
                      : 'bg-cyan-500/10 text-cyan-200 border border-cyan-500/20'
                    }`}>
                      {m.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Overlays */}
      {showMemory && (
        <Overlay title="Banco Neural" onClose={() => setShowMemory(false)}>
          <div className="space-y-2">
            {robot.memory.length === 0 ? <p className="text-zinc-600 text-center py-10 italic">Nenhum dado persistente encontrado.</p> : 
              robot.memory.map(m => (
                <div key={m.id} className="p-3 bg-black/50 border border-zinc-800 rounded-2xl flex justify-between items-center group hover:border-cyan-500/40 transition-all">
                  <p className="text-[11px] text-zinc-400 flex-1">{m.fact}</p>
                  <button 
                    onClick={() => setRobot(p => ({...p, memory: p.memory.filter(x => x.id !== m.id)}))}
                    className="text-zinc-800 hover:text-red-500 ml-4"
                  >
                    <i className="fas fa-trash-alt text-xs"></i>
                  </button>
                </div>
              ))
            }
          </div>
        </Overlay>
      )}

      {showSettings && (
        <Overlay title="System_Settings" onClose={() => setShowSettings(false)}>
          <div className="space-y-6">
            <Toggle label="Robot Sound Effects" active={robot.settings.robotSfx} onChange={() => setRobot(p => ({...p, settings: {...p.settings, robotSfx: !p.settings.robotSfx}}))} />
            <Toggle label="Eye Tracking (Sim)" active={robot.settings.faceTracking} onChange={() => setRobot(p => ({...p, settings: {...p.settings, faceTracking: !p.settings.faceTracking}}))} />
            <div className="space-y-3">
              <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest block">Voice Core</span>
              <div className="grid grid-cols-2 gap-2">
                {['Kore', 'Puck', 'Fenrir', 'Charon'].map(v => (
                  <button 
                    key={v}
                    onClick={() => setRobot(p => ({...p, settings: {...p.settings, voiceName: v}}))}
                    className={`p-3 rounded-xl border text-[10px] font-black uppercase tracking-tighter transition-all ${robot.settings.voiceName === v ? 'bg-cyan-500 border-cyan-400 text-black' : 'bg-black border-zinc-800 text-zinc-600 hover:border-zinc-700'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Overlay>
      )}

      <footer className="mt-8 text-[9px] text-zinc-900 font-black uppercase tracking-[0.5em] hover:text-zinc-700 transition-colors pointer-events-none">
        NEO-1 COMPANION // NEXUS_LINK_ACTIVE
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1f1f23; border-radius: 10px; }
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

/* Components */
const ToolBtn = ({ active, onClick, icon, label }: any) => (
  <button 
    onClick={onClick}
    className={`p-4 rounded-3xl border transition-all flex flex-col items-center justify-center gap-2 group ${active ? 'bg-cyan-500 border-cyan-400 text-black shadow-lg shadow-cyan-500/20' : 'bg-zinc-900/40 border-zinc-800 text-zinc-600 hover:border-zinc-700'}`}
  >
    <i className={`fas fa-${icon} text-lg`}></i>
    <span className="text-[9px] font-black uppercase tracking-tighter">{label}</span>
  </button>
);

const ModeToggle = ({ active, onClick, icon, label }: any) => (
  <button 
    onClick={onClick}
    className={`px-6 py-2 rounded-2xl text-[10px] font-black uppercase border transition-all flex items-center gap-2 ${active ? 'bg-cyan-500 border-cyan-400 text-black' : 'bg-zinc-900 border-zinc-800 text-zinc-600'}`}
  >
    <i className={`fas fa-${icon}`}></i>
    {label}
  </button>
);

const Toggle = ({ label, active, onChange }: any) => (
  <div className="flex justify-between items-center group">
    <span className="text-sm font-bold text-zinc-500 group-hover:text-zinc-300 transition-colors">{label}</span>
    <button onClick={onChange} className={`w-12 h-6 rounded-full transition-all relative ${active ? 'bg-cyan-500' : 'bg-zinc-800'}`}>
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-md ${active ? 'left-7' : 'left-1'}`}></div>
    </button>
  </div>
);

const Overlay = ({ title, children, onClose }: any) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
    <div className="w-full max-w-lg bg-[#08080a] border border-zinc-800/50 rounded-[3rem] p-8 shadow-2xl relative">
      <div className="flex justify-between items-center mb-8 border-b border-zinc-900 pb-4">
        <h2 className="text-lg font-black uppercase tracking-[0.2em] text-white flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
          {title}
        </h2>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-600 hover:text-white transition-all">
          <i className="fas fa-times"></i>
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
        {children}
      </div>
    </div>
  </div>
);

export default App;
