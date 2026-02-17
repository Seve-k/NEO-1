
import React, { useEffect, useState, useMemo } from 'react';
import { Mood, DanceStyle } from '../types';

interface RobotBodyProps {
  mood: Mood;
  isProcessing: boolean;
  audioLevel?: number;
  trackingPos?: { x: number, y: number };
  isDancing?: boolean;
  isSinging?: boolean;
  customColor?: string;
  autoColor?: boolean;
  battery?: number;
  danceStyle?: DanceStyle;
}

const RobotBody: React.FC<RobotBodyProps> = ({ 
  mood, isProcessing, audioLevel = 0, trackingPos = { x: 0, y: 0 }, 
  isDancing, isSinging, customColor, autoColor, battery = 100,
  danceStyle = 'classic'
}) => {
  const [blink, setBlink] = useState(false);
  const [emoji, setEmoji] = useState<string | null>(null);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 120);
    }, 4500 + Math.random() * 3000);
    return () => clearInterval(blinkInterval);
  }, []);

  useEffect(() => {
    const emojis: Record<string, string> = {
      happy: '😁', love: '😍', cool: '🕶️', angry: '😡', 
      surprised: '🤯', excited: '🚀', confused: '🧐', thinking: '💡', dancing: '🕺'
    };
    if (emojis[mood]) {
      setEmoji(emojis[mood]);
      const timer = setTimeout(() => setEmoji(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [mood]);

  const theme = useMemo(() => {
    const moodColors: Record<string, string> = {
      neutral: '#22d3ee', happy: '#4ade80', love: '#f472b6', 
      angry: '#ef4444', cool: '#a855f7', scared: '#fbbf24', 
      excited: '#06b6d4', thinking: '#60a5fa', sleepy: '#3f3f46'
    };
    
    const baseColor = autoColor ? (moodColors[mood] || moodColors.neutral) : (customColor || '#22d3ee');
    
    return {
      eye: baseColor,
      glow: `shadow-[0_0_40px_${baseColor}44]`
    };
  }, [mood, customColor, autoColor]);

  const getEyePaths = () => {
    if (blink && mood !== 'sleepy') return { left: 'M20,50 Q30,49 40,50', right: 'M60,50 Q70,49 80,50' };
    switch (mood) {
      case 'happy': return { left: 'M20,55 Q30,35 40,55', right: 'M60,55 Q70,35 80,55' };
      case 'love': return { left: 'M25,55 Q20,40 30,40 Q40,40 35,55 L30,65 Z', right: 'M65,55 Q60,40 70,40 Q80,40 75,55 L70,65 Z' };
      case 'angry': return { left: 'M20,45 L45,60 L45,55 Z', right: 'M80,45 L55,60 L55,55 Z' };
      case 'cool': return { left: 'M15,45 H45 V58 H15 Z', right: 'M55,45 H85 V58 H55 Z' };
      case 'thinking': return { left: 'M20,48 H40 V52 H20 Z', right: 'M60,42 H80 V46 H60 Z' };
      case 'surprised': return { left: 'M25,50 A5,8 0 1,1 24.9,50', right: 'M75,50 A5,8 0 1,1 74.9,50' };
      default: return { left: 'M20,45 H40 V55 H20 Z', right: 'M60,45 H80 V55 H60 Z' };
    }
  };

  const danceClass = useMemo(() => {
    if (!isDancing) return 'animate-float';
    switch (danceStyle) {
      case 'shuffle': return 'animate-dance-shuffle scale-110';
      case 'robotic': return 'animate-dance-robotic';
      case 'vibing': return 'animate-dance-vibing';
      default: return 'animate-dance-classic scale-110';
    }
  }, [isDancing, danceStyle]);

  const paths = getEyePaths();

  return (
    <div className="relative w-full h-full flex items-center justify-center p-12">
      {/* Musical Vibes */}
      {(isDancing || isSinging) && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-10 animate-note-1 text-2xl" style={{ color: theme.eye }}>♫</div>
          <div className="absolute top-20 right-10 animate-note-2 text-2xl" style={{ color: theme.eye }}>♪</div>
          <div className="absolute -bottom-10 left-1/2 animate-note-3 text-2xl" style={{ color: theme.eye }}>♬</div>
        </div>
      )}

      {/* Body Frame */}
      <div className={`relative w-64 h-80 flex flex-col items-center transition-all duration-500 ${danceClass}`}>
        
        {/* Arms */}
        <div className={`absolute -left-12 top-20 w-8 h-28 bg-zinc-800 rounded-full border-4 border-zinc-700 origin-top shadow-xl transition-all ${isDancing ? 'animate-arm-swing-l' : ''}`} style={{ borderColor: theme.eye + '22' }}></div>
        <div className={`absolute -right-12 top-20 w-8 h-28 bg-zinc-800 rounded-full border-4 border-zinc-700 origin-top shadow-xl transition-all ${isDancing ? 'animate-arm-swing-r' : ''}`} style={{ borderColor: theme.eye + '22' }}></div>

        {/* Head Unit */}
        <div className={`relative w-full h-64 bg-zinc-950 rounded-[5rem] overflow-hidden border-[12px] transition-all duration-700 shadow-2xl ${theme.glow}`} style={{ borderColor: theme.eye + '22' }}>
          
          {/* Battery Status Indicator */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full border border-white/5">
            <div className="w-8 h-3 border border-white/20 rounded-[2px] relative p-[1px]">
              <div 
                className={`h-full rounded-[1px] transition-all duration-1000 ${battery < 20 ? 'bg-red-500' : 'bg-green-500'}`} 
                style={{ width: `${battery}%` }}
              ></div>
            </div>
            <span className="text-[8px] font-black text-white/40">{battery}%</span>
          </div>

          <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-white to-transparent"></div>
          
          <svg 
            viewBox="0 0 100 100" 
            className="w-[85%] h-[85%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-[400ms]"
            style={{ transform: `translate(${(trackingPos.x * 12) - 50}%, ${(trackingPos.y * 6) - 50}%)` }}
          >
            <path d={paths.left} fill={isProcessing ? '#fff' : theme.eye} className="transition-all duration-300" />
            <path d={paths.right} fill={isProcessing ? '#fff' : theme.eye} className="transition-all duration-300" />
            
            {/* Reactive Mouth (Fala/Canto) */}
            {(isSinging || isProcessing) && (
              <g transform="translate(35, 75)">
                <rect 
                  width="30" 
                  height={isProcessing ? (2 + Math.random() * 8) : (4 + audioLevel * 50)} 
                  rx="2" 
                  fill={theme.eye} 
                  className="opacity-80 transition-all duration-75"
                />
              </g>
            )}
          </svg>

          {emoji && <div className="absolute top-[30%] right-[15%] animate-bounce text-4xl drop-shadow-lg select-none">{emoji}</div>}
        </div>

        {/* Legs */}
        <div className="flex gap-14 mt-[-25px] relative z-[-1]">
          <div className={`w-14 h-28 bg-zinc-800 rounded-b-3xl border-x-4 border-b-4 border-zinc-700 shadow-2xl ${isDancing ? 'animate-leg-l' : ''}`}></div>
          <div className={`w-14 h-28 bg-zinc-800 rounded-b-3xl border-x-4 border-b-4 border-zinc-700 shadow-2xl ${isDancing ? 'animate-leg-r' : ''}`}></div>
        </div>
      </div>

      <style>{`
        @keyframes dance-classic {
          0%, 100% { transform: translateY(0) rotate(0); }
          25% { transform: translateY(-15px) rotate(5deg); }
          75% { transform: translateY(-15px) rotate(-5deg); }
        }
        @keyframes dance-shuffle {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-15px) skewX(5deg); }
          40% { transform: translateX(15px) skewX(-5deg); }
          60% { transform: translateX(-10px); }
          80% { transform: translateX(10px); }
        }
        @keyframes dance-robotic {
          0%, 20%, 40%, 60%, 80%, 100% { transform: translate(0,0) rotate(0); }
          10% { transform: translate(5px, -5px) rotate(2deg); }
          30% { transform: translate(-5px, 5px) rotate(-2deg); }
          50% { transform: translate(0, -10px); }
          70% { transform: translate(10px, 0); }
        }
        @keyframes dance-vibing {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05) translateY(-5px); }
        }
        @keyframes arm-swing-l {
          0%, 100% { transform: rotate(0); }
          50% { transform: rotate(45deg); }
        }
        @keyframes arm-swing-r {
          0%, 100% { transform: rotate(0); }
          50% { transform: rotate(-45deg); }
        }
        @keyframes leg-l {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes note-1 { 0% { opacity:0; transform:translateY(0) scale(0.5); } 50% { opacity:1; } 100% { opacity:0; transform:translateY(-150px) rotate(45deg) scale(1.5); } }
        .animate-note-1 { animation: note-1 3s infinite ease-out; }
      `}</style>
    </div>
  );
};

export default RobotBody;
