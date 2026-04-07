import { auth, db } from '../firebase-config.js';
import { collection, doc, getDoc, getDocs, increment, query, runTransaction, serverTimestamp, onSnapshot, addDoc, orderBy } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

let unsubscribeSpaceMessages = null;

export function renderSpaceCards(spaces = []) {
  const container = document.getElementById('spaces-list');
  if (!container) return;

  container.innerHTML = '';
  spaces.forEach(space => {
    const card = document.createElement('div');
    card.className = 'space-card';
    card.innerHTML = `
      <div class="space-icon">${space.emoji || '🌟'}</div>
      <div class="space-info">
        <div class="space-name">${String(space?.name || 'Untitled space')}</div>
        <div class="space-meta">${space.memberCount || 0} members</div>
      </div>
      <button class="space-join-btn" onclick="window.ZvibeModules.spaces.handleSpaceCardClick('${space.id}')">chat</button>
    `;
    container.appendChild(card);
  });
}

export async function loadSpaces() {
  const snapshot = await getDocs(query(collection(db, 'spaces')));
  return snapshot.docs.map(spaceDoc => ({
    id: spaceDoc.id,
    ...spaceDoc.data()
  }));
}

export async function joinSpace(spaceId) {
  const currentUser = auth.currentUser;
  if (!currentUser || !spaceId) throw new Error('missing space or user');

  const spaceRef = doc(db, 'spaces', spaceId);
  const memberRef = doc(db, 'spaces', spaceId, 'members', currentUser.uid);

  await runTransaction(db, async transaction => {
    const [spaceSnapshot, memberSnapshot] = await Promise.all([
      transaction.get(spaceRef),
      transaction.get(memberRef)
    ]);

    if (!spaceSnapshot.exists()) throw new Error('space not found');
    if (memberSnapshot.exists()) return;

    transaction.set(memberRef, {
      userId: currentUser.uid,
      joinedAt: serverTimestamp()
    });

    transaction.update(spaceRef, {
      memberCount: increment(1)
    });
  });
}

export async function getSpaceDetails(spaceId) {
  if (!spaceId) return null;
  try {
    const spaceRef = doc(db, 'spaces', spaceId);
    const snapshot = await getDoc(spaceRef);
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  } catch (error) {
    console.error('Error fetching space details:', error);
    return null;
  }
}

export async function subscribeToSpaceMessages(spaceId, onMessages) {
  if (!spaceId) return null;

  if (unsubscribeSpaceMessages) {
    unsubscribeSpaceMessages();
    unsubscribeSpaceMessages = null;
  }

  const messagesQuery = query(
    collection(db, 'spaces', spaceId, 'messages'),
    orderBy('timestamp', 'asc')
  );

  unsubscribeSpaceMessages = onSnapshot(messagesQuery, snapshot => {
    if (typeof onMessages === 'function') {
      onMessages(snapshot);
    }
  });

  return unsubscribeSpaceMessages;
}

