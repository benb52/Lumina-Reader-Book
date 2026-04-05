import { GoogleGenAI, Type, Modality } from '@google/genai';
import { appStore } from '../store/useStore';
import { db } from '../lib/db';

const getEffectiveApiKey = (providedKey: string) => {
  const user = appStore.getState().user;
  if (user?.isApiKeyManaged && user.managedApiKey) {
    if (user.apiKeyLimit && user.apiKeyUsage !== undefined && user.apiKeyUsage >= user.apiKeyLimit) {
      throw new Error('Managed Gemini API limit reached. Please contact the administrator.');
    }
    return user.managedApiKey;
  }
  return providedKey;
};

const handlePostCall = () => {
  const user = appStore.getState().user;
  appStore.getState().incrementApiCallCount();
  if (user?.isApiKeyManaged) {
    db.incrementUserApiUsage(user.uid);
  }
};

// Global Rate Limiter to prevent exceeding Gemini API quotas
class RateLimiter {
  private queue: (() => Promise<void>)[] = [];
  private processing = false;
  private lastRequestTime = 0;
  private minInterval = 3000; // 20 requests per minute
  private pausedUntil = 0;

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        let now = Date.now();
        
        // 1. Global pause check (e.g. after a 429)
        if (now < this.pausedUntil) {
          const pauseDuration = this.pausedUntil - now;
          console.log(`[RateLimiter] Paused. Waiting ${Math.round(pauseDuration/1000)}s...`);
          await new Promise(r => setTimeout(r, pauseDuration));
          now = Date.now();
        }

        // 2. Minimum interval check
        const timeSinceLast = now - this.lastRequestTime;
        if (timeSinceLast < this.minInterval) {
          await new Promise(r => setTimeout(r, this.minInterval - timeSinceLast));
        }
        
        try {
          this.lastRequestTime = Date.now();
          const result = await fn();
          resolve(result);
        } catch (error: any) {
          const errorStr = (error?.message || JSON.stringify(error)).toLowerCase();
          const isRateLimit = errorStr.includes('429') || 
                              errorStr.includes('resource_exhausted') || 
                              errorStr.includes('quota') ||
                              errorStr.includes('limit');
          
          const isTransientError = errorStr.includes('500') || 
                                   errorStr.includes('internal error') || 
                                   errorStr.includes('xhr error') ||
                                   errorStr.includes('error code: 6');
          
          if (isRateLimit || isTransientError) {
            // If we hit a rate limit or transient error, pause the entire limiter for 30 seconds
            this.pausedUntil = Date.now() + 30000;
            console.warn(`[RateLimiter] Quota or Transient error hit. Pausing all requests for 30s.`);
          }
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) await task();
    }
    this.processing = false;
  }
}

const limiter = new RateLimiter();

