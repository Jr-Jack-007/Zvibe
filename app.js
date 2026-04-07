import * as authModule from './modules/auth.js';
import * as profileModule from './modules/profile.js';
import * as discoverModule from './modules/discover.js';
import * as chatModule from './modules/chat.js';
import * as spacesModule from './modules/spaces.js';
import * as uiModule from './modules/ui.js';

// Transitional import: keeps existing app behavior while modules are introduced.
import './modules/legacy-app.js';

/* ===== ACCESSIBILITY ===== */
let modalFocusStack = [];

function trapFocus(modalElement) {
  if (!modalElement) return () => {};

  const focusableSelectors = [
    'button', 'input', 'textarea', 'select', 'a[href]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const focusableElements = Array.from(
    modalElement.querySelectorAll(focusableSelectors)
  ).filter(el => !el.hasAttribute('disabled'));

  if (focusableElements.length === 0) return () => {};

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  function handleKeyDown(event) {
    if (event.key !== 'Tab') return;

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  modalElement.addEventListener('keydown', handleKeyDown);
  firstElement.focus();

  return () => {
    modalElement.removeEventListener('keydown', handleKeyDown);
  };
}

function setupModalEscapeHandling() {
  const modals = [
    { id: 'report-modal', closeFunc: 'closeReport' },
    { id: 'report-confirm', closeFunc: () => document.getElementById('report-confirm').style.display = 'none' },
    { id: 'confirm-modal', closeFunc: 'closeConfirmModal' },
    { id: 'change-email-modal', closeFunc: 'closeChangeEmailModal' },
    { id: 'change-password-modal', closeFunc: 'closeChangePasswordModal' },
    { id: 'message-context-menu', closeFunc: () => document.getElementById('message-context-menu').style.display = 'none' }
  ];

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;

    for (const modal of modals) {
      const modalElement = document.getElementById(modal.id);
      if (!modalElement) continue;

      if (modalElement.style.display !== 'none') {
        event.preventDefault();
        
        if (typeof modal.closeFunc === 'string') {
          if (typeof window[modal.closeFunc] === 'function') {
            window[modal.closeFunc]();
          }
        } else if (typeof modal.closeFunc === 'function') {
          modal.closeFunc();
        }

        // Restore focus to the element that triggered the modal
        const triggerElement = modalFocusStack.pop();
        if (triggerElement && typeof triggerElement.focus === 'function') {
          triggerElement.focus();
        }

        break;
      }
    }
  });
}

function setupInterestTagAriaHandling() {
  const interestTags = document.querySelectorAll('.interest-tag');
  
  interestTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const isSelected = tag.classList.contains('selected');
      tag.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  // Expose modules for gradual migration and debugging.
  window.ZvibeModules = {
    auth: authModule,
    profile: profileModule,
    discover: discoverModule,
    chat: chatModule,
    spaces: spacesModule,
    ui: uiModule
  };

  // Setup accessibility features
  setupModalEscapeHandling();
  setupInterestTagAriaHandling();
  
  // Enhance modal opening to track focus for restoration
  const originalShowScreen = window.showScreen;
  window.showScreen = function(id, opts) {
    const modals = ['report-modal', 'confirm-modal', 'change-email-modal', 'change-password-modal'];
    if (modals.includes(id)) {
      modalFocusStack.push(document.activeElement);
      
      // Small delay to ensure modal is shown before focus management
      setTimeout(() => {
        const modal = document.getElementById(id);
        if (modal) {
          trapFocus(modal);
        }
      }, 0);
    }
    return originalShowScreen.call(this, id, opts);
  };
});
