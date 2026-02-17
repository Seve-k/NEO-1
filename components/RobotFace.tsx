
import React, { useEffect, useState, useMemo } from 'react';
import { Mood } from '../types';

interface RobotFaceProps {
  mood: Mood;
  isProcessing: boolean;
  audioLevel?: number;
  trackingPos?: { x: number, y: number };
}

const RobotFace: React.FC<RobotFaceProps> = ({ mood, isProcessing, audioLevel = 0, trackingPos = { x: 0, y: 0 } }) => {
  const [blink, setBlink] = useState(false);
  const [emoji, setEmoji] = useState<string | null>(null);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 120);
    }, 4500 + Math.random() * 3000);
    return () => clearInterval(blinkInterval);
  }, []);

  // Show emoji when mood changes
  useEffect(() => {
    const emojis: Record<string, string> = {
      happy: '😊', love: '💖', cool: '😎', angry: '💢', 
      surprised: '😲', excited: '⚡', confused: '❓', thinking: '🤔'
    };
    if (emojis[mood]) {
      setEmoji(emojis[mood]);
      const timer = setTimeout(() => setEmoji(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [mood]);

  const theme = useMemo(() => {
    const themes: Record<string, { eye: string, glow: string }> = {
      neutral: { eye: '#22d3ee', glow: 'shadow-cyan-500/20' },
      happy: { eye: '#22d3ee', glow: 'shadow-cyan-400/40' },
      love: { eye: '#f472b6', glow: 'shadow-pink-500/40' },
      angry: { eye: '#ef4444', glow: 'shadow-red-500/40' },
      cool: { eye: '#a855f7', glow: 'shadow-purple-500/40' },
      scared: { eye: '#fbbf24', glow: 'shadow-yellow-500/40' },
      excited: { eye: '#22d3ee', glow: 'shadow-cyan-300/60' },
      thinking: { eye: '#60a5fa', glow: 'shadow-blue-500/20' },
      sleepy: { eye: '#3f3f46', glow: 'shadow-transparent' },
    };
    return themes[mood] || themes.neutral;
  }, [mood]);

  const getEyePaths = () => {
    if (blink && mood !== 'sleepy') return { left: 'M20,50 Q30,49 40,50', right: 'M60,50 Q70,49 80,50' };
    switch (mood) {
      case 'happy': return { left: 'M20,55 Q30,40 40,55', right: 'M60,55 Q70,40 80,55' };
      case 'love': return { left: 'M25,55 Q20,45 30,45 Q40,45 35,55 L30,60 Z', right: 'M65,55 Q60,45 70,45 Q80,45 75,55 L70,60 Z' };
      case 'cool': return { left: 'M15,45 H45 V55 H15 Z', right: 'M55,45 H85 V55 H55 Z' };
      case 'wink': return { left: 'M20,55 Q30,40 40,55', right: 'M60,50 Q70,49 80,50' };
      case 'scared': return { left: 'M25,45 A5,5 0 1,1 24.9,45', right: 'M75,45 A5,5 0 1,1 74.9,45' };
      case 'angry': return { left: 'M20,40 L40,55 L40,50 Z', right: 'M80,40 L60,55 L60,50 Z' };
      case 'confused': return { left: 'M20,45 Q30,40 40,50', right: 'M60,55 Q70,60 80,45' };
      case 'excited': return { left: 'M20,50 A8,12 0 1,1 19.9,50', right: 'M60,50 A8,12 0 1,1 59.9,50' };
      case 'sleepy': return { left: 'M20,58 Q30,56 40,58', right: 'M60,58 Q70,56 80,58' };
      case 'listening':
        const swell = audioLevel * 25;
        return { left: `M30,50 A${8+swell},${8+swell} 0 1,1 29.9,50`, right: `M70,50 A${8+swell},${8+swell} 0 1,1 69.9,50` };
      default: return { left: 'M20,45 H40 V55 H20 Z', right: 'M60,45 H80 V55 H60 Z' };
    }
  };

  const paths = getEyePaths();

  return (
    <div className={`relative w-full h-full flex items-center justify-center bg-zinc-950 rounded-[4rem] overflow-hidden border-[10px] transition-all duration-700 shadow-2xl ${theme.glow} ${mood === 'angry' ? 'border-red-500/20' : 'border-zinc-900'}`}>
      <div className="absolute inset-0 opacity-10 bg-gradient-to-b from-transparent to-cyan-500 animate-[pulse_6s_ease-in-out_infinite]"></div>
      
      {/* Dynamic Eye Tracking Group */}
      <svg 
        viewBox="0 0 100 100" 
        className="w-[85%] h-[85%] transition-transform duration-[400ms] ease-out-back"
        style={{ transform: `translate(${trackingPos.x * 12}px, ${trackingPos.y * 6}px)` }}
      >
        <path d={paths.left} fill={isProcessing ? '#fff' : theme.eye} className="transition-all duration-300" />
        <path d={paths.right} fill={isProcessing ? '#fff' : theme.eye} className="transition-all duration-300" />
      </svg>

      {/* Floating Mood Feedback */}
      {emoji && (
        <div className="absolute top-[20%] right-[20%] animate-[bounce_1s_infinite] text-5xl pointer-events-none drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] select-none">
          {emoji}
        </div>
      )}

      {/* Interaction Pulse */}
      <div className="absolute bottom-12 flex gap-3">
        <div className={`h-1 w-8 rounded-full transition-all duration-500 ${isProcessing ? 'bg-cyan-400 shadow-[0_0_15px_#22d3ee]' : 'bg-zinc-800'}`}></div>
      </div>
    </div>
  );
};

export default RobotFace;
