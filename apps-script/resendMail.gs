function resendMail(orderNo) {
  const ORDER_NO = Number(orderNo);

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const values = sheet.getDataRange().getValues();

  const row = values.find((r, i) => i > 0 && Number(r[16]) === ORDER_NO);
  if (!row) throw new Error('ไม่พบใบสั่งงานเลขที่ ' + ORDER_NO);

  const data = {
    requester: row[3],
    requesterPhone: row[4],
    project: row[2],
    collectDate: row[1],
    customerName: row[5],
    customerPhone: row[6]
  };

  const email = row[15];
  if (!email) throw new Error('แถวนี้ไม่มี email');

  const paddedOrderNo = String(ORDER_NO).padStart(4, '0');
  const updateURL =
    'https://tn-messenger-olive.vercel.app/customer/tracking_2.html?order=' + paddedOrderNo;

  const subject = `📋 ขอบคุณที่กรอกข้อมูลใบสั่งงาน #${paddedOrderNo}`;
  const htmlBody = `
    <div style="font-family:Prompt,Arial,sans-serif;color:#111;line-height:1.7;">
      <h2 style="color:#1e3a8a;">TN Messenger Service</h2>
      <p>ขอบคุณที่กรอกข้อมูลใบสั่งงานเรียบร้อยแล้ว 🎉</p>
      <p>
        <b>เลขที่ใบสั่งงาน:</b> ${paddedOrderNo}<br>
        <b>ชื่อผู้สั่งงาน:</b> ${data.requester} (${data.requesterPhone})<br>
        <b>โครงการ:</b> ${data.project}<br>
        <b>วันที่เก็บเอกสาร:</b> ${data.collectDate}<br>
        <b>ลูกค้า:</b> ${data.customerName} (${data.customerPhone})
      </p>
      <p>
        <a href="${updateURL}" style="color:#1e40af;font-weight:600;">
          🔗 คลิกเพื่อติดตามสถานะงาน
        </a>
      </p>
    </div>
  `;

  MailApp.sendEmail({
    to: email,
    subject,
    htmlBody
  });
}

function resendMailFromManual() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName('manual_active');
  if (!sh) throw new Error('ไม่พบชีต manual_active');

  const orderNo = sh.getRange('A1').getValue();
  if (!orderNo) throw new Error('A1 ว่าง ไม่มีเลขที่ใบสั่งงาน');

  resendMail(orderNo);
}

