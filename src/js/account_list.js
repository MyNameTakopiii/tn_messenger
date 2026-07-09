// src/js/account_list.js
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';
import feather from 'feather-icons';

feather.replace();

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);

onAuthStateChanged(auth, (user) => {
  if (user) {
    loadCurrentUser(user);
  } else {
    console.warn("User not logged in. Redirecting to dashboard.");
    const loadingEl = document.getElementById('loading');
    const redirectEl = document.getElementById('redirectingMessage');
    
    if (loadingEl) loadingEl.style.display = 'none';
    if (redirectEl) redirectEl.style.display = 'block';
    
    setTimeout(() => {
      window.location.href = '/admin/dashboard.html';
    }, 1500);
  }
});

function loadCurrentUser(user) {
  const detailContainer = document.getElementById('accountDetails');
  const cardContainer = document.getElementById('accountCard');
  const loadingEl = document.getElementById('loading');
  const redirectEl = document.getElementById('redirectingMessage');

  if (!detailContainer || !cardContainer) return;

  const userName = user.displayName || (user.email ? user.email.split('@')[0] : 'ผู้ใช้');
  const registerTime = new Date(user.metadata.creationTime).toLocaleString('th-TH');

  let html = `
    <div class="detail-row">
      <span class="label">ชื่อผู้ใช้</span>
      <span class="value">${userName}</span>
    </div>
    <div class="detail-row">
      <span class="label">สถานะ</span>
      <span class="value status-active">เข้าสู่ระบบ</span>
    </div>
    <div class="detail-row">
      <span class="label">UID (User ID)</span>
      <span class="value">${user.uid}</span>
    </div>
    <div class="detail-row">
      <span class="label">อีเมล</span>
      <span class="value">${user.email || 'ไม่ระบุ'}</span>
    </div>
    <div class="detail-row">
      <span class="label">ลงทะเบียนเมื่อ</span>
      <span class="value">${registerTime}</span>
    </div>
  `;
  detailContainer.innerHTML = html;

  if (loadingEl) loadingEl.style.display = 'none';
  if (redirectEl) redirectEl.style.display = 'none';
  
  cardContainer.style.display = 'block';
  feather.replace();
}
