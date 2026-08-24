const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '7E7yx2m+fhOupAMs3UQq/O0J4KVRTIOtbTxCqBw9EfX8laF6a7y06kJjAbXizRBB/qEHnfdzMuXibssLIRRYCeNwD9A7RYxHRYD2+ig+7mHx8PVq5+2NCPRrYIGyWUXEWtY6+iA9NjKn4GZYc5rfsAdB04t89/1O/w1cDnyilFU=';

const GAS_URLS = [
  process.env.VITE_SCRIPT_URL_ORDER || 'https://script.google.com/macros/s/AKfycbzfZ4-krmya1XPtNjmwFRKjrwP2g0fyPBzHORIvAFGqfA_50yjWDvb_ycSkqzCstVuI/exec',
  'https://script.google.com/macros/s/AKfycbzfZ4-krmya1XPtNjmwFRKjrwP2g0fyPBzHORIvAFGqfA_50yjWDvb_ycSkqzCstVuI/exec'
];

const WELCOME_GUIDE_TEXT = 
  'สวัสดีค่ะ ยินดีต้อนรับสู่บริการ TN Messenger 🎉\n\n' +
  'กรุณาพิมพ์ เลขที่ใบสั่งงาน เพื่อตรวจสอบสถานะค่ะ\n' +
  '(ตัวอย่าง: 0001 หรือ 25)';

function normalizeJobCode(code) {
  if (!code) return '';
  const cleaned = String(code).replace('#', '').trim();
  const num = parseInt(cleaned, 10);
  if (!isNaN(num)) {
    return String(num);
  }
  return '';
}

async function sendLineReply(replyToken, text) {
  if (!replyToken) return;
  const url = 'https://api.line.me/v2/bot/message/reply';
  const token = (process.env.LINE_CHANNEL_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN).trim();
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: [{ type: 'text', text: text }]
      })
    });
    const body = await res.text();
    console.log('[LINE Bot] Reply HTTP Status:', res.status, 'Response:', body);
  } catch (err) {
    console.error('[LINE Bot] Reply Error:', err);
  }
}

async function fetchTaskFromGAS(normalizedCode) {
  for (const baseUrl of GAS_URLS) {
    // Method 1: Try get_task_by_id
    try {
      const res = await fetch(`${baseUrl}?action=get_task_by_id&data=${encodeURIComponent(JSON.stringify({ orderNo: normalizedCode }))}`);
      const data = await res.json();
      if (data.result === 'success' && data.data) {
        return data.data;
      }
    } catch (e) {
      console.warn(`[LINE Bot] get_task_by_id failed on ${baseUrl}`);
    }

    // Method 2: Fallback to get_all_row_json
    try {
      const res = await fetch(`${baseUrl}?action=get_all_row_json`);
      const data = await res.json();
      if (data.result === 'success' && Array.isArray(data.data)) {
        const found = data.data.find(row => {
          const rowNo = String(row['เลขที่ใบสั่งงาน'] || '').trim();
          return normalizeJobCode(rowNo) === normalizedCode;
        });
        if (found) return found;
      }
    } catch (e) {
      console.warn(`[LINE Bot] get_all_row_json failed on ${baseUrl}`);
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'online', message: 'TN Messenger LINE Webhook Standalone Engine is active 🟢' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const events = payload.events || [];

    console.log('[LINE Webhook Event Received]', events.length, 'events');

    for (const event of events) {
      const replyToken = event.replyToken;

      // Case 1: When user adds bot as a friend (follow event)
      if (event.type === 'follow') {
        console.log('[LINE Event]: Follow event received');
        await sendLineReply(replyToken, WELCOME_GUIDE_TEXT);
        continue;
      }

      // Case 2: When user sends a non-text message (sticker, image, video, file, location, etc.)
      if (event.type === 'message' && event.message && event.message.type !== 'text') {
        console.log('[LINE Event]: Non-text message type received:', event.message.type);
        await sendLineReply(replyToken, WELCOME_GUIDE_TEXT);
        continue;
      }

      // Case 3: Text message
      if (event.type === 'message' && event.message && event.message.type === 'text') {
        const inputText = (event.message.text || '').trim();
        console.log('[LINE User Input]:', inputText);

        const normalized = normalizeJobCode(inputText);

        // Case 3a: Text is NOT a job number (e.g. "สวัสดี", "ขอบคุณ", "กกก", "test")
        if (!normalized) {
          await sendLineReply(replyToken, WELCOME_GUIDE_TEXT);
          continue;
        }

        // Case 3b: Text IS a valid job number (e.g. "9960", "0001", "18", "25")
        const matchedJob = await fetchTaskFromGAS(normalized);

        if (!matchedJob) {
          await sendLineReply(replyToken,
            `❌ ไม่พบเลขที่ใบสั่งงาน ${inputText}\n\nกรุณาตรวจสอบเลขที่ใบสั่งงานและลองพิมพ์ใหม่อีกครั้งค่ะ`
          );
          continue;
        }

        // Format job status message
        const orderNoStr = String(matchedJob['เลขที่ใบสั่งงาน'] || '').trim().padStart(4, '0');
        const customer = String(matchedJob['ลูกค้า'] || '').trim();
        const project = String(matchedJob['โครงการ'] || '').trim();

        // Check latest run status
        let latestStatus = 'รอดำเนินการ';
        let latestDate = '';
        let latestNote = '';

        for (let runNum = 3; runNum >= 1; runNum--) {
          const status = String(matchedJob[`ผลการวิ่งงาน ${runNum}: สถานะ`] || '').trim();
          if (status) {
            latestStatus = status;
            latestDate = String(matchedJob[`ผลการวิ่งงาน ${runNum}: วันเวลา`] || '').trim();
            latestNote = String(matchedJob[`ผลการวิ่งงาน ${runNum}: หมายเหตุ`] || '').trim();
            break;
          }
        }

        const messenger = String(matchedJob['ชื่อพนักงาน'] || '').trim();

        let replyText = `📦 ใบสั่งงาน #${orderNoStr}\n`;
        if (customer) replyText += `ลูกค้า: ${customer}\n`;
        if (project) replyText += `โครงการ: ${project}\n`;
        replyText += `\n📋 สถานะล่าสุด: ${latestStatus}\n`;
        if (latestDate) replyText += `📅 วันที่: ${latestDate}\n`;
        if (latestNote) replyText += `📝 หมายเหตุ: ${latestNote}\n`;
        replyText += messenger ? `\n👤 พนักงานจัดส่ง: ${messenger}\n` : `\n👤 พนักงานจัดส่ง: ยังไม่ได้มอบหมาย\n`;
        replyText += `\n🔗 ติดตามสถานะ: https://tn-messenger-olive.vercel.app/customer/tracking_2.html?order=${orderNoStr}`;

        await sendLineReply(replyToken, replyText);
      }
    }

    return res.status(200).json({ result: 'success' });
  } catch (err) {
    console.error('[LINE Proxy Root Exception]:', err);
    return res.status(200).json({ result: 'success' });
  }
}
