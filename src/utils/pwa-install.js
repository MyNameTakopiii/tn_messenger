// src/utils/pwa-install.js
import '../styles/pwa-install.css';

let deferredPrompt = null;

export function initPWAInstall() {
  // Check if already running as standalone PWA
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) {
    console.log('App is running in PWA standalone mode.');
    return;
  }

  // Listen for beforeinstallprompt (Android / Chrome)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  // Check if iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  // Show banner after short delay if not dismissed recently
  if (!localStorage.getItem('pwa_banner_dismissed')) {
    setTimeout(() => {
      showInstallBanner(isIOS);
    }, 1500);
  }

  // Bind any manual install buttons on the page
  document.querySelectorAll('[data-pwa-install], .btn-pwa-install').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      triggerPWAInstall(isIOS);
    });
  });
}

function showInstallBanner(isIOS = false) {
  if (document.getElementById('pwa-install-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.className = 'pwa-install-banner';
  banner.innerHTML = `
    <div class="pwa-install-info">
      <div class="pwa-install-icon">
        <img src="/tn-icon.svg" width="30" height="30" alt="TN Logo" />
      </div>
      <div class="pwa-install-text">
        <span class="pwa-install-title">ติดตั้งแอป TN Messenger</span>
        <span class="pwa-install-sub">เพิ่มลงหน้าจอมือถือเพื่อใช้งานสะดวก</span>
      </div>
    </div>
    <button class="pwa-install-btn" id="pwa-banner-action-btn">📲 ติดตั้งแอป</button>
    <button class="pwa-close-btn" id="pwa-banner-close-btn">&times;</button>
  `;

  document.body.appendChild(banner);

  document.getElementById('pwa-banner-action-btn').addEventListener('click', () => {
    triggerPWAInstall(isIOS);
  });

  document.getElementById('pwa-banner-close-btn').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('pwa_banner_dismissed', '1');
  });
}

function triggerPWAInstall(isIOS = false) {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the PWA install prompt');
      }
      deferredPrompt = null;
      const banner = document.getElementById('pwa-install-banner');
      if (banner) banner.remove();
    });
  } else if (isIOS) {
    showIOSInstallModal();
  } else {
    // Chrome/Android fallback if beforeinstallprompt hasn't fired yet
    showGeneralInstallModal();
  }
}

function showIOSInstallModal() {
  if (document.getElementById('pwa-ios-modal')) return;

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'pwa-ios-modal';
  modalOverlay.className = 'pwa-ios-modal-overlay';
  modalOverlay.innerHTML = `
    <div class="pwa-ios-modal">
      <div class="pwa-ios-title">📲 ติดตั้ง TN Messenger บน iPhone</div>
      <div class="pwa-ios-subtitle">ทำเพียง 2 ขั้นตอนง่ายๆ เพื่อเพิ่มไอคอนแอปลงบนมือถือของคุณ</div>
      
      <div class="pwa-ios-step">
        <div class="pwa-ios-step-num">1</div>
        <div class="pwa-ios-step-text">กดปุ่ม <strong>แชร์ (Share) ⎋</strong> ที่แถบด้านล่างของ Safari</div>
      </div>

      <div class="pwa-ios-step">
        <div class="pwa-ios-step-num">2</div>
        <div class="pwa-ios-step-text">เลื่อนลงมาแล้วกดเลือก <strong>"เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen)</strong> แล้วกด "เพิ่ม"</div>
      </div>

      <button class="pwa-ios-close-btn" id="pwa-ios-close-btn">เข้าใจแล้ว</button>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  document.getElementById('pwa-ios-close-btn').addEventListener('click', () => {
    modalOverlay.remove();
  });
}

function showGeneralInstallModal() {
  alert('📲 วิธีติดตั้งเป็นแอปบนมือถือ:\n\n1. เปิดเมนูเบราว์เซอร์ (จุด 3 จุด หรือ ปุ่มแชร์)\n2. เลือก "เพิ่มลงในหน้าจอหลัก" หรือ "ติดตั้งแอป" (Add to Home Screen / Install App)');
}

// Auto init on DOMReady
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPWAInstall);
} else {
  initPWAInstall();
}
