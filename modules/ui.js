// UI module: shared screen and UX helpers.

export function setButtonLoading(btn, isLoading) {
  if (!btn) return;

  if (isLoading) {
    if (btn.dataset.loading === 'true') return;

    btn.dataset.loading = 'true';
    btn.dataset.originalHtml = btn.innerHTML;
    btn.dataset.wasDisabled = btn.disabled ? 'true' : 'false';
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');

    const loadingText = btn.dataset.loadingText || 'loading...';
    btn.innerHTML = `<span class="btn-loading-content"><span class="btn-spinner" aria-hidden="true"></span><span>${loadingText}</span></span>`;
    return;
  }

  if (btn.dataset.loading !== 'true') return;

  btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
  btn.disabled = btn.dataset.wasDisabled === 'true';
  btn.classList.remove('is-loading');
  btn.removeAttribute('aria-busy');
  btn.dataset.loading = 'false';
}

export function formatRelativeTime(timestampValue) {
  if (!timestampValue) return 'just now';

  let date;

  // Handle Firebase Timestamp objects with toMillis method
  if (typeof timestampValue?.toMillis === 'function') {
    date = new Date(timestampValue.toMillis());
  }
  // Handle Firebase Timestamp objects with toDate method
  else if (typeof timestampValue?.toDate === 'function') {
    date = timestampValue.toDate();
  }
  // Handle plain JS Date objects
  else if (timestampValue instanceof Date) {
    date = timestampValue;
  }
  // Handle timestamp numbers or string representations
  else {
    date = new Date(timestampValue);
  }

  // Validate date
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return 'just now';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Helper function to format time in 12-hour format with AM/PM
  function formatTime(dateObj) {
    const hours = dateObj.getHours();
    const minutes = dateObj.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    return `${hours12}:${minutesStr} ${ampm}`;
  }

  // Less than 1 minute: "just now"
  if (diffSeconds < 60) {
    return 'just now';
  }

  // 1–59 minutes: "5m ago"
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  // 1–23 hours: "3h ago"
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  // Yesterday: "Yesterday, 3:45 PM"
  if (diffDays === 1) {
    return `Yesterday, ${formatTime(date)}`;
  }

  // Earlier this week (2–6 days ago): "Mon, 3:45 PM"
  if (diffDays < 7) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = dayNames[date.getDay()];
    return `${dayName}, ${formatTime(date)}`;
  }

  // Older messages (7+ days ago): "12 Jan, 3:45 PM"
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const day = date.getDate();
  return `${day} ${month}, ${formatTime(date)}`;
}

function getToastStack() {
  let stack = document.getElementById('toast-stack');
  if (stack) return stack;

  stack = document.createElement('div');
  stack.id = 'toast-stack';
  stack.className = 'toast-stack';
  document.body.appendChild(stack);
  return stack;
}

export function showToast(message, type = 'success', duration = 3000) {
  const allowedTypes = new Set(['success', 'error', 'info']);
  const toastType = allowedTypes.has(type) ? type : 'success';
  const toast = document.createElement('div');
  toast.className = `toast toast--${toastType}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');

  const messageEl = document.createElement('div');
  messageEl.className = 'toast__message';
  messageEl.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast__close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'dismiss notification');
  closeBtn.textContent = '×';

  let dismissTimeoutId = null;
  const dismissToast = () => {
    if (!toast.isConnected || toast.dataset.removing === 'true') return;
    toast.dataset.removing = 'true';
    toast.classList.add('toast--removing');
    if (dismissTimeoutId) clearTimeout(dismissTimeoutId);
    window.setTimeout(() => toast.remove(), 220);
  };

  closeBtn.addEventListener('click', dismissToast);
  toast.append(messageEl, closeBtn);

  const stack = getToastStack();
  stack.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  dismissTimeoutId = window.setTimeout(dismissToast, Math.max(0, duration));

  return toast;
}

let confirmModalOnConfirm = null;

export function showConfirmModal(title, message, onConfirm = null) {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-modal-title');
  const messageEl = document.getElementById('confirm-modal-message');
  if (!modal || !titleEl || !messageEl) return;

  titleEl.textContent = title || 'confirm action';
  messageEl.textContent = message || 'are you sure?';
  confirmModalOnConfirm = typeof onConfirm === 'function' ? onConfirm : null;
  modal.style.display = 'flex';
}

export function closeConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;
  modal.style.display = 'none';
  confirmModalOnConfirm = null;
}

export function handleConfirmModalAction() {
  const onConfirm = confirmModalOnConfirm;
  closeConfirmModal();
  if (onConfirm) onConfirm();
}

export function showScreen(id) {
  if (typeof window.showScreen === 'function') {
    window.showScreen(id);
    return;
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

export function initializeSpaceChatEvents() {
  const spaceChatInput = document.getElementById('space-chat-input');
  const spaceChatSendBtn = document.getElementById('space-chat-send-btn');
  const reportMsgBtn = document.querySelector('.report-msg-btn');
  const cancelReportBtn = document.querySelector('.cancel-report');
  const spaceReportBtn = document.getElementById('space-report-btn');

  if (spaceChatSendBtn) {
    spaceChatSendBtn.addEventListener('click', async () => {
      const spaceId = window.currentSpaceId;
      const text = spaceChatInput?.value?.trim();

      if (!spaceId || !text) {
        if (!text) showToast('type a message', 'info');
        return;
      }

      try {
        setButtonLoading(spaceChatSendBtn, true);
        spaceChatInput.value = '';
        await window.ZvibeModules.spaces.sendSpaceMessage({ spaceId, text });
      } catch (error) {
        showToast('failed to send message', 'error');
        spaceChatInput.value = text;
      } finally {
        setButtonLoading(spaceChatSendBtn, false);
      }
    });
  }

  if (spaceChatInput) {
    spaceChatInput.addEventListener('keyup', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        spaceChatSendBtn?.click();
      }
    });
  }

  if (reportMsgBtn) {
    reportMsgBtn.addEventListener('click', async () => {
      const menu = document.getElementById('message-context-menu');
      const messageId = menu?.dataset?.messageId;
      const spaceId = window.currentSpaceId;

      if (!messageId || !spaceId) {
        showToast('error reporting message', 'error');
        return;
      }

      try {
        await window.ZvibeModules.spaces.reportSpaceMessage({
          spaceId,
          messageId,
          reason: 'user reported'
        });
        showToast('message reported', 'success');
        menu.style.display = 'none';
      } catch (error) {
        showToast('failed to report message', 'error');
      }
    });
  }

  if (cancelReportBtn) {
    cancelReportBtn.addEventListener('click', () => {
      const menu = document.getElementById('message-context-menu');
      menu.style.display = 'none';
    });
  }

  if (spaceReportBtn) {
    spaceReportBtn.addEventListener('click', () => {
      const space = window.currentSpaceContext;
      showToast(`report issue: ${space?.name || 'this space'}`, 'info');
      // Could expand to show modal for space reports
    });
  }
}
