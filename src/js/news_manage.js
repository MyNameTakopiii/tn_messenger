// src/js/news_manage.js
import feather from 'feather-icons';
import { SCRIPT_URL_ORDER, postData } from '../config/api.js';
import { showConfirmModal } from '../utils/modal.js';

const SHEET_ID = "1IxrsUeatefuzXlCgKVHkYjyqg230KFxtYQHLEOmzVfo"; 
const SHEET_NAME = "ข่าวสาร"; 
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&cacheBust=${Date.now()}`; 

document.addEventListener("DOMContentLoaded", () => {
  feather.replace();
  loadNewsList();

  const form = document.getElementById('createNewsForm');
  if (form) {
    form.addEventListener('submit', handlePublishNews);
  }
});

async function loadNewsList() {
  const container = document.getElementById('activeNewsContainer');
  if (!container) return;

  container.innerHTML = '<div class="loading-message">กำลังโหลดรายการข่าวสาร...</div>';

  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) {
      throw new Error(`การดึงข้อมูล CSV ล้มเหลว (Status: ${response.status})`);
    }

    const csvText = await response.text();
    const sanitize = (val) => val ? val.trim().replace(/^"|"$/g, '') : '';
    const rows = csvText.trim().split('\n');

    if (rows.length <= 1) {
      container.innerHTML = '<p class="no-news-message">ยังไม่มีการเผยแพร่ข่าวสารในขณะนี้</p>';
      return;
    }

    const data = rows.slice(1).map(row => {
      // Split properly handling commas inside quotes
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current);

      if (result.length < 3) return null;
      return {
        title: sanitize(result[0]),
        date: sanitize(result[1]),
        detail: sanitize(result[2])
      };
    }).filter(item => item !== null);

    if (data.length === 0) {
      container.innerHTML = '<p class="no-news-message">ยังไม่มีข่าวสารในระบบ</p>';
      return;
    }

    const html = data.map(item => `
      <div class="news-list-card">
        <div class="news-list-header">
          <div class="news-list-title">${item.title}</div>
          <span class="news-list-date">เผยแพร่เมื่อ: ${item.date}</span>
        </div>
        <p class="news-list-detail">${item.detail}</p>
      </div>
    `).join('');

    container.innerHTML = html;
    feather.replace();

  } catch (error) {
    console.error("Error loading news:", error);
    container.innerHTML = `<div class="error-message-card" style="margin: 10px 0;">
      <strong>เกิดข้อผิดพลาดในการโหลดข่าวสาร:</strong> ${error.message}
    </div>`;
  }
}

async function handlePublishNews(e) {
  e.preventDefault();

  const titleInput = document.getElementById('newsTitle');
  const detailInput = document.getElementById('newsDetail');
  const btnPublish = document.getElementById('btnPublish');

  if (!titleInput || !detailInput) return;

  const title = titleInput.value.trim();
  const detail = detailInput.value.trim();

  if (!title || !detail) return;

  showConfirmModal({
    title: 'ยืนยันการเผยแพร่ข่าวสาร',
    message: 'ต้องการเผยแพร่ข่าวสารนี้ไปยังลูกค้าใช่หรือไม่?',
    confirmText: 'เผยแพร่',
    cancelText: 'ยกเลิก',
    onConfirm: async () => {
      try {
        if (btnPublish) {
          btnPublish.disabled = true;
          btnPublish.innerHTML = '<i data-feather="loader" class="spin"></i> กำลังเผยแพร่...';
          feather.replace();
        }

        const res = await postData(SCRIPT_URL_ORDER, 'insert_news', { title, detail });

        if (res && res.result === 'success') {
          titleInput.value = '';
          detailInput.value = '';
          
          showConfirmModal({
            title: 'สำเร็จ',
            message: 'เผยแพร่ข่าวสารไปยังหน้าแอปพลิเคชันลูกค้าเรียบร้อยแล้ว',
            confirmText: 'ตกลง',
            cancelText: 'ปิด',
            onConfirm: () => {}
          });

          // Refresh the news list
          loadNewsList();
        } else {
          throw new Error(res.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        }

      } catch (err) {
        console.error("Error publishing news:", err);
        showConfirmModal({
          title: 'ข้อผิดพลาด',
          message: `ไม่สามารถเผยแพร่ข่าวสารได้: ${err.message}`,
          confirmText: 'ตกลง',
          cancelText: 'ปิด',
          onConfirm: () => {}
        });
      } finally {
        if (btnPublish) {
          btnPublish.disabled = false;
          btnPublish.innerHTML = '<i data-feather="send"></i> เผยแพร่ข่าวสาร';
          feather.replace();
        }
      }
    }
  });
}
