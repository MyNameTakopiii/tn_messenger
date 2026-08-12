// src/js/forgot_password.js
import feather from 'feather-icons';
import { postData, SCRIPT_URL_ORDER } from '../config/api.js';
import '../utils/pwa-install.js';

// Initialize feather icons
feather.replace();

window.togglePassword = function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
    feather.replace();
  }
};

window.handleResetPassword = async function handleResetPassword(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button');
  const messageDiv = document.getElementById("resetMessage");
  
  const emailInput = document.getElementById('email');
  const newPasswordInput = document.getElementById('newPassword');
  const confirmPasswordInput = document.getElementById('confirmPassword');

  const email = emailInput.value.trim();
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (newPassword !== confirmPassword) {
    messageDiv.textContent = "❌ รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน";
    messageDiv.className = "message-error";
    return;
  }

  if (newPassword.length < 6) {
    messageDiv.textContent = "❌ รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร";
    messageDiv.className = "message-error";
    return;
  }

  // แสดงสถานะกำลังโหลด
  submitBtn.disabled = true;
  const originalBtnContent = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i data-feather="loader" class="spin"></i> กำลังบันทึก...';
  feather.replace();

  const data = {
    email: email,
    newPassword: newPassword
  };

  try {
    const resultData = await postData(SCRIPT_URL_ORDER, "reset_password_employee", data);
    console.log("RESET PASSWORD RESPONSE:", resultData);

    if (resultData.result === "error") {
      throw new Error(resultData.message || "เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน");
    }

    messageDiv.textContent = "✅ " + (resultData.message || "เปลี่ยนรหัสผ่านสำเร็จ!");
    messageDiv.className = "message-success";
    
    // ไปหน้า Login
    setTimeout(() => {
      window.location.href = '/employee/login_employee.html';
    }, 1500);

  } catch (error) {
    console.error("RESET PASSWORD ERROR:", error);
    messageDiv.textContent = "❌ " + (error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    messageDiv.className = "message-error";
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnContent;
    feather.replace();
  }
};
