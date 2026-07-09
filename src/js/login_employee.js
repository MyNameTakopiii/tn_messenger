// src/js/login_employee.js
import feather from 'feather-icons';
import { postData, SCRIPT_URL_ORDER } from '../config/api.js';

// ตรวจสอบ Token ถ้ามีให้ไปหน้า Home ทันที
if (localStorage.getItem("tn_employee_token")) {
  window.location.href = '/employee/home.html';
}

// Initialize feather icons
feather.replace();

window.togglePassword = function togglePassword() {
  const input = document.getElementById('password');
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
    feather.replace();
  }
};

window.handleLogin = async function handleLogin(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button');
  const messageDiv = document.getElementById("loginMessage");
  
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');

  // แสดงสถานะกำลังโหลด
  submitBtn.disabled = true;
  const originalBtnContent = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i data-feather="loader" class="spin"></i> กำลังตรวจสอบ...';
  feather.replace();

  const data = {
    email: emailInput.value,
    password: passwordInput.value
  };

  try {
    const resultData = await postData(SCRIPT_URL_ORDER, "login_employee", data);
    console.log("LOGIN RESPONSE:", resultData);

    if (resultData.result === "error") {
      throw new Error(resultData.message || "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    // เก็บข้อมูลลง localStorage
    localStorage.setItem("tn_employee_user", JSON.stringify(resultData.user));
    localStorage.setItem("tn_employee_token", resultData.token);

    messageDiv.textContent = "✅ เข้าสู่ระบบสำเร็จ!";
    messageDiv.className = "message-success";
    
    // ไปหน้า Home
    setTimeout(() => {
        window.location.href = '/employee/home.html';
    }, 1500);

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    messageDiv.textContent = "❌ " + (error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    messageDiv.className = "message-error";
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnContent;
    feather.replace();
  }
};
