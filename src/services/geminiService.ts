import { GoogleGenAI, Type } from "@google/genai";
import { ProcessingResult } from "../types";

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
      
      Return the output in JSON format with two keys: "originalText" and "translatedText".
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
          },
          required: ["originalText", "translatedText"],
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
      
      Return the output in JSON format with two keys: "originalText" and "translatedText".
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
          },
          required: ["originalText", "translatedText"],
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
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};