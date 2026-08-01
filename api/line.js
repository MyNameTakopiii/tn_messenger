export default async function handler(req, res) {
  // Allow GET for simple browser verification
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'online', message: 'TN Messenger LINE Webhook Proxy is active 🟢' });
  }

  if (req.method === 'POST') {
    const scriptUrl = process.env.VITE_SCRIPT_URL_ORDER || 'https://script.google.com/macros/s/AKfycbwutGjM8fg__QRCBYBiDsCJ8ttkQ-97v8gER_C_W7VB4TG5-vvX5doUXlbGc5bvZYM5/exec?action=line';

    try {
      const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

      // 1. Send 200 OK to LINE immediately (< 50ms) to prevent LINE timeout (1000ms limit)
      res.status(200).json({ result: 'success' });

      // 2. Await GAS fetch after res.status(200) to keep Node event loop alive until GAS finishes
      const gasRes = await fetch(scriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-signature': req.headers['x-line-signature'] || req.headers['X-Line-Signature'] || ''
        },
        body: payload
      });

      const gasText = await gasRes.text();
      console.log('GAS Forward Response:', gasText);
      return;
    } catch (err) {
      console.error('LINE Proxy Error:', err);
      return;
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
