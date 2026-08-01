export const config = {
  supportsResponseStreaming: true,
};

export default async function handler(req, res) {
  // Allow GET for simple browser/LINE verification
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'online', message: 'TN Messenger LINE Webhook Proxy is active 🟢' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const GAS_URL = 'https://script.google.com/macros/s/AKfycbwutGjM8fg__QRCBYBiDsCJ8ttkQ-97v8gER_C_W7VB4TG5-vvX5doUXlbGc5bvZYM5/exec?action=line';

  const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const signature = req.headers['x-line-signature'] || req.headers['X-Line-Signature'] || '';

  console.log('[LINE Proxy] Received POST, payload length:', payload.length);
  console.log('[LINE Proxy] x-line-signature:', signature ? 'present' : 'missing');

  // Forward to Google Apps Script FIRST, THEN respond to LINE
  // This ensures GAS actually processes the request before Vercel kills the function
  try {
    const gasRes = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signature,
      },
      body: payload,
      redirect: 'follow',
    });

    const gasText = await gasRes.text();
    console.log('[LINE Proxy] GAS Response Status:', gasRes.status, 'Body:', gasText);
  } catch (err) {
    console.error('[LINE Proxy] GAS Forward Error:', err.message);
  }

  // Respond 200 OK to LINE after GAS has finished processing
  return res.status(200).json({ result: 'success' });
}