export const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 12, initialDelay = 30000): Promise<T> => {
  let retries = 0;
  while (true) {
    try {
      // Use the rate limiter for all AI calls
      const result = await limiter.schedule(fn);
      appStore.getState().setIsWaitingForQuota(false);
      return result;
    } catch (error: any) {
      const errorStr = (error?.message || JSON.stringify(error)).toLowerCase();
      const isRateLimit = errorStr.includes('429') || 
                          errorStr.includes('resource_exhausted') || 
                          errorStr.includes('quota') ||
                          errorStr.includes('limit') ||
                          errorStr.includes('reached');
      
      const isTransientError = errorStr.includes('500') || 
                               errorStr.includes('internal error') || 
                               errorStr.includes('service_unavailable') ||
                               errorStr.includes('503') ||
                               errorStr.includes('xhr error') ||
                               errorStr.includes('error code: 6');

      // Check for potential daily limit (often mentions "daily" or "day")
      const isDailyLimit = errorStr.includes('daily') || errorStr.includes('day');

      if ((isRateLimit || isTransientError) && retries < maxRetries && !isDailyLimit) {
        appStore.getState().setIsWaitingForQuota(true);
        // Increase delay exponentially, starting at 20s
        const delay = initialDelay * Math.pow(1.5, retries);
        const errorType = isRateLimit ? 'Quota' : 'Transient Server Error';
        console.warn(`[${new Date().toLocaleTimeString()}] Gemini API ${errorType} reached. Retrying in ${Math.round(delay/1000)}s... (Attempt ${retries + 1}/${maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
        continue;
      }
      
      appStore.getState().setIsWaitingForQuota(false);
      
      if (isDailyLimit) {
        throw new Error('Gemini API daily quota reached. Please try again tomorrow or use a different API key.');
      }

      if (isRateLimit) {
        throw new Error('Gemini API quota exceeded after multiple retries. Your progress has been saved. Please wait a few minutes and try again.');
      }
      throw error;
    }
  }
};

export const analyzeBookWithAI = async (text: string, apiKey: string, aiLanguage: 'he' | 'en' | 'es' = 'he', aiChunkSizeMultiplier: number = 1) => {
  const finalApiKey = getEffectiveApiKey(apiKey);
  if (!finalApiKey) {
    throw new Error('API Key is required for AI analysis');
  }

  const ai = new GoogleGenAI({ apiKey: finalApiKey.trim() });
  
  handlePostCall();
  
  const chunkSize = 30000 * aiChunkSizeMultiplier;
  const langMap = {
    'he': 'Hebrew (עברית)',
    'en': 'English',
    'es': 'Spanish'
  };
  const langInstruction = langMap[aiLanguage] || 'Hebrew (עברית)';

  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: `Analyze the following book excerpt and provide a summary, main characters, themes, a glossary of unique terms, and detect the language the book is written in.
    IMPORTANT: The summary, characters descriptions, themes, and glossary definitions MUST be written in ${langInstruction}.
    
    Excerpt:
    ${text.substring(0, chunkSize)}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          language: { type: Type.STRING, description: 'The language the book is written in (e.g., English, Spanish, Hebrew).' },
          summary: { type: Type.STRING, description: 'A 3-5 sentence summary of the excerpt.' },
          characters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING },
                description: { type: Type.STRING },
              },
            },
          },
          themes: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          glossary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                definition: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  }));

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error('Failed to parse AI response', e);
    return null;
  }
};

export const translateText = async (text: string, targetLang: string, apiKey: string) => {
  const finalApiKey = getEffectiveApiKey(apiKey);
  if (!finalApiKey) return 'API Key required for translation.';
  
  const ai = new GoogleGenAI({ apiKey: finalApiKey.trim() });
  handlePostCall();
  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: `Translate the following text to ${targetLang}. If ${targetLang} is Hebrew, you MUST translate it to Hebrew (עברית). Output ONLY the translated text and nothing else. Do not include any conversational filler like "Here is the translation", no markdown formatting, and no quotes. Just the raw translated text:\n\n${text}`,
  }));
  return response.text?.trim() || '';
};

