// Web Worker for file processing
self.onmessage = function(e) {
  const { file } = e.data;
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => {
    const result = reader.result;
    const base64Data = result.split(',')[1];
    self.postMessage({ base64Data });
  };
  reader.onerror = (error) => {
    self.postMessage({ error: error.message });
  };
};