import { GoogleGenAI, Type } from "@google/genai";
import { ProcessingResult } from "../types";

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_API_KEY || process.env.API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

export const translateVideo = async (
  base64Data: string,
  mimeType: string,
  targetLanguage: string
): Promise<ProcessingResult> => {
  const modelId = "gemini-2.5-flash";

  try {
    const prompt = `
      Analyze this media file (Audio or Video).
      1. Create a short, descriptive title for the content (max 10 words).
      2. Transcribe the spoken audio verbatim in its original language.
      3. Translate the transcription into ${targetLanguage}.
      
      Return the output in JSON format with three keys: "title", "originalText", and "translatedText".
      If there is no speech, provide a title, a description of the sound in the "originalText" field, and translate that description.
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            originalText: { type: Type.STRING },
            translatedText: { type: Type.STRING },
          },
          required: ["title", "originalText", "translatedText"],
        },
      },
    });

    if (!response.text) {
      throw new Error("No response text generated");
    }

    const jsonResult = JSON.parse(response.text);

    return {
      title: jsonResult.title,
      originalText: jsonResult.originalText,
      translatedText: jsonResult.translatedText,
      language: targetLanguage,
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

// New: Stream-based translation for better memory management
export const translateVideoStream = async (
  file: File | Blob,
  mimeType: string,
  targetLanguage: string
): Promise<ProcessingResult> => {
  const modelId = "gemini-2.5-flash";

  try {
    const prompt = `
      Analyze this media file (Audio or Video).
      1. Create a short, descriptive title for the content (max 10 words).
      2. Transcribe the spoken audio verbatim in its original language.
      3. Translate the transcription into ${targetLanguage}.
      
      Return the output in JSON format with three keys: "title", "originalText", and "translatedText".
      If there is no speech, provide a title, a description of the sound in the "originalText" field, and translate that description.
    `;

    // Convert file to base64 for browser-side inlineData
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const base64Data = await base64Promise;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            originalText: { type: Type.STRING },
            translatedText: { type: Type.STRING },
          },
          required: ["title", "originalText", "translatedText"],
        },
      },
    });

    if (!response.text) {
      throw new Error("No response text generated");
    }

    const jsonResult = JSON.parse(response.text);

    return {
      title: jsonResult.title,
      originalText: jsonResult.originalText,
      translatedText: jsonResult.translatedText,
      language: targetLanguage,
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

/**
 * NEW: Calls the backend to handle the full byte-transfer pipeline.
 * Uses NDJSON streaming to provide real-time progress updates.
 */
export const transcribeUrl = async (
  url: string,
  targetLanguage: string,
  onProgress?: (progress: number, message: string) => void
): Promise<ProcessingResult> => {
  const response = await fetch('/api/transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, targetLanguage }),
  });

  if (!response.ok) {
    try {
      const error = await response.json();
      throw new Error(error.error || 'Failed to transcribe video');
    } catch (e) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }
  }

  if (!response.body) {
    throw new Error('No response body received');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: ProcessingResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // Process full lines (NDJSON)
    const lines = buffer.split('\n');
    // Keep the last partial line in the buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const msg = JSON.parse(line);
        
        switch (msg.type) {
          case 'progress':
            if (onProgress) {
              onProgress(msg.value, 'Downloading media...');
            }
            break;
            
          case 'status':
            if (onProgress) {
              // Usually 100% when status is sent
              onProgress(100, msg.message);
            }
            break;
            
          case 'result':
            finalResult = {
              ...msg.data,
              language: targetLanguage
            };
            break;
            
          case 'error':
            throw new Error(msg.data?.message || msg.data?.error || 'Unknown server error');
        }
      } catch (e) {
        // If it's a parse error from a partial line, we might ignore, 
        // but since we split by \n, it should be fine.
        if (e instanceof SyntaxError) {
           console.warn('Failed to parse stream line:', line);
           continue;
        }
        throw e;
      }
    }
  }

  if (!finalResult) {
    throw new Error('Stream ended without a result');
  }

  return finalResult;
};