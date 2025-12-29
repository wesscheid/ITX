export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./fileWorker.js', import.meta.url));
    worker.postMessage({ file });
    worker.onmessage = (e) => {
      const { base64Data, error } = e.data;
      if (error) {
        reject(new Error(error));
      } else {
        resolve(base64Data);
      }
      worker.terminate();
    };
    worker.onerror = (error) => {
      reject(error);
      worker.terminate();
    };
  });
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