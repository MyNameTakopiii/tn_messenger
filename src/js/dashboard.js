// src/js/dashboard.js
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';
import feather from 'feather-icons';

// Initialize feather icons
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);

// Helper functions for UI toggling
function showDashboard() {
  const loginOverlay = document.getElementById('loginOverlay');
  const dashboardWrapper = document.getElementById('dashboardWrapper');
  if (loginOverlay) loginOverlay.style.display = 'none';
  if (dashboardWrapper) dashboardWrapper.style.display = 'block';
}

function showLogin() {
  const loginOverlay = document.getElementById('loginOverlay');
  const dashboardWrapper = document.getElementById('dashboardWrapper');
  if (dashboardWrapper) dashboardWrapper.style.display = 'none';
  if (loginOverlay) loginOverlay.style.display = 'flex';
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    showDashboard();
  } else {
    showLogin();
  }
});

function displayLoginMessage(message, type = 'error') {
  const messageElement = document.getElementById('loginMessage');
  if (!messageElement) return;

  messageElement.textContent = message;
  messageElement.className = '';

  if (type === 'success') {
    messageElement.classList.add('message-success');
  } else {
    messageElement.classList.add('message-error');
  }

  setTimeout(() => {
    messageElement.textContent = '';
    messageElement.className = '';
  }, 5000);
}

window.handleLogin = async function handleLogin(event) {
  event.preventDefault();
  
  const msgEl = document.getElementById('loginMessage');
  if (msgEl) msgEl.textContent = '';

  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  if (!emailInput || !passwordInput) return;

  const emailValue = emailInput.value.trim();
  const passwordValue = passwordInput.value;

  try {
    await signInWithEmailAndPassword(auth, emailValue, passwordValue);
    showDashboard();
    console.log(`User logged in: ${emailValue}`);
  } catch (error) {
    const errorCode = error.code;
    let displayMessage = 'ชื่อผู้ใช้ (อีเมล) หรือรหัสผ่านไม่ถูกต้อง';

    if (errorCode === 'auth/wrong-password') {
      displayMessage = 'รหัสผ่านไม่ถูกต้อง';
    } else if (errorCode === 'auth/user-not-found' || errorCode === 'auth/invalid-email') {
      displayMessage = 'ไม่พบผู้ใช้ด้วยอีเมลนี้ หรืออีเมลไม่ถูกต้อง';
    } else if (errorCode === 'auth/missing-password') {
      displayMessage = 'กรุณาใส่รหัสผ่าน';
    }

    console.error("Login Error:", errorCode, error.message);
    displayLoginMessage(displayMessage, 'error');
  }
};

window.handleLogout = function handleLogout() {
  signOut(auth).then(() => {
    setTimeout(() => {
      displayLoginMessage('ออกจากระบบสำเร็จ', 'success');
    }, 50);

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
  }).catch((error) => {
    console.error("Logout Error:", error);
    displayLoginMessage('เกิดข้อผิดพลาดในการออกจากระบบ', 'error');
  });
};