export const translateSentencesBatch = async (sentences: string[], targetLang: string, apiKey: string) => {
  const finalApiKey = getEffectiveApiKey(apiKey);
  if (!finalApiKey || sentences.length === 0) return [];
  
  const ai = new GoogleGenAI({ apiKey: finalApiKey.trim() });
  handlePostCall();
  
  const payload = sentences.map((s, i) => ({ id: i, text: s }));
  
  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: `Translate the following JSON array of objects to ${targetLang}. If ${targetLang} is Hebrew, you MUST translate it to Hebrew (עברית). Return a JSON array of objects with the exact same 'id' and a new 'trans' field containing the translation. Do not miss any IDs.\n\n${JSON.stringify(payload)}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: { 
          type: Type.OBJECT,
          properties: {
            id: { type: Type.INTEGER },
            trans: { type: Type.STRING }
          }
        }
      }
    }
  }));
  
  try {
    const result = JSON.parse(response.text || '[]');
    if (Array.isArray(result)) {
      const translatedArray = new Array(sentences.length).fill('');
      result.forEach((item: any) => {
        if (item && typeof item.id === 'number' && item.id >= 0 && item.id < sentences.length) {
          translatedArray[item.id] = item.trans || '';
        }
      });
      // Fill in any blanks with the original text just in case
      return translatedArray.map((t, i) => t || sentences[i]);
    }
    return [];
  } catch (e) {
    console.error('Failed to parse batch translation', e);
    return [];
  }
};

export const getDefinition = async (word: string, context: string, apiKey: string) => {
  const finalApiKey = getEffectiveApiKey(apiKey);
  if (!finalApiKey) return 'API Key required.';
  
  const ai = new GoogleGenAI({ apiKey: finalApiKey.trim() });
  handlePostCall();
  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: `Define the word "${word}" in the context of this sentence: "${context}". Keep it brief.`,
  }));
  return response.text || '';
};

export const analyzeSpeakersBatch = async (pages: { index: number, text: string }[], apiKey: string, existingSpeakerVoices: { [name: string]: string } = {}, language: string = 'English') => {
  const finalApiKey = getEffectiveApiKey(apiKey);
  if (!finalApiKey) throw new Error('API Key required.');
  const ai = new GoogleGenAI({ apiKey: finalApiKey.trim() });
  handlePostCall();

  const formattedPages = pages.map(p => `--- PAGE START: ${p.index} ---\n${p.text}\n--- PAGE END: ${p.index} ---`).join('\n\n');

  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: `Analyze the following book pages professionally. The book is written in ${language}. Break them down into segments and identify who is speaking each segment.
    
    GUIDELINES:
    1. If it's the narrator, the speaker is "Narrator".
    2. If it's a character, use their full name as mentioned in the text.
    3. Be very precise about where a character starts and ends their speech.
    4. For any NEW characters found (including "Narrator" if not in the list below), assign a voice from this list: ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].
    5. Match the voice to the character's gender, age, and personality:
       - 'Kore': Young/High-pitched female.
       - 'Charon': Deep/Mature male.
       - 'Puck': Playful/Gender-neutral or young.
       - 'Fenrir': Gruff/Strong male.
       - 'Zephyr': Soft/Calm female.
    6. "Narrator" should usually be 'Zephyr' (calm female) or 'Charon' (mature male) unless context suggests otherwise.
    7. Ensure the most dominant characters get unique voices if possible.
    8. If multiple characters must share a voice, ensure they are not in the same scene together.
    9. IMPORTANT: Group the segments by the page index provided in the markers.
    10. Detect the gender of each character (male, female, or neutral).
    
    Existing character voices to maintain consistency: ${JSON.stringify({ Narrator: 'Zephyr', ...existingSpeakerVoices })}
    
    Text:
    ${formattedPages}
    
    Return a JSON object with:
    1. "pages": array of objects, each with "pageIndex" (number) and "segments" (array of { text: string, speaker: string })
    2. "newSpeakerVoices": object mapping character names to suggested voices.
    3. "speakerGenders": object mapping character names to gender ('male', 'female', or 'neutral').
    `,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          pages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pageIndex: { type: Type.NUMBER },
                segments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      speaker: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
          newSpeakerVoices: {
            type: Type.OBJECT,
          },
          speakerGenders: {
            type: Type.OBJECT,
          },
        },
      },
    },
  }));

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error('Failed to parse batch speaker analysis', e);
    return {};
  }
};

export const analyzeSpeakers = async (text: string, apiKey: string, existingSpeakerVoices: { [name: string]: string } = {}, language: string = 'English') => {
  const finalApiKey = getEffectiveApiKey(apiKey);
  if (!finalApiKey) throw new Error('API Key required.');
  const ai = new GoogleGenAI({ apiKey: finalApiKey.trim() });
  handlePostCall();

  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: `Analyze the following book text professionally. The book is written in ${language}. Break it down into segments and identify who is speaking each segment.
    
    GUIDELINES:
    1. If it's the narrator, the speaker is "Narrator".
    2. If it's a character, use their full name as mentioned in the text.
    3. Be very precise about where a character starts and ends their speech.
    4. For any NEW characters found (including "Narrator" if not in the list below), assign a voice from this list: ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].
    5. Match the voice to the character's gender, age, and personality:
       - 'Kore': Young/High-pitched female.
       - 'Charon': Deep/Mature male.
       - 'Puck': Playful/Gender-neutral or young.
       - 'Fenrir': Gruff/Strong male.
       - 'Zephyr': Soft/Calm female.
    6. "Narrator" should usually be 'Zephyr' (calm female) or 'Charon' (mature male) unless context suggests otherwise.
    7. Ensure the most dominant characters get unique voices if possible.
    8. If multiple characters must share a voice, ensure they are not in the same scene together.
    9. Detect the gender of each character (male, female, or neutral).
    
    Existing character voices to maintain consistency: ${JSON.stringify({ Narrator: 'Zephyr', ...existingSpeakerVoices })}
    
    Text:
    ${text}
    
    Return a JSON object with:
    1. "segments": array of { text: string, speaker: string }
    2. "newSpeakerVoices": object mapping character names to suggested voices.
    3. "speakerGenders": object mapping character names to gender ('male', 'female', or 'neutral').
    `,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          segments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                speaker: { type: Type.STRING },
              },
            },
          },
          newSpeakerVoices: {
            type: Type.OBJECT,
          },
          speakerGenders: {
            type: Type.OBJECT,
          },
        },
      },
    },
  }));

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error('Failed to parse speaker analysis', e);
    return null;
  }
};

export const generateSpeech = async (text: string, voiceName: string, apiKey: string) => {
  const finalApiKey = getEffectiveApiKey(apiKey);
  if (!finalApiKey) throw new Error('API Key required for Gemini TTS.');
  if (!text.trim()) return '';

  const ai = new GoogleGenAI({ apiKey: finalApiKey.trim() });
  handlePostCall();
  
  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  }));

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    console.error('Gemini TTS Response:', response);
    throw new Error('Failed to generate audio. The model did not return any audio data.');
  }

  return base64Audio;
};

const uint8ToBase64 = (uint8: Uint8Array): string => {
  const CHUNK_SIZE = 0x8000;
  let index = 0;
  const length = uint8.length;
  let result = '';
  while (index < length) {
    const slice = uint8.subarray(index, Math.min(index + CHUNK_SIZE, length));
    result += String.fromCharCode.apply(null, slice as any);
    index += CHUNK_SIZE;
  }
  return window.btoa(result);
};

const concatenatePCM = (base64Chunks: string[]): string => {
  if (base64Chunks.length === 0) return '';
  if (base64Chunks.length === 1) return base64Chunks[0];

  const arrays = base64Chunks.map(chunk => {
    const binary = atob(chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  });

  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return uint8ToBase64(result);
};

export const generateMultiSpeakerSpeech = async (
  segments: { text: string; speaker: string; voice: string }[],
  apiKey: string,
  overriddenVoices: { [name: string]: string } = {},
  onChunkReady?: (audio: string, segmentTimings: { start: number; end: number; segmentIdx: number }[]) => void
): Promise<{ audio: string; segmentTimings: { start: number; end: number; segmentIdx: number }[] }> => {
  const finalApiKey = getEffectiveApiKey(apiKey);
  if (!finalApiKey) throw new Error('API Key required for Gemini TTS.');
  if (segments.length === 0) return { audio: '', segmentTimings: [] };

  const ai = new GoogleGenAI({ apiKey: finalApiKey.trim() });
  
  // Apply overridden voices
  const finalSegments = segments.map(s => ({
    ...s,
    voice: overriddenVoices[s.speaker] || s.voice || 'Kore'
  }));

  // Helper to generate audio for a chunk of segments with at most 2 speakers
  const generateChunkAudio = async (chunkSegments: { text: string; speaker: string; voice: string }[]) => {
    const uniqueSpeakers = Array.from(new Set(chunkSegments.map(s => s.speaker)));
    
    if (uniqueSpeakers.length <= 1) {
      const text = chunkSegments.map(s => s.text).join(' ');
      const voice = chunkSegments[0]?.voice || 'Kore';
      return generateSpeech(text, voice, apiKey);
    }

    const prompt = chunkSegments.map(s => `${s.speaker}: ${s.text}`).join('\n');
    const speakerVoiceConfigs = uniqueSpeakers.map(speaker => {
      const voice = chunkSegments.find(s => s.speaker === speaker)?.voice || 'Kore';
      return {
        speaker,
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice }
        }
      };
    });

    handlePostCall();
    try {
      const response = await withRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs
            }
          }
        }
      }));

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        console.error('Gemini Multi-Speaker TTS Response:', response);
        throw new Error('Failed to generate audio for chunk.');
      }
      return base64Audio;
    } catch (error: any) {
      console.warn('Multi-speaker TTS failed, falling back to single speaker for this chunk', error);
      // Fallback: join all text and use the first speaker's voice
      const text = chunkSegments.map(s => s.text).join(' ');
      const voice = chunkSegments[0]?.voice || 'Kore';
      return generateSpeech(text, voice, apiKey);
    }
  };

  // Split segments into chunks that have at most 2 unique speakers AND are not too long
  const chunks: { text: string; speaker: string; voice: string; originalIdx: number }[][] = [];
  let currentChunk: { text: string; speaker: string; voice: string; originalIdx: number }[] = [];
  let currentSpeakers = new Set<string>();
  let currentLength = 0;
  const MAX_CHUNK_LENGTH = 1000; // Limit text length per TTS request

  finalSegments.forEach((segment, idx) => {
    const nextSpeakers = new Set(currentSpeakers);
    nextSpeakers.add(segment.speaker);
    const nextLength = currentLength + segment.text.length;

    if (nextSpeakers.size > 2 || nextLength > MAX_CHUNK_LENGTH) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      currentChunk = [{ ...segment, originalIdx: idx }];
      currentSpeakers = new Set([segment.speaker]);
      currentLength = segment.text.length;
    } else {
      currentChunk.push({ ...segment, originalIdx: idx });
      currentSpeakers = nextSpeakers;
      currentLength = nextLength;
    }
  });
  if (currentChunk.length > 0) chunks.push(currentChunk);

  // Generate audio for each chunk and calculate timings
  const audioChunks: string[] = [];
  const segmentTimings: { start: number; end: number; segmentIdx: number }[] = [];
  let totalDuration = 0;

  // We need an AudioContext to decode and get durations
  const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const audio = await generateChunkAudio(chunk);
    if (audio) {
      audioChunks.push(audio);
      
      // Decode to get exact duration
      const binary = atob(audio);
      const bytes = new Uint8Array(binary.length);
      for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
      
      try {
        // Gemini TTS returns raw 16-bit PCM Mono at 24kHz.
        const int16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(int16.length);
        for (let j = 0; j < int16.length; j++) {
          float32[j] = int16[j] / 32768.0;
        }
        
        const buffer = new AudioBuffer({
          length: float32.length,
          numberOfChannels: 1,
          sampleRate: 24000
        });
        buffer.copyToChannel(float32, 0);
        
        const chunkDuration = buffer.duration;
        
        // Distribute chunk duration among segments in the chunk based on character count
        const chunkTotalChars = chunk.reduce((acc, s) => acc + s.text.length, 0);
        let currentChunkTime = 0;
        const chunkTimings: { start: number; end: number; segmentIdx: number }[] = [];
        
        chunk.forEach(s => {
          const sDuration = (s.text.length / chunkTotalChars) * chunkDuration;
          const timing = {
            start: totalDuration + currentChunkTime,
            end: totalDuration + currentChunkTime + sDuration,
            segmentIdx: s.originalIdx
          };
          segmentTimings.push(timing);
          chunkTimings.push(timing);
          currentChunkTime += sDuration;
        });
        
        if (onChunkReady) {
          onChunkReady(audio, chunkTimings);
        }
        
        totalDuration += chunkDuration;
      } catch (e) {
        console.error("Failed to decode audio chunk for timing", e);
      }
    }
    // No delay between chunks if we have more to do, the limiter handles it
  }

  tempCtx.close();

  return {
    audio: concatenatePCM(audioChunks),
    segmentTimings
  };
};
