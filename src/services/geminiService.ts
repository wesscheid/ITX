import { GoogleGenAI, Type } from "@google/genai";
import type { ProcessingResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const translateVideo = async (
  base64Data: string,
  mimeType: string,
  targetLanguage: string
): Promise<ProcessingResult> => {
  const modelId = "gemini-2.5-flash";

  try {
    const prompt = `
      Analyze this media file (Audio or Video).
      1. Transcribe the spoken audio verbatim in its original language.
      2. Translate the transcription into ${targetLanguage}.
      3. Generate a short, descriptive title (max 5-7 words) for the content.
      
      Return the output in JSON format with three keys: "originalText", "translatedText", and "title".
      If there is no speech, provide a description of the sound in the "originalText" field and translate that description.
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
            originalText: { type: Type.STRING },
            translatedText: { type: Type.STRING },
            title: { type: Type.STRING },
          },
          required: ["originalText", "translatedText", "title"],
        },
      },
    });

    if (!response.text) {
      throw new Error("No response text generated");
    }

    const result = JSON.parse(response.text);

    return {
      originalText: result.originalText,
      translatedText: result.translatedText,
      language: targetLanguage,
      title: result.title,
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
      1. Transcribe the spoken audio verbatim in its original language.
      2. Translate the transcription into ${targetLanguage}.
      3. Generate a short, descriptive title (max 5-7 words) for the content.
      
      Return the output in JSON format with three keys: "originalText", "translatedText", and "title".
      If there is no speech, provide a description of the sound in the "originalText" field and translate that description.
    `;

    // Use fileData instead of inlineData for better memory management
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            fileData: {
              mimeType: mimeType,
              fileUri: file instanceof File ? URL.createObjectURL(file) : '',
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
            originalText: { type: Type.STRING },
            translatedText: { type: Type.STRING },
            title: { type: Type.STRING },
          },
          required: ["originalText", "translatedText", "title"],
        },
      },
    });

    if (!response.text) {
      throw new Error("No response text generated");
    }

    const result = JSON.parse(response.text);

    return {
      originalText: result.originalText,
      translatedText: result.translatedText,
      language: targetLanguage,
      title: result.title,
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
    // Try to parse error json if possible
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
    
    // Process full lines
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
              onProgress(100, msg.message); // Usually "Processing with Gemini..."
            }
            break;
            
          case 'result':
            finalResult = {
              ...msg.data,
              language: targetLanguage
            };
            break;
            
          case 'error':
            throw new Error(msg.data?.message || 'Unknown server error');
        }
      } catch (e) {
        console.warn('Failed to parse stream message:', line, e);
        // If it was our own error throw, rethrow it
        if ((e as Error).message !== 'Unexpected token' && (e as Error).message !== 'Unexpected end of JSON input') {
             throw e;
        }
      }
    }
  }

  if (!finalResult) {
    throw new Error('Stream ended without a result');
  }

  return finalResult;
};