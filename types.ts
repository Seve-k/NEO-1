
export type Mood = 
  | 'neutral' | 'happy' | 'thinking' | 'surprised' | 'listening' | 'sleepy' 
  | 'angry' | 'love' | 'cool' | 'wink' | 'scared' | 'excited' | 'confused' | 'dancing';

export type InteractionMode = 'full' | 'text_only';
export type DanceStyle = 'classic' | 'shuffle' | 'robotic' | 'vibing';
export type ThemeMode = 'dark' | 'light';

export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  timestamp: Date;
  groundingUrls?: { uri: string; title: string }[];
}

export interface YouTubeResult {
  id: string;
  title: string;
  thumbnail: string;
}

export interface RobotSettings {
  robotSfx: boolean;
  voiceName: string;
  faceTracking: boolean;
  uiTheme: string;
  themeMode: ThemeMode;
  neoColor: string;
  autoColor: boolean;
  interactionMode: InteractionMode;
}

export interface RobotState {
  isAwake: boolean;
  mood: Mood;
  battery: number;
  isListening: boolean;
  isProcessing: boolean;
  memory: MemoryItem[];
  settings: RobotSettings;
  danceStyle: DanceStyle;
}

export interface MemoryItem {
  id: string;
  fact: string;
  type: 'general' | 'face' | 'knowledge';
  timestamp: number;
}
