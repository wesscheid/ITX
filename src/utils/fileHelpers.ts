export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:video/mp4;base64,")
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
  });
};

// New: Stream-based file processing for better memory management
export const createFileStream = (file: File): ReadableStream => {
  return file.stream();
};

// New: Chunked file processing for large files
export const processFileInChunks = async (
  file: File,
  chunkSize: number = 5 * 1024 * 1024, // 5MB chunks
  onProgress?: (progress: number) => void
): Promise<Uint8Array[]> => {
  const chunks: Uint8Array[] = [];
  const stream = file.stream();
  const reader = stream.getReader();
  let totalRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      totalRead += value.length;

      if (onProgress) {
        const progress = Math.min(100, Math.round((totalRead / file.size) * 100));
        onProgress(progress);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return chunks;
};

// New: Convert chunks to blob for API upload
export const chunksToBlob = (chunks: Uint8Array[], mimeType: string): Blob => {
  return new Blob(chunks as any, { type: mimeType });
};

// New: Memory-efficient file validation
export const validateFile = (file: File): { isValid: boolean; error?: string } => {
  if (!file) {
    return { isValid: false, error: 'No file provided' };
  }

  if (file.size > 50 * 1024 * 1024) {
    return { isValid: false, error: 'File size exceeds 50MB limit' };
  }

  if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
    return { isValid: false, error: 'Unsupported file type. Please upload video or audio files.' };
  }

  return { isValid: true };
};

export const downloadTextFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};