/**
 * Helpers for drag-and-drop of local files and remote image URLs.
 */

export function extractImageUrlsFromDataTransfer(dt) {
  const urls = new Set();
  if (!dt) return [];

  try {
    const uriList = dt.getData('text/uri-list') || '';
    for (const line of uriList.split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#') && /^https?:\/\//i.test(t)) urls.add(t);
    }
  } catch {
    // ignore
  }

  try {
    const html = dt.getData('text/html') || '';
    const imgSrcs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
    for (const m of imgSrcs) {
      if (m[1] && /^https?:\/\//i.test(m[1])) urls.add(m[1]);
    }
  } catch {
    // ignore
  }

  try {
    const plain = (dt.getData('text/plain') || '').trim();
    if (/^https?:\/\//i.test(plain)) urls.add(plain);
  } catch {
    // ignore
  }

  return [...urls];
}

export function isImageFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name || '');
}

/**
 * Bind drag/drop + click-to-upload on a drop zone element.
 * @param {HTMLElement} zone
 * @param {{
 *   onFiles: (files: File[]) => void | Promise<void>,
 *   onUrls: (urls: string[]) => void | Promise<void>,
 *   fileInput?: HTMLInputElement | null,
 * }} handlers
 */
export function bindPhotoDropZone(zone, handlers) {
  if (!zone) return () => {};

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.add('is-dragover');
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    if (!zone.contains(e.relatedTarget)) {
      zone.classList.remove('is-dragover');
    }
  };
  const onDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('is-dragover');

    const files = [...(e.dataTransfer?.files || [])].filter(isImageFile);
    const urls = extractImageUrlsFromDataTransfer(e.dataTransfer);

    if (files.length) {
      await handlers.onFiles?.(files);
    }
    if (urls.length) {
      await handlers.onUrls?.(urls);
    }
  };

  zone.addEventListener('dragenter', onDragOver);
  zone.addEventListener('dragover', onDragOver);
  zone.addEventListener('dragleave', onDragLeave);
  zone.addEventListener('drop', onDrop);

  if (handlers.fileInput) {
    zone.addEventListener('click', (e) => {
      if (e.target.closest('button, a, input, label')) return;
      handlers.fileInput.click();
    });
  }

  return () => {
    zone.removeEventListener('dragenter', onDragOver);
    zone.removeEventListener('dragover', onDragOver);
    zone.removeEventListener('dragleave', onDragLeave);
    zone.removeEventListener('drop', onDrop);
  };
}
