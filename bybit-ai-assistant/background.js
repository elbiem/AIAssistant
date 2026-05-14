// ─── Config ───────────────────────────────────────────────────────────────────
const SERVER_URL    = 'https://aiassistant-production-e83d.up.railway.app';
const ACCESS_KEY    = '6852';
const REFERRAL_LINK = 'https://partner.bybit.com/b/CRYPTONAFT';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_SCREEN') {
    handleAnalysis(message, sender)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'CHECK_ACCESS') {
    checkAccess(message.uid)
      .then(sendResponse)
      .catch(() => sendResponse({ authorized: false, error: 'server_unavailable' }));
    return true;
  }

  if (message.type === 'GET_CONFIG') {
    sendResponse({ referralLink: REFERRAL_LINK });
    return true;
  }
});

// ─── Access check ─────────────────────────────────────────────────────────────

async function checkAccess(uid) {
  if (!uid) return { authorized: false, error: 'no_uid' };

  // Если сервер ещё не настроен — пускаем всех (режим разработки)
  if (SERVER_URL.includes('YOUR-APP')) return { authorized: true, dev: true };

  try {
    const res = await fetch(
      `${SERVER_URL}/check?uid=${encodeURIComponent(uid)}&key=${encodeURIComponent(ACCESS_KEY)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return { authorized: false, error: 'server_error' };
    return await res.json();
  } catch {
    return { authorized: false, error: 'server_unavailable' };
  }
}

async function handleAnalysis({ uid, lang, context, userMessage, history, chartRect, dpr, mode }, sender) {
  // Capture and optionally crop screenshot
  let screenshotBase64 = null;
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format: 'jpeg',
      quality: 60
    });

    if (chartRect && chartRect.width > 100) {
      try {
        screenshotBase64 = await cropToChart(dataUrl, chartRect, dpr || 1);
      } catch (cropErr) {
        console.warn('Crop failed, using full screenshot:', cropErr.message);
        screenshotBase64 = dataUrl.split(',')[1];
      }
    } else {
      screenshotBase64 = dataUrl.split(',')[1];
    }
  } catch (e) {
    // Return error so user sees it instead of silent fail
    return { error: `Не удалось захватить скриншот: ${e.message}` };
  }

  // Proxy through our server — API key stays server-side
  const response = await fetch(`${SERVER_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, key: ACCESS_KEY, lang, mode, context, userMessage, history, screenshotBase64 })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${response.status}`);
  }

  return await response.json();
}

async function cropToChart(dataUrl, rect, dpr) {
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  const img = await createImageBitmap(blob);

  const sx = Math.max(0, Math.round(rect.x * dpr));
  const sy = Math.max(0, Math.round(rect.y * dpr));
  const sw = Math.min(Math.round(rect.width * dpr), img.width - sx);
  const sh = Math.min(Math.round(rect.height * dpr), img.height - sy);

  if (sw <= 0 || sh <= 0) throw new Error('Invalid crop dimensions');

  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const cropped = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  const buf = await cropped.arrayBuffer();

  // Safe base64 — no spread operator to avoid stack overflow on large buffers
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
