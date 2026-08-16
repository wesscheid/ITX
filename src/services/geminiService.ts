import { GoogleGenAI, Type } from "@google/genai";
import { ProcessingResult } from "../types";
import { DownloaderError } from "./videoDownloaderService";

const getApiKey = () => {
  try {
    return import.meta.env.VITE_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY || process.env.API_KEY : "");
  } catch (e) {
    return "";
  }
};

const apiKey = getApiKey();
const ai = new GoogleGenAI({ apiKey });

export const translateVideo = async (
  base64Data: string,
  mimeType: string,
  targetLanguage: string
): Promise<ProcessingResult> => {
  const modelId = "gemini-2.5-flash";

  try {
    const prompt = `
      You are an expert transcriptionist and translator.
      Analyze the provided media file and follow these instructions strictly:
      1. **Transcription**: Transcribe the spoken audio accurately in its original language. 
      2. **Translation**: Translate the transcription into ${targetLanguage}. Ensure the translation is natural and maintains the original tone.
      3. **Title**: Create a concise, descriptive title (max 5-7 words).
      
      **Formatting Requirements (MANDATORY)**:
      - You MUST format the "originalText" and "translatedText" for maximum readability.
      - Break the text into paragraphs using double line breaks (\\n\\n).
      - Each paragraph should contain 1-3 sentences or represent a single logical thought or speaker change.
      - NEVER return a single block of text.
      
      **Structural Example**:
      "This is the first paragraph.\\n\\nThis is the second paragraph after a logical break.\\n\\nThis is the third paragraph."
      
      Output MUST be a valid JSON object with these keys:
      - "originalText": The formatted transcription.
      - "translatedText": The formatted translation.
      - "title": The descriptive title.

      If there is no speech, describe the audio/visual content in the "originalText" field and translate that description.
    `;

    const result = await ai.models.generateContent({
      model: modelId,
      contents: [{
        role: "user",
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
      }],
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

    if (!result.text) {
      throw new Error("No response text generated");
    }

    const jsonResult = JSON.parse(result.text);

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
      You are an expert transcriptionist and translator.
      Analyze the provided media file and follow these instructions strictly:
      1. **Transcription**: Transcribe the spoken audio accurately in its original language. 
      2. **Translation**: Translate the transcription into ${targetLanguage}. Ensure the translation is natural and maintains the original tone.
      3. **Title**: Create a concise, descriptive title (max 5-7 words).
      
      **Formatting Requirements (MANDATORY)**:
      - You MUST format the "originalText" and "translatedText" for maximum readability.
      - Break the text into paragraphs using double line breaks (\\n\\n).
      - Each paragraph should contain 1-3 sentences or represent a single logical thought or speaker change.
      - NEVER return a single block of text.
      
      **Structural Example**:
      "This is the first paragraph.\\n\\nThis is the second paragraph after a logical break.\\n\\nThis is the third paragraph."
      
      Output MUST be a valid JSON object with these keys:
      - "originalText": The formatted transcription.
      - "translatedText": The formatted translation.
      - "title": The descriptive title.

      If there is no speech, describe the audio/visual content in the "originalText" field and translate that description.
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

    const result = await ai.models.generateContent({
      model: modelId,
      contents: [{
        role: "user",
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
      }],
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

    if (!result.text) {
      throw new Error("No response text generated");
    }

    const jsonResult = JSON.parse(result.text);

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
  onProgress?: (progress: number, message: string, log?: string) => void
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
      throw new DownloaderError(error.error || 'Failed to transcribe video', error.code || 'HTTP_ERROR', error.details);
    } catch (e) {
      if (e instanceof DownloaderError) throw e;
      throw new DownloaderError(`Server error: ${response.status} ${response.statusText}`, 'HTTP_ERROR');
    }
  }

  if (!response.body) {
    throw new DownloaderError('No response body received', 'EMPTY_RESPONSE');
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
          case 'log':
            if (onProgress) {
              onProgress(-1, '', msg.message);
            }
            break;

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
            throw new DownloaderError(
              msg.data?.message || msg.data?.error || 'Unknown server error',
              'RESOLVER_CONNECTION_ERROR',
              msg.data?.details || msg.data?.message
            );
        }
      } catch (e) {
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