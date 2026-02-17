
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mood, ChatMessage, RobotState, InteractionMode, MemoryItem, YouTubeResult, DanceStyle, ThemeMode } from './types';
import RobotBody from './components/RobotBody';
import { 
  startLiveSession, 
  decodeBase64, 
  decodeAudioData, 
  createPcmBlob 
} from './services/geminiLive';

const App: React.FC = () => {
  const [robot, setRobot] = useState<RobotState>(() => {
    const savedMemory = localStorage.getItem('neo-db-v5');
    const savedSettings = localStorage.getItem('neo-config-v5');
    const defaultSettings = { 
      robotSfx: true, 
      voiceName: 'Kore', 
      faceTracking: true,
      uiTheme: '#050505',
      themeMode: 'dark' as ThemeMode,
      neoColor: '#22d3ee',
      autoColor: true,
      interactionMode: 'full' as InteractionMode
    };
    
    return {
      isAwake: false,
      mood: 'neutral',
      battery: 100,
      isListening: false,
      isProcessing: false,
      memory: savedMemory ? JSON.parse(savedMemory) : [],
      danceStyle: 'classic',
      settings: savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : defaultSettings
    };
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [trackingPos, setTrackingPos] = useState({ x: 0, y: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [isDancing, setIsDancing] = useState(false);
  const [isSinging, setIsSinging] = useState(false);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRequestRef = useRef<number>(0);

  const isDark = robot.settings.themeMode === 'dark';

  useEffect(() => {
    localStorage.setItem('neo-db-v5', JSON.stringify(robot.memory));
    localStorage.setItem('neo-config-v5', JSON.stringify(robot.settings));
  }, [robot.memory, robot.settings]);

  const updateFaceTracking = useCallback(() => {
    if (robot.isAwake && robot.settings.faceTracking) {
      const time = Date.now() / 2000;
      setTrackingPos({
        x: Math.sin(time) * 0.4,
        y: Math.cos(time * 0.8) * 0.2
      });
    }
    frameRequestRef.current = requestAnimationFrame(updateFaceTracking);
  }, [robot.isAwake, robot.settings.faceTracking]);

  useEffect(() => {
    frameRequestRef.current = requestAnimationFrame(updateFaceTracking);
    return () => cancelAnimationFrame(frameRequestRef.current);
  }, [updateFaceTracking]);

  const addMessage = useCallback((text: string, role: 'user' | 'bot') => {
    setMessages(prev => [...prev.slice(-20), { text, role, timestamp: new Date() }]);
    if (role === 'bot') {
      const lower = text.toLowerCase();
      if (lower.includes('cantando')) {
        setIsSinging(true);
        setTimeout(() => setIsSinging(false), 15000);
      }
      if (lower.includes('dança') || lower.includes('dançando')) {
        setIsDancing(true);
        const styles: DanceStyle[] = ['classic', 'shuffle', 'robotic', 'vibing'];
        setRobot(p => ({ ...p, danceStyle: styles[Math.floor(Math.random() * styles.length)] }));
      } else if (!activeVideo) {
        setIsDancing(false);
      }
      setRobot(p => ({ ...p, isProcessing: false, mood: 'happy' }));
    } else {
      setRobot(p => ({ ...p, isProcessing: true, mood: 'thinking' }));
    }
  }, [activeVideo]);

  const handleWake = async () => {
    setIsConnecting(true);
    try {
      if (!outputAudioCtxRef.current) outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      await outputAudioCtxRef.current.resume();
      await audioCtxRef.current.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: { facingMode: 'user', width: 640 } 
      });

      if (videoRef.current) videoRef.current.srcObject = stream;

      const session = await startLiveSession(process.env.API_KEY || '', robot.settings.voiceName, {
        onAudioChunk: async (base64) => {
          if (robot.settings.interactionMode === 'text_only') return;
          const ctx = outputAudioCtxRef.current!;
          nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
          const audioBuffer = await decodeAudioData(decodeBase64(base64), ctx, 24000, 1);
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.onended = () => sourcesRef.current.delete(source);
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += audioBuffer.duration;
          sourcesRef.current.add(source);
        },
        onInterrupted: () => {
          sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
          sourcesRef.current.clear();
          nextStartTimeRef.current = 0;
          setIsSinging(false);
        },
        onTranscription: (text, isUser) => addMessage(text, isUser ? 'user' : 'bot'),
        onTurnComplete: () => setRobot(p => ({ ...p, isProcessing: false })),
        onToolCall: (calls) => {
          calls.forEach(call => {
            if (call.name === 'youtube_search') {
               sessionRef.current?.sendToolResponse({
                functionResponses: [{ id: call.id, name: call.name, response: { status: 'Searching...' } }]
              });
            }
          });
        }
      });

      const micSource = audioCtxRef.current.createMediaStreamSource(stream);
      const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        let sum = 0; for(let i=0; i<data.length; i++) sum += data[i]*data[i];
        setAudioLevel(Math.sqrt(sum/data.length));
        if (session && robot.settings.interactionMode === 'full' && !isMicMuted) {
          session.sendRealtimeInput({ media: createPcmBlob(data) });
        }
      };
      micSource.connect(processor);
      processor.connect(audioCtxRef.current.destination);

      sessionRef.current = session;
      setRobot(prev => ({ ...prev, isAwake: true, mood: 'happy' }));
    } catch (err) {
      alert("Erro ao conectar com o Nexus.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSleep = () => {
    sessionRef.current?.close();
    sessionRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
    setRobot(prev => ({ ...prev, isAwake: false, mood: 'sleepy' }));
    setActiveVideo(null);
  };

  const handleCommand = (e?: React.FormEvent, manualText?: string) => {
    e?.preventDefault();
    const input = manualText || commandInput.trim();
    if (!input || !sessionRef.current) return;
    
    addMessage(input, 'user');
    
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = input.match(ytRegex);

    if (match && match[1]) {
      setActiveVideo(match[1]);
      sessionRef.current.sendRealtimeInput({ text: `Entendido! Iniciando reprodução do vídeo do YouTube para você.` });
    } else {
      sessionRef.current.sendRealtimeInput({ text: input });
    }
    setCommandInput('');
  };

  const toggleTheme = () => {
    setRobot(p => {
      const newMode = p.settings.themeMode === 'dark' ? 'light' : 'dark';
      return {
        ...p,
        settings: {
          ...p.settings,
          themeMode: newMode,
          uiTheme: newMode === 'dark' ? '#050505' : '#f9fafb'
        }
      };
    });
  };

  const suggestions = [
    { label: "Cante", cmd: "Cante uma música" },
    { label: "Dance", cmd: "Dance para mim" },
    { label: "Piada", cmd: "Me conte uma piada" },
    { label: "YouTube IA", cmd: "Pesquise no YouTube sobre IA" }
  ];

  return (
    <div className={`min-h-screen w-full flex flex-col items-center relative overflow-hidden transition-all duration-700 p-4 md:p-8 ${isDark ? 'text-white' : 'text-zinc-900'}`} style={{ backgroundColor: robot.settings.uiTheme }}>
      <div className={`scanline ${isDark ? 'opacity-10' : 'opacity-5'} pointer-events-none`}></div>
      
      {/* Settings Gear - Positioned safely away from other elements */}
      <button 
        onClick={() => setShowSettings(true)}
        className={`fixed top-4 right-4 w-12 h-12 rounded-full ${isDark ? 'bg-zinc-900/80 border-zinc-800 text-zinc-400' : 'bg-white/80 border-zinc-200 text-zinc-500'} backdrop-blur-md border flex items-center justify-center hover:text-cyan-500 hover:scale-110 transition-all shadow-lg z-50`}
      >
        <i className="fas fa-cog text-lg"></i>
      </button>

      {/* Camera Feed - Moved to bottom right to avoid overlap with gear and header */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={`fixed bottom-4 right-4 w-24 md:w-40 aspect-video rounded-2xl object-cover grayscale opacity-40 border shadow-2xl transition-all pointer-events-none z-40 ${isCameraOff || !robot.isAwake ? 'invisible' : 'visible'} ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`} 
      />

      {/* Main Content Area */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative z-10 space-y-4 md:space-y-8 max-w-lg mx-auto">
        
        {/* NEO-1 Body */}
        <div className="relative w-full aspect-square flex items-center justify-center -mt-8 md:mt-0">
          <RobotBody 
            mood={robot.isAwake ? robot.mood : 'sleepy'} 
            isProcessing={robot.isProcessing} 
            audioLevel={audioLevel}
            trackingPos={trackingPos}
            isDancing={isDancing || !!activeVideo}
            isSinging={isSinging}
            customColor={robot.settings.neoColor}
            autoColor={robot.settings.autoColor}
            battery={Math.floor(robot.battery)}
            danceStyle={robot.danceStyle}
          />
        </div>

        {/* Interaction Controls - BELOW NEO-1 */}
        {robot.isAwake ? (
          <div className="w-full flex flex-col items-center gap-4 animate-in slide-in-from-bottom-5 duration-500">
            
            {/* Search/Command Box */}
            <form onSubmit={handleCommand} className="w-full relative px-2">
              <input 
                type="text" 
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Diga algo ou cole um link..."
                className={`w-full ${isDark ? 'bg-zinc-900/90 border-zinc-800 text-white' : 'bg-white/90 border-zinc-200 text-zinc-900'} backdrop-blur-xl border rounded-2xl py-3 px-6 text-sm focus:outline-none focus:border-cyan-500 transition-all pr-12 shadow-xl`}
              />
              <button type="submit" className="absolute right-4 top-1.5 w-8 h-8 bg-cyan-500 text-black rounded-lg flex items-center justify-center hover:scale-105 transition-transform">
                <i className="fas fa-paper-plane text-xs"></i>
              </button>
            </form>

            {/* Small Compact Action Buttons */}
            <div className="flex flex-wrap justify-center gap-2 px-2">
              <MiniButton active={isMicMuted} onClick={() => setIsMicMuted(!isMicMuted)} icon={isMicMuted ? "microphone-slash" : "microphone"} label="Mic" danger={isMicMuted} isDark={isDark} />
              <MiniButton active={isCameraOff} onClick={() => setIsCameraOff(!isCameraOff)} icon={isCameraOff ? "video-slash" : "video"} label="Cam" danger={isCameraOff} isDark={isDark} />
              <MiniButton active={robot.settings.interactionMode === 'text_only'} onClick={() => setRobot(p => ({...p, settings: {...p.settings, interactionMode: p.settings.interactionMode === 'full' ? 'text_only' : 'full'}}))} icon="keyboard" label="Chat" isDark={isDark} />
              <MiniButton active={false} onClick={handleSleep} icon="power-off" label="Desligar" danger isDark={isDark} />
            </div>

            {/* Suggestions */}
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {suggestions.map((s, i) => (
                <button 
                  key={i} 
                  onClick={() => handleCommand(undefined, s.cmd)}
                  className={`px-3 py-1.5 ${isDark ? 'bg-zinc-900/50 border-zinc-800 text-zinc-500' : 'bg-white border-zinc-200 text-zinc-400'} border rounded-lg text-[9px] font-black uppercase hover:text-cyan-500 transition-all shadow-sm`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
             <button 
                onClick={handleWake} 
                disabled={isConnecting}
                className={`px-10 py-4 ${isDark ? 'bg-white text-black' : 'bg-zinc-900 text-white'} rounded-full font-black uppercase tracking-[0.3em] text-xs hover:scale-110 active:scale-95 transition-all shadow-2xl shadow-cyan-500/10`}
              >
                {isConnecting ? 'CONECTANDO...' : 'LIGAR NEO-1'}
              </button>
              <span className={`text-[8px] font-black uppercase tracking-[0.5em] ${isDark ? 'text-zinc-800' : 'text-zinc-400'}`}>Versão Nexus 5.0</span>
          </div>
        )}
      </div>

      {/* YouTube Player Overlay - Improved Responsiveness */}
      {activeVideo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className={`w-full max-w-4xl ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-200'} border rounded-[2rem] overflow-hidden shadow-3xl relative flex flex-col`}>
            <div className="flex justify-between items-center p-4 border-b border-zinc-800/20">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Mídia Nexus Online</span>
              <button 
                onClick={() => setActiveVideo(null)} 
                className="w-8 h-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              <iframe 
                width="100%" 
                height="100%" 
                src={`https://www.youtube.com/embed/${activeVideo}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`}
                title="NEO Media Player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8 bg-black/95 backdrop-blur-3xl animate-in fade-in zoom-in duration-300">
          <div className={`w-full max-w-lg ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-200'} border rounded-[3rem] p-8 md:p-10 shadow-3xl relative overflow-hidden flex flex-col max-h-[90vh]`}>
            <div className="flex justify-between items-center mb-8">
              <h2 className={`text-xl font-black uppercase tracking-[0.2em] ${isDark ? 'text-white' : 'text-zinc-900'}`}>Configuração de Núcleo</h2>
              <button onClick={() => setShowSettings(false)} className={`w-10 h-10 rounded-full ${isDark ? 'bg-zinc-900 text-zinc-500' : 'bg-zinc-100 text-zinc-400'} flex items-center justify-center hover:text-cyan-500 transition-all`}><i className="fas fa-times"></i></button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
              <section className="space-y-4">
                <Toggle label="Modo Escuro" active={isDark} onChange={toggleTheme} isDark={isDark} />
                <Toggle label="Rastreio Facial" active={robot.settings.faceTracking} onChange={() => setRobot(p => ({...p, settings: {...p.settings, faceTracking: !p.settings.faceTracking}}))} isDark={isDark} />
                <Toggle label="Humor Adaptativo" active={robot.settings.autoColor} onChange={() => setRobot(p => ({...p, settings: {...p.settings, autoColor: !p.settings.autoColor}}))} isDark={isDark} />
              </section>

              <section className="space-y-4">
                <h3 className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">Espectro Cromático</h3>
                <div className="flex flex-wrap gap-3">
                  {['#22d3ee', '#f472b6', '#4ade80', '#ef4444', '#a855f7'].map(c => (
                    <button 
                      key={c} 
                      onClick={() => setRobot(p => ({...p, settings: {...p.settings, neoColor: c, autoColor: false}}))} 
                      className={`w-10 h-10 rounded-full border-4 transition-all ${robot.settings.neoColor === c ? 'border-cyan-500 scale-110' : isDark ? 'border-zinc-900' : 'border-zinc-100'}`} 
                      style={{ backgroundColor: c }} 
                    />
                  ))}
                </div>
              </section>

              <div className={`${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'} p-5 rounded-2xl border text-center`}>
                <h4 className="text-[9px] font-black uppercase text-zinc-500 mb-1">Criador do Projeto</h4>
                <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>Severino Lucas Cayovo (Seve-k)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className={`fixed bottom-4 left-4 text-[6px] ${isDark ? 'text-zinc-800' : 'text-zinc-300'} font-black uppercase tracking-[0.5em] pointer-events-none`}>
        NEO-1 // NEXUS_LINK_STABLE
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: ${isDark ? '#27272a' : '#e5e7eb'}; border-radius: 10px; }
        iframe { border-radius: 0; }
        .ease-out-back { transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1); }
      `}</style>
    </div>
  );
};

const MiniButton = ({ active, onClick, icon, label, danger, isDark }: any) => (
  <button 
    onClick={onClick} 
    className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
      active 
        ? 'bg-red-500 text-white border-red-400 shadow-lg' 
        : isDark
          ? 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-zinc-700'
          : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 shadow-sm'
    } ${danger && !active ? 'hover:text-red-500' : ''}`}
  >
    <i className={`fas fa-${icon} text-[10px]`}></i>
    <span className="text-[8px] font-black uppercase tracking-wider">{label}</span>
  </button>
);

const Toggle = ({ label, active, onChange, isDark }: any) => (
  <div className={`flex justify-between items-center p-3 ${isDark ? 'bg-zinc-900/30 border-zinc-800/50' : 'bg-zinc-50 border-zinc-200'} rounded-xl border`}>
    <span className={`text-[10px] font-black ${isDark ? 'text-zinc-400' : 'text-zinc-600'} uppercase tracking-wider`}>{label}</span>
    <button onClick={onChange} className={`w-12 h-6 rounded-full transition-all relative ${active ? 'bg-cyan-500' : 'bg-zinc-300'}`}>
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${active ? 'left-7' : 'left-1'}`}></div>
    </button>
  </div>
);

export default App;
