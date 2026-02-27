import { GoogleGenAI, Type, Modality } from '@google/genai';
import { useStore } from '../store/useStore';

export const analyzeBookWithAI = async (text: string, apiKey: string) => {
  if (!apiKey) {
    throw new Error('API Key is required for AI analysis');
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  
  useStore.getState().incrementApiCallCount();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze the following book excerpt and provide a summary, main characters, themes, a glossary of unique terms, and detect the language the book is written in.
    
    Excerpt:
    ${text.substring(0, 150000)}`,
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
  });

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error('Failed to parse AI response', e);
    return null;
  }
};

export const translateText = async (text: string, targetLang: string, apiKey: string) => {
  if (!apiKey) return 'API Key required for translation.';
  
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  useStore.getState().incrementApiCallCount();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Translate the following text to ${targetLang}. If ${targetLang} is Hebrew, you MUST translate it to Hebrew (עברית). Output ONLY the translated text and nothing else. Do not include any conversational filler like "Here is the translation", no markdown formatting, and no quotes. Just the raw translated text:\n\n${text}`,
  });
  return response.text?.trim() || '';
};

export const translateSentencesBatch = async (sentences: string[], targetLang: string, apiKey: string) => {
  if (!apiKey || sentences.length === 0) return [];
  
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  useStore.getState().incrementApiCallCount();
  
  const payload = sentences.map((s, i) => ({ id: i, text: s }));
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
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
  });
  
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
  if (!apiKey) return 'API Key required.';
  
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  useStore.getState().incrementApiCallCount();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Define the word "${word}" in the context of this sentence: "${context}". Keep it brief.`,
  });
  return response.text || '';
};

export const generateSpeech = async (text: string, voiceName: string, apiKey: string) => {
  if (!apiKey) throw new Error('API Key required for Gemini TTS.');

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  useStore.getState().incrementApiCallCount();
  const response = await ai.models.generateContent({
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
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error('Failed to generate audio.');

  return base64Audio;
};
