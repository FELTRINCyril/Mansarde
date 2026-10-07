// Browser-only helpers (Blob, FileReader, URL, document). Exercised by the e2e tests.

/** Base64 content of a blob, WITHOUT the "data:...;base64," prefix. */
export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'));
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.readAsDataURL(b);
  });
}

export function base64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(fileName: string, text: string, mime = 'application/json'): void {
  downloadBlob(fileName, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function readFileAsText(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(f);
  });
}

/** Natural pixel size of an image blob; rejects with Error('Image illisible') if it cannot be decoded. */
export function imageSize(blob: Blob): Promise<{ widthPx: number; heightPx: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ widthPx: img.naturalWidth, heightPx: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible'));
    };
    img.src = url;
  });
}
