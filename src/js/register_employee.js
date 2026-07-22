// src/js/register_employee.js
import feather from 'feather-icons';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { Thai } from 'flatpickr/dist/l10n/th.js';
import { postData, SCRIPT_URL_ORDER } from '../config/api.js';

// ตรวจสอบ Token ถ้ามีให้ไปหน้า Home ทันที
if (localStorage.getItem("tn_employee_token")) {
  window.location.href = '/employee/home.html';
}

// Initialize feather icons
feather.replace();

function formatISODateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

window.togglePassword = function togglePassword() {
  const input = document.getElementById('password');
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
    feather.replace();
  }
};

const birthDateInput = document.getElementById('birthDate');
const defaultDateStr = "1997-01-01";

if (birthDateInput) {
  // ตั้งค่าเริ่มต้นลงใน attribute ด้วย
  birthDateInput.setAttribute("data-iso-date", defaultDateStr);

  flatpickr(birthDateInput, {
    locale: Thai,
    dateFormat: "d/m/Y",
    defaultDate: defaultDateStr,
    onChange: (dates) => {
      if (dates.length) {
        const d = dates[0];
        birthDateInput.setAttribute(
          "data-iso-date",
          formatISODateLocal(d)
        );
      }
    }
  });
}

window.handleRegister = async function handleRegister(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button');
  const messageDiv = document.getElementById("registerMessage");
  
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const firstNameInput = document.getElementById('firstName');
  const lastNameInput = document.getElementById('lastName');
  const nicknameInput = document.getElementById('nickname');
  const phoneInput = document.getElementById('phone');
  const birthDateInput = document.getElementById('birthDate');
  
  // แสดงสถานะกำลังโหลด
  submitBtn.disabled = true;
  const originalBtnContent = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i data-feather="loader" class="spin"></i> กำลังส่งข้อมูล...';
  feather.replace();
  
  const data = {
    username: firstNameInput.value,
    email: emailInput.value,
    last_name: lastNameInput.value,
    nickname: nicknameInput.value,
    phone: phoneInput.value,
    password: passwordInput.value,
    birth_day: birthDateInput.getAttribute("data-iso-date")
  };

  try {
    const resultData = await postData(SCRIPT_URL_ORDER, "register_employee", data);
    console.log("REGISTER RESPONSE:", resultData);

    if (resultData.result === "error") {
      throw new Error(resultData.message || "เกิดข้อผิดพลาดจากระบบ");
    }

    messageDiv.textContent = "✅ ลงทะเบียนสำเร็จเรียบร้อย!";
    messageDiv.className = "message-success";
    
    // เคลียร์ฟอร์ม
    e.target.reset();
    birthDateInput.setAttribute("data-iso-date", defaultDateStr); // รีเซ็ตเป็นค่าเริ่มต้น
    
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    messageDiv.textContent = "❌ " + (error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    messageDiv.className = "message-error";
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnContent;
    feather.replace();
  }
};
