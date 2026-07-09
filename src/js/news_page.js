// src/js/news_page.js
import feather from 'feather-icons';

const SHEET_ID = "1IxrsUeatefuzXlCgKVHkYjyqg230KFxtYQHLEOmzVfo"; 
const SHEET_NAME = "ข่าวสาร"; 
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&cacheBust=${Date.now()}`; 

feather.replace();

document.addEventListener("DOMContentLoaded", () => {
  loadNewsData();
});

async function loadNewsData() {
  const contentContainer = document.getElementById('newsContent');
  if (!contentContainer) return;

  contentContainer.innerHTML = '<div class="loading-message">กำลังโหลดข้อมูลล่าสุด...</div>';

  try {
    const response = await fetch(CSV_URL);

    if (!response.ok) {
      throw new Error(`การดึงข้อมูล CSV ล้มเหลว (Status: ${response.status}). ตรวจสอบสิทธิ์การเข้าถึง Sheet`);
    }

    const csvText = await response.text();
    const sanitize = (val) => val ? val.trim().replace(/^"|"$/g, '') : '';
    const rows = csvText.trim().split('\n');

    if (rows.length <= 1) {
      contentContainer.innerHTML = '<p class="loading-message">ไม่พบข่าวสารในขณะนี้.</p>';
      return;
    }

    const data = rows.slice(1).map(row => {
      const cols = row.split(',');
      if (cols.length < 3) return null;
      return {
        title: sanitize(cols[0]),
        date: sanitize(cols[1]),
        detail: sanitize(cols[2])
      };
    }).filter(item => item !== null);

    if (data.length === 0) {
      contentContainer.innerHTML = '<p class="loading-message">ไม่พบข่าวสารที่ถูกต้อง.</p>';
      return;
    }

    const newsItems = data.map(item => {
      const title = item.title || 'ไม่มีหัวข้อ';
      const date = item.date || 'ไม่ระบุวันที่';
      const detail = item.detail || 'ไม่มีรายละเอียด';

      return `
        <div class="news-item">
          <div class="news-title">${title}</div>
          <span class="news-date">เผยแพร่: ${date}</span>
          <p class="news-detail">${detail}</p>
        </div>
      `;
    });

    contentContainer.innerHTML = newsItems.join('');
    feather.replace();

  } catch (error) {
    console.error("Error loading news data:", error);
    contentContainer.innerHTML = `
      <div class="error-message">
        <strong>ข้อผิดพลาด!</strong> ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบ ID Google Sheet (${SHEET_ID}) และการตั้งค่าการแชร์ (Public/Anyone with the link).
        <br>(${error.message})
      </div>`;
  }
}