export async function sendSpaceMessage({ spaceId, text }) {
  const currentUser = auth.currentUser;
  if (!currentUser || !spaceId || !text) return;

  try {
    return await addDoc(collection(db, 'spaces', spaceId, 'messages'), {
      uid: currentUser.uid,
      name: currentUser.displayName || 'Anonymous',
      text: text.trim(),
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error sending space message:', error);
    throw error;
  }
}

export async function reportSpaceMessage({ spaceId, messageId, reason }) {
  const currentUser = auth.currentUser;
  if (!currentUser || !spaceId || !messageId) return;

  try {
    await addDoc(collection(db, 'reports'), {
      reportedBy: currentUser.uid,
      reportType: 'space_message',
      spaceId,
      messageId,
      reason: reason || 'inappropriate content',
      timestamp: serverTimestamp(),
      status: 'pending'
    });
  } catch (error) {
    console.error('Error reporting message:', error);
    throw error;
  }
}

export function stopSpaceMessageSubscription() {
  if (unsubscribeSpaceMessages) {
    unsubscribeSpaceMessages();
    unsubscribeSpaceMessages = null;
  }
}

export async function handleSpaceCardClick(spaceId) {
  try {
    const spaces = await loadSpaces();
    const space = spaces.find(s => s.id === spaceId);
    
    if (!space) {
      console.error('Space not found');
      return;
    }

    // Store space context globally for chat screen
    window.currentSpaceId = spaceId;
    window.currentSpaceContext = space;

    // Show space chat screen
    window.ZvibeModules.ui.showScreen('screen-space-chat');

    // Update header
    document.getElementById('space-chat-name').textContent = space.name || 'Untitled Space';
    document.getElementById('space-chat-emoji').textContent = space.emoji || '🌟';
    document.getElementById('space-chat-members').textContent = `${space.memberCount || 0} members`;

    // Clear messages and subscribe to new ones
    const messagesContainer = document.getElementById('space-chat-messages');
    messagesContainer.innerHTML = '<div class="msg-date">today</div>';

    // Subscribe to space messages
    await subscribeToSpaceMessages(spaceId, snapshot => {
      renderSpaceMessages(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })));
    });
  } catch (error) {
    console.error('Error opening space chat:', error);
    window.ZvibeModules.ui.showToast('Error opening space chat', 'error');
  }
}

export function renderSpaceMessages(messages = []) {
  const container = document.getElementById('space-chat-messages');
  if (!container) return;

  // Keep the date header
  const existingDate = container.querySelector('.msg-date');
  if (existingDate && container.children.length > 1) {
    // Clear all but the date header
    while (container.children.length > 1) {
      container.removeChild(container.lastChild);
    }
  } else {
    container.innerHTML = '<div class="msg-date">today</div>';
  }

  messages.forEach(msg => {
    const msgEl = document.createElement('div');
    msgEl.className = 'space-msg';
    msgEl.dataset.messageId = msg.id;
    msgEl.dataset.senderId = msg.uid;

    // Generate initials from name
    const initials = (msg.name || 'A')
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);

    // Format timestamp
    const timestamp = msg.timestamp?.toDate?.() || new Date();
    const timeStr = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    msgEl.innerHTML = `
      <div class="space-msg-header">
        <div class="space-msg-avatar">${initials}</div>
        <div class="space-msg-username">${msg.name || 'Anonymous'}</div>
        <div class="space-msg-time">${timeStr}</div>
      </div>
      <div class="space-msg-body">
        <div class="space-msg-text">${escapeHtml(msg.text)}</div>
      </div>
    `;

    // Add context menu trigger (long press / right-click)
    const msgText = msgEl.querySelector('.space-msg-text');
    msgText.addEventListener('contextmenu', e => {
      e.preventDefault();
      showMessageContextMenu(e, msg.id);
    });

    if ('ontouchstart' in window) {
      let touchTimer;
      msgText.addEventListener('touchstart', () => {
        touchTimer = setTimeout(() => {
          const touch = event.touches[0];
          const fakeEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            preventDefault: () => {}
          };
          showMessageContextMenu(fakeEvent, msg.id);
        }, 500);
      });

      msgText.addEventListener('touchend', () => {
        clearTimeout(touchTimer);
      });
    }

    container.appendChild(msgEl);
  });

  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function showMessageContextMenu(event, messageId) {
  const menu = document.getElementById('message-context-menu');
  if (!menu) return;

  menu.style.display = 'flex';
  menu.style.flexDirection = 'column';
  menu.style.position = 'fixed';
  menu.style.top = event.clientY + 'px';
  menu.style.left = event.clientX + 'px';

  // Store the message ID for reporting
  menu.dataset.messageId = messageId;

  // Close menu when clicking elsewhere
  const closeMenu = () => {
    menu.style.display = 'none';
    document.removeEventListener('click', closeMenu);
  };

  document.addEventListener('click', closeMenu);

  // Prevent double closure
  event.stopPropagation?.();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
