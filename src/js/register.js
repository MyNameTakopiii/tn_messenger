// src/js/register.js
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
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

window.togglePasswordVisibility = function togglePasswordVisibility(fieldId) {
  const passwordField = document.getElementById(fieldId);
  if (!passwordField) return;

  const toggleIcon = passwordField.nextElementSibling;
  if (!toggleIcon) return;

  if (passwordField.type === 'password') {
    passwordField.type = 'text';
    toggleIcon.setAttribute('data-feather', 'eye');
  } else {
    passwordField.type = 'password';
    toggleIcon.setAttribute('data-feather', 'eye-off');
  }
  feather.replace();
};

function displayRegisterMessage(message, type = 'error') {
  const messageElement = document.getElementById('registerMessage');
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

window.handleRegister = async function handleRegister(event) {
  event.preventDefault();
  
  const msgEl = document.getElementById('registerMessage');
  if (msgEl) msgEl.textContent = '';

  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirmPassword');

  if (!emailInput || !passwordInput || !confirmPasswordInput) return;

  const emailVal = emailInput.value.trim();
  const passwordVal = passwordInput.value;
  const confirmPasswordVal = confirmPasswordInput.value;

  if (passwordVal !== confirmPasswordVal) {
    displayRegisterMessage('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน', 'error');
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, emailVal, passwordVal);
    displayRegisterMessage('ลงทะเบียนบัญชีใหม่สำเร็จ!', 'success');

    emailInput.value = '';
    passwordInput.value = '';
    confirmPasswordInput.value = '';
    
    // Redirect to dashboard after a delay
    setTimeout(() => {
      window.location.href = '/admin/dashboard.html';
    }, 1500);

  } catch (error) {
    const errorCode = error.code;
    let displayMessage = 'เกิดข้อผิดพลาดในการลงทะเบียน โปรดลองอีกครั้ง';

    if (errorCode === 'auth/email-already-in-use') {
      displayMessage = 'อีเมลนี้ถูกใช้ลงทะเบียนไปแล้ว';
    } else if (errorCode === 'auth/invalid-email') {
      displayMessage = 'รูปแบบอีเมลไม่ถูกต้อง';
    } else if (errorCode === 'auth/weak-password') {
      displayMessage = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
    } else {
      console.error("Register Error:", errorCode, error.message);
    }

    displayRegisterMessage(displayMessage, 'error');
  }
};
