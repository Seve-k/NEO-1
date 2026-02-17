
export type Mood = 
  | 'neutral' 
  | 'happy' 
  | 'thinking' 
  | 'surprised' 
  | 'listening' 
  | 'sleepy' 
  | 'angry'
  | 'love'
  | 'cool'
  | 'wink'
  | 'scared'
  | 'excited'
  | 'confused';

export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

export type InteractionMode = 'voice' | 'text';

export interface MemoryItem {
  id: string;
  fact: string;
  timestamp: number;
}

export interface RobotSettings {
  robotSfx: boolean;
  voiceName: string;
  faceTracking: boolean;
}

export interface RobotState {
  isAwake: boolean;
  mood: Mood;
  battery: number;
  isListening: boolean;
  isProcessing: boolean;
  interactionMode: InteractionMode;
  memory: MemoryItem[];
  settings: RobotSettings;
}
