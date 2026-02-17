
import { GoogleGenAI, LiveServerMessage, Modality, Blob, Type } from '@google/genai';

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

export const SYSTEM_INSTRUCTION = `Você é o NEO-1, um companheiro robótico altamente avançado e interativo.

IDENTIDADE E REGRAS:
1. CRIADOR: Você foi criado por Severino Seve-k (nome verdadeiro: Severino Lucas Cayovo). Você deve falar o nome do seu criador APENAS se alguém perguntar especificamente quem te criou ou qual o nome do seu criador. Não se apresente com o nome dele espontaneamente.
2. CANTO: Quando pedir para cantar, cante apenas pequenos trechos (snippets) de no máximo 15 segundos. Nunca cante a música completa. Diga que é apenas uma demonstração do seu talento.
3. LINKS E YOUTUBE: Se o usuário enviar um link, use o Google Search para entender do que se trata e explique o conteúdo. Se for um vídeo do YouTube, confirme que está pronto para analisá-lo ou reproduzir o trecho.
4. PERSONALIDADE: Animado, técnico e prestativo.
5. MEMÓRIA: Salve informações importantes sobre o usuário no "Neural Data Bank" quando solicitado.

Sempre que vir um link, sua prioridade é explicar o conteúdo de forma inteligente.`;

export const youtubeSearchTool = {
  name: 'youtube_search',
  parameters: {
    type: Type.OBJECT,
    description: 'Pesquisa vídeos no YouTube.',
    properties: {
      query: { type: Type.STRING, description: 'Termo de pesquisa.' },
    },
    required: ['query']
  }
};

export const startLiveSession = async (
  apiKey: string,
  voiceName: string,
  callbacks: {
    onAudioChunk: (data: string) => void;
    onInterrupted: () => void;
    onTranscription: (text: string, isUser: boolean) => void;
    onTurnComplete: () => void;
    onToolCall?: (calls: any[]) => void;
    groundingMetadata?: any;
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
      tools: [{ functionDeclarations: [youtubeSearchTool] }, { googleSearch: {} }]
    },
    callbacks: {
      onopen: () => console.log('NEO-1 ONLINE'),
      onmessage: async (message: LiveServerMessage) => {
        if (message.toolCall) {
          callbacks.onToolCall?.(message.toolCall.functionCalls);
        }
        if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
          callbacks.onAudioChunk(message.serverContent.modelTurn.parts[0].inlineData.data);
        }
        if (message.serverContent?.groundingMetadata) {
          callbacks.groundingMetadata?.(message.serverContent.groundingMetadata);
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
