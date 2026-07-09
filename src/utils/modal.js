// src/utils/modal.js

/**
 * Shows a beautiful, animated custom confirmation modal.
 * @param {object} options
 * @param {string} options.title - Modal title
 * @param {string} options.message - Modal message
 * @param {string} options.confirmText - Label for confirm button
 * @param {string} options.cancelText - Label for cancel button
 * @param {function} options.onConfirm - Callback when user confirms
 */
export function showConfirmModal({ title, message, confirmText, cancelText, onConfirm }) {
  if (document.getElementById('custom-confirm-modal')) return;

  const backdrop = document.createElement('div');
  backdrop.id = 'custom-confirm-modal';
  backdrop.style.position = 'fixed';
  backdrop.style.top = '0';
  backdrop.style.left = '0';
  backdrop.style.width = '100vw';
  backdrop.style.height = '100vh';
  backdrop.style.backgroundColor = 'rgba(17, 24, 39, 0.6)';
  backdrop.style.backdropFilter = 'blur(6px)';
  backdrop.style.display = 'flex';
  backdrop.style.alignItems = 'center';
  backdrop.style.justifyContent = 'center';
  backdrop.style.zIndex = '99999';
  backdrop.style.opacity = '0';
  backdrop.style.transition = 'opacity 0.2s ease';

  const modal = document.createElement('div');
  modal.style.background = '#ffffff';
  modal.style.borderRadius = '16px';
  modal.style.padding = '24px';
  modal.style.width = '90%';
  modal.style.maxWidth = '380px';
  modal.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
  modal.style.transform = 'scale(0.95) translateY(10px)';
  modal.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
  modal.style.textAlign = 'center';

  const titleEl = document.createElement('h3');
  titleEl.textContent = title || 'ยืนยัน';
  titleEl.style.fontSize = '20px';
  titleEl.style.fontWeight = '600';
  titleEl.style.color = '#1f2937';
  titleEl.style.marginBottom = '10px';
  titleEl.style.fontFamily = '"Prompt", sans-serif';

  const msgEl = document.createElement('p');
  msgEl.textContent = message || '';
  msgEl.style.fontSize = '15px';
  msgEl.style.color = '#4b5563';
  msgEl.style.lineHeight = '1.5';
  msgEl.style.marginBottom = '24px';
  msgEl.style.fontFamily = '"Prompt", sans-serif';

  const btnContainer = document.createElement('div');
  btnContainer.style.display = 'flex';
  btnContainer.style.gap = '12px';
  btnContainer.style.justifyContent = 'center';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = cancelText || 'ยกเลิก';
  cancelBtn.style.flex = '1';
  cancelBtn.style.padding = '10px 16px';
  cancelBtn.style.borderRadius = '10px';
  cancelBtn.style.border = '1px solid #d1d5db';
  cancelBtn.style.background = '#f9fafb';
  cancelBtn.style.color = '#374151';
  cancelBtn.style.fontSize = '15px';
  cancelBtn.style.fontWeight = '600';
  cancelBtn.style.cursor = 'pointer';
  cancelBtn.style.fontFamily = '"Prompt", sans-serif';
  cancelBtn.style.transition = 'background-color 0.15s, border-color 0.15s';
  cancelBtn.onmouseenter = () => {
    cancelBtn.style.backgroundColor = '#f3f4f6';
    cancelBtn.style.borderColor = '#9ca3af';
  };
  cancelBtn.onmouseleave = () => {
    cancelBtn.style.backgroundColor = '#f9fafb';
    cancelBtn.style.borderColor = '#d1d5db';
  };

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = confirmText || 'ยืนยัน';
  confirmBtn.style.flex = '1';
  confirmBtn.style.padding = '10px 16px';
  confirmBtn.style.borderRadius = '10px';
  confirmBtn.style.border = 'none';
  confirmBtn.style.background = '#ef4444'; 
  confirmBtn.style.color = '#ffffff';
  confirmBtn.style.fontSize = '15px';
  confirmBtn.style.fontWeight = '600';
  confirmBtn.style.cursor = 'pointer';
  confirmBtn.style.fontFamily = '"Prompt", sans-serif';
  confirmBtn.style.transition = 'background-color 0.15s, transform 0.1s';
  confirmBtn.onmouseenter = () => confirmBtn.style.backgroundColor = '#dc2626';
  confirmBtn.onmouseleave = () => confirmBtn.style.backgroundColor = '#ef4444';
  confirmBtn.onmousedown = () => confirmBtn.style.transform = 'scale(0.97)';
  confirmBtn.onmouseup = () => confirmBtn.style.transform = 'scale(1)';

  const closeModal = () => {
    backdrop.style.opacity = '0';
    modal.style.transform = 'scale(0.95) translateY(10px)';
    setTimeout(() => {
      if (backdrop.parentNode) document.body.removeChild(backdrop);
    }, 200);
  };

  cancelBtn.onclick = closeModal;
  confirmBtn.onclick = () => {
    closeModal();
    if (typeof onConfirm === 'function') onConfirm();
  };

  // Close when clicking background
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeModal();
  };

  btnContainer.appendChild(cancelBtn);
  btnContainer.appendChild(confirmBtn);
  modal.appendChild(titleEl);
  modal.appendChild(msgEl);
  modal.appendChild(btnContainer);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Trigger animations
  setTimeout(() => {
    backdrop.style.opacity = '1';
    modal.style.transform = 'scale(1) translateY(0)';
  }, 10);
}
