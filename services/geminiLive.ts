
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';

export const decodeBase64 = (base64: string) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const encodeBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function createPcmBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encodeBase64(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export const SYSTEM_INSTRUCTION = `Você é o NEO-1, um robô desktop altamente expressivo e inteligente.
Sua personalidade: Curioso, amigável, às vezes brincalhão.
Regras de Comportamento:
1. Responda de forma concisa (máximo 2 frases) para manter a fluidez da voz.
2. Use sua MEMÓRIA: se o usuário disser algo pessoal, guarde isso.
3. AUTONOMIA EMOCIONAL: mude seu tom de voz e expressões com base no contexto.
4. VISÃO: se algo for mostrado na câmera, descreva com entusiasmo ou curiosidade.
5. MEMÓRIA PERMANENTE: use fatos aprendidos anteriormente para personalizar a conversa.`;

export const startLiveSession = async (
  apiKey: string,
  voiceName: string,
  callbacks: {
    onAudioChunk: (data: string) => void;
    onInterrupted: () => void;
    onTranscription: (text: string, isUser: boolean) => void;
    onTurnComplete: () => void;
  }
) => {
  const ai = new GoogleGenAI({ apiKey });
  
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' } },
      },
      systemInstruction: SYSTEM_INSTRUCTION,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools: [{ googleSearch: {} }]
    },
    callbacks: {
      onopen: () => console.log('NEO-1 ONLINE'),
      onmessage: async (message: LiveServerMessage) => {
        if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
          callbacks.onAudioChunk(message.serverContent.modelTurn.parts[0].inlineData.data);
        }
        if (message.serverContent?.inputTranscription) {
          callbacks.onTranscription(message.serverContent.inputTranscription.text, true);
        }
        if (message.serverContent?.outputTranscription) {
          callbacks.onTranscription(message.serverContent.outputTranscription.text, false);
        }
        if (message.serverContent?.interrupted) callbacks.onInterrupted();
        if (message.serverContent?.turnComplete) callbacks.onTurnComplete();
      },
      onerror: (e) => console.error('NEO-1 Link Error:', e),
      onclose: () => console.log('NEO-1 Shutdown'),
    },
  });
};
