import { auth, db, storage, createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateEmail, updatePassword } from '../firebase-config.js';
import { addDoc, collection, collectionGroup, deleteDoc, doc, documentId, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, where, writeBatch } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';

// ===== Zvibe APP LOGIC =====
(function() {

const passwordShowIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
`;

const passwordHideIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 3l18 18" />
    <path d="M2.5 12s3.5-6 9.5-6c1 0 1.9.1 2.8.4M21.5 12s-3.5 6-9.5 6c-1 0-1.9-.1-2.8-.4" />
    <path d="M9.5 9.5a3 3 0 104.9 4.9" />
  </svg>
`;

function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input || !button) return;

  const isPasswordHidden = input.type === 'password';
  input.type = isPasswordHidden ? 'text' : 'password';
  button.innerHTML = isPasswordHidden ? passwordHideIcon : passwordShowIcon;
}

function setButtonLoading(btn, isLoading) {
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

function getToastStack() {
  let stack = document.getElementById('toast-stack');
  if (stack) return stack;

  stack = document.createElement('div');
  stack.id = 'toast-stack';
  stack.className = 'toast-stack';
  document.body.appendChild(stack);
  return stack;
}

function showToast(message, type = 'success', duration = 3000) {
  const allowedTypes = new Set(['success', 'error', 'info']);
  const toastType = allowedTypes.has(type) ? type : 'success';
  const toast = document.createElement('div');
  const toastStack = getToastStack();

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
    if (dismissTimeoutId) {
      clearTimeout(dismissTimeoutId);
      dismissTimeoutId = null;
    }
    window.setTimeout(() => {
      toast.remove();
    }, 220);
  };

  closeBtn.addEventListener('click', dismissToast);

  toast.append(messageEl, closeBtn);
  toastStack.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast--visible');
  });

  dismissTimeoutId = window.setTimeout(dismissToast, Math.max(0, duration));
  return toast;
}

function formatAuthError(errorCode) {
  switch (errorCode) {
    case 'auth/user-not-found':
      return 'no account found with this email';
    case 'auth/wrong-password':
      return 'incorrect password';
    case 'auth/too-many-requests':
      return 'too many attempts — please try again in a few minutes';
    case 'auth/invalid-email':
      return 'please enter a valid email address';
    default:
      return 'something went wrong';
  }
}

function setSignupFirebaseError(error) {
  const emailError = document.getElementById('error-email');
  const passError = document.getElementById('error-pass');
  if (!emailError || !passError) return;

  emailError.textContent = '';
  passError.textContent = '';

  const message = formatAuthError(error?.code);
  if (error?.code === 'auth/weak-password') {
    passError.textContent = error?.message || message;
  } else {
    emailError.textContent = message;
  }
}

let selectedIntent = '';
let selectedChatUserId = '';
let currentChatRoomId = '';
let unsubscribeChatMessages = null;
let unsubscribeTypingIndicators = null;
let currentUserProfileCache = null;
let pendingSignupCredentials = null;
let discoverLastVisibleUserDoc = null;
let discoverHasMoreUsers = true;
let discoverIsLoading = false;
let discoverQuerySeenExclusions = [];
let verificationResendCooldownEndsAt = 0;
let verificationCooldownTimerId = null;
let typingDebounceTimerId = null;
let currentChatPartnerName = '';
let currentChatBaseStatusText = '';

const DISCOVER_BATCH_SIZE = 50;
const DISCOVER_SEEN_USERS_KEY = 'zvibe-seen-user-ids';

const discoverAccentPalette = [
  { background: '#EEEDFE', color: '#534AB7', bar: '#7F77DD' },
  { background: '#E1F5EE', color: '#0F6E56', bar: '#1D9E75' },
  { background: '#FAECE7', color: '#993C1D', bar: '#D85A30' },
  { background: '#FAEEDA', color: '#854F0B', bar: '#BA7517' }
];

function stopChatListener() {
  if (unsubscribeChatMessages) {
    unsubscribeChatMessages();
    unsubscribeChatMessages = null;
  }

  if (unsubscribeTypingIndicators) {
    unsubscribeTypingIndicators();
    unsubscribeTypingIndicators = null;
  }

  if (typingDebounceTimerId) {
    clearTimeout(typingDebounceTimerId);
    typingDebounceTimerId = null;
  }

  if (auth.currentUser && currentChatRoomId) {
    deleteDoc(doc(db, 'chatRooms', currentChatRoomId, 'typing', auth.currentUser.uid)).catch(error => {
      if (error?.code !== 'not-found') {
        console.warn('failed to clear typing indicator', error);
      }
    });
  }
}

function buildChatRoomId(currentUserId, otherUserId) {
  return [currentUserId, otherUserId].sort().join('_');
}

function getTimestampMillis(timestampValue) {
  if (!timestampValue) return 0;

  if (typeof timestampValue.toMillis === 'function') {
    return timestampValue.toMillis();
  }

  if (typeof timestampValue.toDate === 'function') {
    return timestampValue.toDate().getTime();
  }

  const parsed = new Date(timestampValue).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function setChatNavStatus(text, isTyping = false) {
  const statusEl = document.querySelector('.chat-nav-status');
  if (!statusEl) return;

  if (!isTyping) {
    currentChatBaseStatusText = text;
    statusEl.textContent = text;
    return;
  }

  statusEl.innerHTML = '';
  const typingWrap = document.createElement('span');
  typingWrap.className = 'typing-indicator';

  const textEl = document.createElement('span');
  textEl.textContent = text;

  const dotsEl = document.createElement('span');
  dotsEl.className = 'typing-dots';

  const dotOne = document.createElement('span');
  dotOne.className = 'typing-dot';
  const dotTwo = document.createElement('span');
  dotTwo.className = 'typing-dot';
  const dotThree = document.createElement('span');
  dotThree.className = 'typing-dot';

  dotsEl.append(dotOne, dotTwo, dotThree);
  typingWrap.append(textEl, dotsEl);
  statusEl.appendChild(typingWrap);
}

async function markChatMessagesAsRead(roomId) {
  const currentUser = auth.currentUser;
  if (!currentUser || !roomId) return;

  try {
    const messagesSnapshot = await getDocs(collection(db, 'chatRooms', roomId, 'messages'));
    const unreadMessages = messagesSnapshot.docs.filter(messageDoc => {
      const messageData = messageDoc.data();
      return messageData.senderId !== currentUser.uid && messageData.status === 'sent';
    });

    if (!unreadMessages.length) return;

    const batch = writeBatch(db);
    unreadMessages.forEach(messageDoc => {
      batch.update(messageDoc.ref, { status: 'read' });
    });
    await batch.commit();
  } catch (error) {
    console.error('failed to mark messages as read', error);
  }
}

async function setTypingIndicator(isTyping) {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentChatRoomId) return;

  const typingRef = doc(db, 'chatRooms', currentChatRoomId, 'typing', currentUser.uid);

  if (isTyping) {
    await setDoc(typingRef, {
      [currentUser.uid]: true,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return;
  }

  await deleteDoc(typingRef).catch(error => {
    if (error?.code !== 'not-found') {
      console.warn('failed to clear typing indicator', error);
    }
  });
}

function scheduleTypingIndicatorClear() {
  if (typingDebounceTimerId) {
    clearTimeout(typingDebounceTimerId);
  }

  typingDebounceTimerId = setTimeout(() => {
    setTypingIndicator(false).finally(() => {
      typingDebounceTimerId = null;
      if (currentChatBaseStatusText) {
        setChatNavStatus(currentChatBaseStatusText);
      }
    });
  }, 2000);
}

function handleChatTyping() {
  const input = document.getElementById('chat-input');
  if (!input || !auth.currentUser || !currentChatRoomId) return;

  if (!input.value.trim()) {
    setTypingIndicator(false);
    if (typingDebounceTimerId) {
      clearTimeout(typingDebounceTimerId);
      typingDebounceTimerId = null;
    }
    if (currentChatBaseStatusText) {
      setChatNavStatus(currentChatBaseStatusText);
    }
    return;
  }

  setTypingIndicator(true).catch(error => {
    console.error('failed to set typing indicator', error);
  });
  scheduleTypingIndicatorClear();
}

function subscribeTypingIndicators() {
  if (!currentChatRoomId) return;

  const typingQuery = collection(db, 'chatRooms', currentChatRoomId, 'typing');
  unsubscribeTypingIndicators = onSnapshot(typingQuery, snapshot => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      if (currentChatBaseStatusText) setChatNavStatus(currentChatBaseStatusText);
      return;
    }

    const typingUser = snapshot.docs.find(docSnapshot => {
      if (docSnapshot.id === currentUser.uid) return false;
      const data = docSnapshot.data();
      return data?.[docSnapshot.id] === true;
    });

    if (typingUser) {
      const typingName = currentChatPartnerName || 'Someone';
      setChatNavStatus(`${typingName} is typing...`, true);
      return;
    }

    if (currentChatBaseStatusText) {
      setChatNavStatus(currentChatBaseStatusText);
    }
  });
}

function formatRelativeTime(timestampValue) {
  const millis = getTimestampMillis(timestampValue);
  if (!millis) return 'just now';

  const diffSeconds = Math.max(0, Math.floor((Date.now() - millis) / 1000));
  if (diffSeconds < 60) return 'just now';

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function sanitizeText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderConnectionsEmptyState(title, message, icon = '💬') {
  const chatList = document.querySelector('.chat-list');
  const emptyConnections = document.getElementById('empty-connections');
  if (!chatList || !emptyConnections) return;

  chatList.innerHTML = '';
  emptyConnections.style.display = 'block';
  emptyConnections.innerHTML = '';

  const iconEl = document.createElement('div');
  iconEl.style.fontSize = '36px';
  iconEl.style.lineHeight = '1';
  iconEl.style.marginBottom = '10px';
  iconEl.textContent = icon;

  const titleEl = document.createElement('h3');
  titleEl.style.fontSize = '20px';
  titleEl.style.marginBottom = '8px';
  titleEl.textContent = title;

  const messageEl = document.createElement('p');
  messageEl.style.fontSize = '14px';
  messageEl.style.color = 'var(--text-muted)';
  messageEl.style.marginBottom = '16px';
  messageEl.textContent = message;

  const buttonEl = document.createElement('button');
  buttonEl.className = 'btn-primary';
  buttonEl.type = 'button';
  buttonEl.textContent = 'start discovering';
  buttonEl.addEventListener('click', () => showScreen('screen-home'));

  emptyConnections.append(iconEl, titleEl, messageEl, buttonEl);
  chatList.appendChild(emptyConnections);
}

function renderConnectionsLoadingState() {
  renderConnectionsEmptyState(
    'loading your connections',
    'we\'re fetching your conversations',
    '⌛'
  );
}

function createConnectionChatItem(connection) {
  const item = document.createElement('div');
  item.className = 'chat-item';
  item.dataset.userId = connection.otherUserId;
  item.dataset.roomId = connection.roomId;

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.style.background = connection.accent.background;
  avatar.style.color = connection.accent.color;
  avatar.textContent = connection.initials;

  const meta = document.createElement('div');
  meta.className = 'chat-meta';

  const name = document.createElement('div');
  name.className = 'chat-name';
  name.textContent = connection.name;

  const status = document.createElement('span');
  status.className = connection.revealedAt ? 'new-badge' : 'reveal-timer';
  status.textContent = connection.revealedAt ? 'photo revealed' : 'identity hidden';
  name.appendChild(status);

  const preview = document.createElement('div');
  preview.className = 'chat-preview';
  preview.textContent = connection.lastMessage || 'start the conversation with a spark prompt ✨';

  meta.appendChild(name);
  meta.appendChild(preview);

  const time = document.createElement('div');
  time.className = 'chat-time';
  time.textContent = connection.lastMessageTime || 'just now';

  item.appendChild(avatar);
  item.appendChild(meta);
  item.appendChild(time);

  item.addEventListener('click', () => {
    showChat(connection.name, connection.initials, connection.accent.bar, connection.otherUserId);
  });

  return item;
}

function renderSpacesLoadingState() {
  const spacesList = document.getElementById('spaces-list');
  if (!spacesList) return;

  spacesList.innerHTML = `
    <div class="match-empty-state" id="spaces-empty-state">
      <div class="match-empty-icon">⌛</div>
      <h3>loading spaces</h3>
      <p>we’re finding groups that match your interests</p>
    </div>
  `;
}

function renderSpacesEmptyState(title, message) {
  const spacesList = document.getElementById('spaces-list');
  if (!spacesList) return;

  spacesList.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'match-empty-state';
  wrapper.id = 'spaces-empty-state';

  const iconEl = document.createElement('div');
  iconEl.className = 'match-empty-icon';
  iconEl.textContent = '🌐';

  const titleEl = document.createElement('h3');
  titleEl.textContent = title;

  const messageEl = document.createElement('p');
  messageEl.textContent = message;

  wrapper.append(iconEl, titleEl, messageEl);
  spacesList.appendChild(wrapper);
}

function createSpaceCard(spaceId, spaceData, isJoined, accentIndex) {
  const card = document.createElement('div');
  card.className = `space-card${isJoined ? ' joined' : ''}`;
  card.dataset.spaceId = spaceId;

  const accentPalette = [
    { background: '#EEEDFE', color: '#534AB7' },
    { background: '#E1F5EE', color: '#0F6E56' },
    { background: '#FAEEDA', color: '#854F0B' },
    { background: '#FAECE7', color: '#993C1D' }
  ];
  const accent = accentPalette[accentIndex % accentPalette.length];

  const tags = Array.isArray(spaceData.tags) ? spaceData.tags : [];
  const safeName = sanitizeText(spaceData.name || 'Untitled space');
  const safeMemberCount = sanitizeText(spaceData.memberCount || 0);
  const safeEmoji = sanitizeText(spaceData.emoji || '✨');
  const safeTags = tags.map(tag => `<span class="stag">${sanitizeText(tag)}</span>`).join('');

  card.innerHTML = `
    <div class="space-icon" style="background:${accent.background};color:${accent.color}">${safeEmoji}</div>
    <div class="space-info">
      <div class="space-name">${safeName}</div>
      <div class="space-meta">${safeMemberCount} members</div>
      <div class="space-tags">${safeTags}</div>
    </div>
    <button class="space-join-btn${isJoined ? ' joined-btn' : ''}" type="button">${isJoined ? 'chat' : 'join'}</button>
  `;

  const joinBtn = card.querySelector('.space-join-btn');
  if (joinBtn) {
    joinBtn.addEventListener('click', async () => {
      if (isJoined) {
        // Already joined, open chat
        await window.ZvibeModules?.spaces?.handleSpaceCardClick?.(spaceId);
      } else {
        // Not joined yet, join first
        await joinSpace(spaceId, joinBtn);
      }
    });
  }

  return card;
}

async function loadSpaces() {
  const currentUser = auth.currentUser;
  const spacesList = document.getElementById('spaces-list');
  if (!spacesList) return;

  if (!currentUser) {
    renderSpacesEmptyState(
      'sign in to explore spaces',
      'spaces work after you create an account'
    );
    return;
  }

  renderSpacesLoadingState();

  try {
    const spacesSnapshot = await getDocs(query(collection(db, 'spaces')));

    if (spacesSnapshot.empty) {
      renderSpacesEmptyState(
        'no spaces yet',
        'new groups will appear here once they are created'
      );
      return;
    }

    const joinedState = await Promise.all(spacesSnapshot.docs.map(async spaceDoc => {
      const memberDoc = await getDoc(doc(db, 'spaces', spaceDoc.id, 'members', currentUser.uid));
      return {
        spaceId: spaceDoc.id,
        spaceData: spaceDoc.data(),
        isJoined: memberDoc.exists()
      };
    }));

    spacesList.innerHTML = '';
    joinedState.forEach((space, index) => {
      spacesList.appendChild(createSpaceCard(space.spaceId, space.spaceData, space.isJoined, index));
    });
  } catch (error) {
    console.error('failed to load spaces', error);
    renderSpacesEmptyState(
      'could not load spaces',
      'check your connection and try again'
    );
  }
}

async function joinSpace(spaceId, buttonEl) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('you must be signed in to join a space');
  }

  if (!spaceId) {
    throw new Error('missing space id');
  }

  const spaceRef = doc(db, 'spaces', spaceId);
  const memberRef = doc(db, 'spaces', spaceId, 'members', currentUser.uid);

  await runTransaction(db, async transaction => {
    const [spaceSnapshot, memberSnapshot] = await Promise.all([
      transaction.get(spaceRef),
      transaction.get(memberRef)
    ]);

    if (!spaceSnapshot.exists()) {
      throw new Error('space not found');
    }

    if (memberSnapshot.exists()) {
      return;
    }

    transaction.set(memberRef, {
      userId: currentUser.uid,
      joinedAt: serverTimestamp()
    });

    transaction.update(spaceRef, {
      memberCount: increment(1)
    });
  });

  if (buttonEl) {
    buttonEl.textContent = 'joined ✓';
    buttonEl.classList.add('joined-btn');
    const card = buttonEl.closest('.space-card');
    if (card) card.classList.add('joined');
  }
}

async function loadConnectionsList() {
  const currentUser = auth.currentUser;
  const chatList = document.querySelector('.chat-list');
  const emptyConnections = document.getElementById('empty-connections');

  if (!chatList || !emptyConnections) return;

  if (!currentUser) {
    renderConnectionsEmptyState(
      'sign in to see connections',
      'connect with people after creating an account'
    );
    return;
  }

  renderConnectionsLoadingState();

  try {
    const connectionsQuery = query(
      collection(db, 'connections'),
      where('users', 'array-contains', currentUser.uid)
    );
    const connectionsSnapshot = await getDocs(connectionsQuery);

    if (connectionsSnapshot.empty) {
      renderConnectionsEmptyState(
        'no connections yet',
        'start discovering people and connect with those who share your interests'
      );
      return;
    }

    const connectionItems = await Promise.all(connectionsSnapshot.docs.map(async (connectionDoc, index) => {
      const connectionData = connectionDoc.data();
      const otherUserId = Array.isArray(connectionData.users)
        ? connectionData.users.find(userId => userId !== currentUser.uid)
        : '';

      if (!otherUserId) return null;

      const [userSnapshot, lastMessageSnapshot] = await Promise.all([
        getDoc(doc(db, 'users', otherUserId)),
        getDocs(query(
          collection(db, 'chatRooms', connectionDoc.id, 'messages'),
          orderBy('timestamp', 'desc'),
          limit(1)
        ))
      ]);

      const userData = userSnapshot.exists() ? userSnapshot.data() : {};
      const latestMessageDoc = lastMessageSnapshot.docs[0];
      const latestMessageData = latestMessageDoc ? latestMessageDoc.data() : null;

      return {
        roomId: connectionDoc.id,
        otherUserId,
        name: userData.name || 'Anonymous',
        initials: getProfileInitials(userData.name || 'Anonymous'),
        accent: discoverAccentPalette[index % discoverAccentPalette.length],
        lastMessage: latestMessageData?.text || 'start the conversation with a spark prompt ✨',
        lastMessageTime: formatRelativeTime(latestMessageData?.timestamp || connectionData.createdAt),
        lastActivityMs: getTimestampMillis(latestMessageData?.timestamp || connectionData.createdAt),
        revealedAt: connectionData.revealedAt || null
      };
    }));

    const visibleConnections = connectionItems
      .filter(Boolean)
      .sort((a, b) => {
        if (b.lastActivityMs !== a.lastActivityMs) return b.lastActivityMs - a.lastActivityMs;
        return a.name.localeCompare(b.name);
      });

    if (!visibleConnections.length) {
      renderConnectionsEmptyState(
        'no connections yet',
        'start discovering people and connect with those who share your interests'
      );
      return;
    }

    chatList.innerHTML = '';
    emptyConnections.style.display = 'none';
    visibleConnections.forEach(connection => {
      chatList.appendChild(createConnectionChatItem(connection));
    });
  } catch (error) {
    console.error('failed to load connections list', error);
    renderConnectionsEmptyState(
      'could not load connections',
      'check your connection and try again'
    );
  }
}

async function createConnection(otherUserId) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('you must be signed in to connect');
  }

  if (!otherUserId) {
    throw new Error('missing user to connect with');
  }

  const users = [currentUser.uid, otherUserId].sort();
  const roomId = buildChatRoomId(users[0], users[1]);
  const connectionRef = doc(db, 'connections', roomId);
  const existingConnection = await getDoc(connectionRef);

  if (!existingConnection.exists()) {
    await setDoc(connectionRef, {
      users,
      createdAt: serverTimestamp(),
      revealedAt: null,
      day1: serverTimestamp()
    });
  }

  return roomId;
}

function renderChatMessages(snapshot) {
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) return;

  messagesContainer.innerHTML = '';

  if (snapshot.empty) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'msg-date';
    emptyMessage.textContent = 'no messages yet';
    messagesContainer.appendChild(emptyMessage);
    return;
  }

  snapshot.forEach(docSnapshot => {
    const messageData = docSnapshot.data();
    const messageEl = document.createElement('div');
    const isSentByCurrentUser = auth.currentUser
      ? messageData.senderId === auth.currentUser.uid
      : false;
    const messageStatus = messageData.status || (isSentByCurrentUser ? 'sent' : '');

    messageEl.className = `msg ${isSentByCurrentUser ? 'sent' : 'received'}`;
    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.textContent = messageData.text || '';
    messageEl.appendChild(textEl);

    if (isSentByCurrentUser) {
      const statusEl = document.createElement('div');
      statusEl.className = 'msg-status';
      statusEl.textContent = messageStatus === 'read' ? '✓✓' : '✓';
      statusEl.setAttribute('aria-label', messageStatus === 'read' ? 'read' : 'sent');
      messageEl.appendChild(statusEl);
    }

    messagesContainer.appendChild(messageEl);
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getCurrentProfileValues() {
  const nameEl = document.getElementById('signup-name');
  const emailEl = document.getElementById('signup-email');
  const cityEl = document.getElementById('profile-city');
  const bioEl = document.getElementById('profile-bio');

  return {
    name: nameEl ? nameEl.value.trim() : '',
    email: auth.currentUser?.email || (emailEl ? emailEl.value.trim() : ''),
    city: cityEl ? cityEl.value.trim() : '',
    bio: bioEl ? bioEl.value.trim() : '',
    interests: [...selectedInterests],
    intent: selectedIntent
  };
}

function showProfileSaveError(message) {
  const errorEl = document.getElementById('profile-error');
  if (errorEl) {
    errorEl.textContent = message;
  }
}

function getProfileInitials(name) {
  const value = (name || '').trim();
  if (!value) return 'YO';

  return value
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

function renderMyProfile(profileData) {
  const avatarEl = document.getElementById('profile-avatar-big');
  const nameEl = document.getElementById('profile-big-name');
  const locationEl = document.getElementById('profile-location');
  const bioEl = document.getElementById('profile-bio-text');
  const tagsEl = document.getElementById('profile-tags');
  const intentEl = document.getElementById('profile-intent-display');

  if (!avatarEl || !nameEl || !locationEl || !bioEl || !tagsEl || !intentEl) return;

  const name = profileData?.name || 'Your profile';
  const city = profileData?.city || 'add your city';
  const bio = profileData?.bio || 'add a bio to tell people what you’re about.';
  const photoURL = profileData?.photoURL || '';
  const interests = Array.isArray(profileData?.interests) ? profileData.interests : [];
  const intent = profileData?.intent || 'add your intent';

  avatarEl.innerHTML = '';
  if (photoURL) {
    const imgEl = document.createElement('img');
    imgEl.src = photoURL;
    imgEl.alt = `${name} profile photo`;
    avatarEl.appendChild(imgEl);
    avatarEl.classList.add('has-photo');
  } else {
    avatarEl.textContent = getProfileInitials(name);
    avatarEl.classList.remove('has-photo');
  }

  nameEl.textContent = name;
  locationEl.textContent = `📍 ${city}`;
  bioEl.textContent = bio;
  tagsEl.innerHTML = '';

  if (interests.length === 0) {
    const emptyTag = document.createElement('span');
    emptyTag.className = 'ptag';
    emptyTag.textContent = 'no interests yet';
    tagsEl.appendChild(emptyTag);
  } else {
    interests.forEach(tag => {
      const tagEl = document.createElement('span');
      tagEl.className = 'ptag';
      tagEl.textContent = tag;
      tagsEl.appendChild(tagEl);
    });
  }

  intentEl.textContent = intent;
}

function normalizeInterestValue(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, character => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return character;
    }
  });
}

function calculateCompatibility(sharedCount, currentInterestCount, otherInterestCount) {
  const averageInterestCount = Math.max(1, (currentInterestCount + otherInterestCount) / 2);
  return Math.min(100, Math.max(0, Math.round((sharedCount / averageInterestCount) * 100)));
}

function createMatchCard(match, index) {
  const card = document.createElement('div');
  const accent = discoverAccentPalette[index % discoverAccentPalette.length];
  const sharedTags = match.sharedInterests.slice(0, 3);
  const escapedName = escapeHtml(match.name);
  const escapedCity = escapeHtml(match.city || '');
  const escapedBio = escapeHtml(match.bio || 'say hi and start the conversation.');
  const isRevealed = Boolean(match.isRevealed);
  const hasRevealedPhoto = Boolean(match.photoURL && isRevealed);
  const avatarClassName = !isRevealed
    ? 'match-avatar avatar-hidden'
    : (hasRevealedPhoto ? 'match-avatar avatar-revealed' : 'match-avatar avatar-fallback');
  const initialsMarkup = `<span class="avatar-initials">${escapeHtml(match.initials)}</span>`;

  card.className = 'match-card';
  card.dataset.userId = match.userId;
  card.dataset.name = match.name;
  card.dataset.initials = match.initials;
  card.dataset.color = accent.bar;

  card.innerHTML = `
    <div class="match-card-header">
      <div class="${avatarClassName}" style="background:${accent.background};color:${accent.color}" data-photo-url="${escapeHtml(match.photoURL || '')}">
        ${initialsMarkup}
        <span class="avatar-lock" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="10" width="14" height="9" rx="2"></rect>
            <path d="M8 10V7a4 4 0 018 0v3"></path>
          </svg>
        </span>
      </div>
      <div class="match-info">
        <div class="match-name">${escapedName}</div>
        <div class="match-location">📍 ${escapedCity || 'location not shared'}</div>
      </div>
      <div class="match-percent">
        <span class="match-num">${match.compatibility}%</span>
        <span class="match-label">compatible</span>
      </div>
    </div>
    <div class="match-tags">
      ${sharedTags.map(tag => `<span class="mtag">${escapeHtml(tag)}</span>`).join('')}
      ${match.sharedInterests.length > sharedTags.length ? `<span class="mtag">+${match.sharedInterests.length - sharedTags.length} more</span>` : ''}
    </div>
    <div class="match-bar-wrap">
      <div class="match-bar"><div class="match-bar-fill" style="width:${match.compatibility}%;background:${accent.bar}"></div></div>
    </div>
    <div class="match-spark">💡 "${escapedBio}"</div>
    <div class="match-actions">
      <button class="action-pass" type="button">✕ pass</button>
      <button class="action-connect" type="button" data-name="${escapedName}" data-initials="${match.initials}" data-color="${accent.bar}" data-user-id="${match.userId}">connect</button>
    </div>
  `;

  if (hasRevealedPhoto) {
    const avatarEl = card.querySelector('.match-avatar');
    const photoUrl = match.photoURL;
    if (avatarEl && photoUrl) {
      const photoEl = document.createElement('img');
      photoEl.className = 'avatar-photo';
      photoEl.alt = `${match.name} profile photo`;
      photoEl.src = photoUrl;
      photoEl.addEventListener('error', () => {
        avatarEl.classList.remove('avatar-revealed');
        avatarEl.classList.add('avatar-fallback');
        photoEl.remove();
      }, { once: true });
      avatarEl.prepend(photoEl);
    }
  }

  wireMatchCardInteractions(card);
  return card;
}

function wireMatchCardInteractions(card) {
  if (!card) return;

  const connectBtn = card.querySelector('.action-connect');
  const passBtn = card.querySelector('.action-pass');

  card.addEventListener('click', event => {
    if (event.target.closest('button')) return;
    showChat(card.dataset.name, card.dataset.initials, card.dataset.color, card.dataset.userId);
  });

  if (passBtn) {
    passBtn.addEventListener('click', event => {
      event.stopPropagation();
      removeMatchCard(card);
    });
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', async event => {
      event.stopPropagation();

      try {
        await createConnection(connectBtn.dataset.userId);
        showChat(connectBtn.dataset.name, connectBtn.dataset.initials, connectBtn.dataset.color, connectBtn.dataset.userId);
      } catch (error) {
        console.error('failed to create connection', error);
        return;
      }
    });
  }

  let startX = 0;
  let moveX = 0;
  let isDragging = false;

  const handleSwipeEnd = () => {
    card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

    if (moveX > 100) {
      card.style.transform = 'translateX(120%) rotate(20deg)';
      setTimeout(() => {
        card.remove();
        updateMatchEmptyState();
      }, 300);
    } else if (moveX < -100) {
      card.style.transform = 'translateX(-120%) rotate(-20deg)';
      setTimeout(() => {
        card.remove();
        updateMatchEmptyState();
      }, 300);
    } else {
      card.style.transform = 'translateX(0) rotate(0)';
    }

    startX = 0;
    moveX = 0;
    isDragging = false;
  };

  card.addEventListener('touchstart', event => {
    startX = event.touches[0].clientX;
    moveX = 0;
    isDragging = true;
    card.style.transition = 'none';
  }, { passive: true });

  card.addEventListener('touchmove', event => {
    if (!isDragging) return;
    moveX = event.touches[0].clientX - startX;
    card.style.transform = `translateX(${moveX}px) rotate(${moveX / 20}deg)`;
  }, { passive: true });

  card.addEventListener('touchend', handleSwipeEnd);

  card.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    isDragging = true;
    startX = event.clientX;
    moveX = 0;
    card.style.transition = 'none';
    event.preventDefault();
  });

  card.addEventListener('mousemove', event => {
    if (!isDragging) return;
    moveX = event.clientX - startX;
    card.style.transform = `translateX(${moveX}px) rotate(${moveX / 20}deg)`;
    event.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    handleSwipeEnd();
  });

  card.addEventListener('dragstart', event => {
    event.preventDefault();
  });
}

function renderDiscoverLoadingState() {
  renderDiscoverSkeletonState();
}

function renderDiscoverSkeletonState() {
  const matchCards = document.getElementById('discover-match-cards');
  if (!matchCards) return;

  matchCards.innerHTML = `
    <div class="match-card skeleton-card" aria-hidden="true">
      <div class="match-card-header">
        <div class="match-avatar skeleton-avatar"></div>
        <div class="match-info">
          <div class="skeleton-line skeleton-line-name"></div>
          <div class="skeleton-line skeleton-line-location"></div>
        </div>
        <div class="match-percent">
          <div class="skeleton-line skeleton-line-percent"></div>
          <div class="skeleton-line skeleton-line-label"></div>
        </div>
      </div>
      <div class="match-tags skeleton-tags">
        <span class="skeleton-pill"></span>
        <span class="skeleton-pill"></span>
        <span class="skeleton-pill skeleton-pill-wide"></span>
      </div>
      <div class="match-bar-wrap">
        <div class="match-bar"><div class="match-bar-fill skeleton-bar-fill"></div></div>
      </div>
      <div class="match-spark skeleton-spark">
        <div class="skeleton-line skeleton-line-spark"></div>
      </div>
      <div class="match-actions skeleton-actions">
        <div class="skeleton-button skeleton-button-pass"></div>
        <div class="skeleton-button skeleton-button-connect"></div>
      </div>
    </div>
    <div class="match-card skeleton-card" aria-hidden="true">
      <div class="match-card-header">
        <div class="match-avatar skeleton-avatar"></div>
        <div class="match-info">
          <div class="skeleton-line skeleton-line-name"></div>
          <div class="skeleton-line skeleton-line-location"></div>
        </div>
        <div class="match-percent">
          <div class="skeleton-line skeleton-line-percent"></div>
          <div class="skeleton-line skeleton-line-label"></div>
        </div>
      </div>
      <div class="match-tags skeleton-tags">
        <span class="skeleton-pill"></span>
        <span class="skeleton-pill"></span>
        <span class="skeleton-pill skeleton-pill-wide"></span>
      </div>
      <div class="match-bar-wrap">
        <div class="match-bar"><div class="match-bar-fill skeleton-bar-fill"></div></div>
      </div>
      <div class="match-spark skeleton-spark">
        <div class="skeleton-line skeleton-line-spark"></div>
      </div>
      <div class="match-actions skeleton-actions">
        <div class="skeleton-button skeleton-button-pass"></div>
        <div class="skeleton-button skeleton-button-connect"></div>
      </div>
    </div>
    <div class="match-card skeleton-card" aria-hidden="true">
      <div class="match-card-header">
        <div class="match-avatar skeleton-avatar"></div>
        <div class="match-info">
          <div class="skeleton-line skeleton-line-name"></div>
          <div class="skeleton-line skeleton-line-location"></div>
        </div>
        <div class="match-percent">
          <div class="skeleton-line skeleton-line-percent"></div>
          <div class="skeleton-line skeleton-line-label"></div>
        </div>
      </div>
      <div class="match-tags skeleton-tags">
        <span class="skeleton-pill"></span>
        <span class="skeleton-pill"></span>
        <span class="skeleton-pill skeleton-pill-wide"></span>
      </div>
      <div class="match-bar-wrap">
        <div class="match-bar"><div class="match-bar-fill skeleton-bar-fill"></div></div>
      </div>
      <div class="match-spark skeleton-spark">
        <div class="skeleton-line skeleton-line-spark"></div>
      </div>
      <div class="match-actions skeleton-actions">
        <div class="skeleton-button skeleton-button-pass"></div>
        <div class="skeleton-button skeleton-button-connect"></div>
      </div>
    </div>
  `;
}

function renderDiscoverEmptyState(title, message) {
  const matchCards = document.getElementById('discover-match-cards');
  if (!matchCards) return;

  matchCards.innerHTML = `
    <div class="match-empty-state" id="discover-empty-state">
      <div class="match-empty-icon">🎉</div>
      <h3>${title}</h3>
      <p>${message}</p>
      <button class="btn-primary" type="button" onclick="showScreen('screen-myprofile')">edit profile</button>
    </div>
  `;
}

function getSeenUserIds() {
  try {
    const raw = localStorage.getItem(DISCOVER_SEEN_USERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (error) {
    console.warn('failed to read seen users from localStorage', error);
    return [];
  }
}

function saveSeenUserIds(ids) {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
  localStorage.setItem(DISCOVER_SEEN_USERS_KEY, JSON.stringify(uniqueIds));
}

function markUsersAsSeen(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const existing = getSeenUserIds();
  saveSeenUserIds([...existing, ...userIds]);
}

function getDiscoverLoadMoreButton() {
  return document.getElementById('discover-load-more-btn');
}

function ensureDiscoverLoadMoreButton() {
  const matchCards = document.getElementById('discover-match-cards');
  if (!matchCards) return null;

  let wrapper = document.getElementById('discover-load-more-wrap');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'discover-load-more-wrap';
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.padding = '8px 0 18px';

    const button = document.createElement('button');
    button.id = 'discover-load-more-btn';
    button.type = 'button';
    button.className = 'btn-outline';
    button.textContent = 'load more';
    button.addEventListener('click', async () => {
      await loadDiscoverMatches({ append: true });
    });

    wrapper.appendChild(button);
    matchCards.appendChild(wrapper);
  }

  return wrapper.querySelector('#discover-load-more-btn');
}

function updateDiscoverLoadMoreState() {
  const button = ensureDiscoverLoadMoreButton();
  if (!button) return;

  if (!discoverHasMoreUsers) {
    button.style.display = 'none';
    return;
  }

  button.style.display = 'inline-block';
  button.disabled = discoverIsLoading;
  button.textContent = discoverIsLoading ? 'loading...' : 'load more';
}

function renderDiscoverMatches(matches, options = {}) {
  const matchCards = document.getElementById('discover-match-cards');
  if (!matchCards) return;

  const append = Boolean(options.append);
  const visibleMatches = matches.slice(0, append ? matches.length : 5);

  if (!append) {
    if (!visibleMatches.length) {
      renderDiscoverEmptyState(
        'no matches yet',
        'add more interests or check back later for people who share your vibe'
      );
      return;
    }

    matchCards.innerHTML = '';
  }

  if (!visibleMatches.length) {
    if (!discoverHasMoreUsers && !matchCards.querySelector('.match-card')) {
      renderDiscoverEmptyState(
        'no matches yet',
        'add more interests or check back later for people who share your vibe'
      );
    }
    updateDiscoverLoadMoreState();
    return;
  }

  const renderedUserIds = [];
  const existingCardCount = matchCards.querySelectorAll('.match-card').length;

  visibleMatches.forEach((match, index) => {
    renderedUserIds.push(match.userId);
    matchCards.appendChild(createMatchCard(match, existingCardCount + index));
  });

  markUsersAsSeen(renderedUserIds);
  updateDiscoverLoadMoreState();
  animateMatchBars();
}

async function loadDiscoverMatches(options = {}) {
  const append = Boolean(options.append);

  if (discoverIsLoading) {
    return;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    renderDiscoverEmptyState(
      'sign in to see matches',
      'discover works after you create an account and choose your interests'
    );
    return;
  }

  const currentProfile = currentUserProfileCache || await loadCurrentUserProfile();
  const currentInterests = Array.isArray(currentProfile?.interests) ? currentProfile.interests.map(normalizeInterestValue).filter(Boolean) : [];

  if (currentInterests.length < 2) {
    renderDiscoverEmptyState(
      'add a few interests first',
      'we need at least 2 interests to find compatible people'
    );
    return;
  }

  if (!append) {
    discoverLastVisibleUserDoc = null;
    discoverHasMoreUsers = true;
    discoverQuerySeenExclusions = getSeenUserIds().filter(userId => userId !== currentUser.uid).slice(0, 10);
    renderDiscoverLoadingState();
  }

  discoverIsLoading = true;
  updateDiscoverLoadMoreState();

  try {
    const connectionSnapshot = await getDocs(query(
      collection(db, 'connections'),
      where('users', 'array-contains', currentUser.uid)
    ));
    const connectionLookup = new Map();

    connectionSnapshot.forEach(connectionDoc => {
      const connectionData = connectionDoc.data();
      const otherUserId = Array.isArray(connectionData.users)
        ? connectionData.users.find(userId => userId !== currentUser.uid)
        : '';

      if (otherUserId) {
        connectionLookup.set(otherUserId, connectionData);
      }
    });

    const constraints = [];

    if (discoverQuerySeenExclusions.length > 0) {
      constraints.push(where(documentId(), 'not-in', discoverQuerySeenExclusions));
    }

    constraints.push(limit(DISCOVER_BATCH_SIZE));

    if (append && discoverLastVisibleUserDoc) {
      constraints.push(startAfter(discoverLastVisibleUserDoc));
    }

    const discoverQuery = query(collection(db, 'users'), ...constraints);
    const snapshot = await getDocs(discoverQuery);

    discoverHasMoreUsers = snapshot.size === DISCOVER_BATCH_SIZE;
    discoverLastVisibleUserDoc = snapshot.docs[snapshot.docs.length - 1] || discoverLastVisibleUserDoc;

    const matches = [];
    const seenUserIds = new Set(getSeenUserIds());

    snapshot.forEach(userDoc => {
      if (userDoc.id === currentUser.uid) return;
      if (seenUserIds.has(userDoc.id)) return;

      const userData = userDoc.data();
      const otherInterests = Array.isArray(userData.interests) ? userData.interests.map(normalizeInterestValue).filter(Boolean) : [];
      const sharedInterests = currentInterests.filter(interest => otherInterests.includes(interest));

      if (sharedInterests.length < 2) return;

      const connectionData = connectionLookup.get(userDoc.id) || null;
      const createdAtMillis = getTimestampMillis(connectionData?.createdAt);
      const isRevealed = Boolean(
        connectionData?.revealedAt ||
        (createdAtMillis && Date.now() - createdAtMillis >= 3 * 24 * 60 * 60 * 1000)
      );

      matches.push({
        userId: userDoc.id,
        name: userData.name || 'Anonymous',
        city: userData.city || '',
        bio: userData.bio || '',
        intent: userData.intent || '',
        photoURL: userData.photoURL || '',
        isRevealed,
        interests: otherInterests,
        sharedInterests,
        initials: getProfileInitials(userData.name || 'Anonymous'),
        compatibility: calculateCompatibility(sharedInterests.length, currentInterests.length, otherInterests.length)
      });
    });

    matches.sort((a, b) => {
      if (b.compatibility !== a.compatibility) return b.compatibility - a.compatibility;
      if (b.sharedInterests.length !== a.sharedInterests.length) return b.sharedInterests.length - a.sharedInterests.length;
      return a.name.localeCompare(b.name);
    });

    renderDiscoverMatches(matches, { append });
  } catch (error) {
    console.error('failed to load discover matches', error);
    if (!append) {
      renderDiscoverEmptyState(
        'could not load matches',
        'check your connection and try again'
      );
    }
  } finally {
    discoverIsLoading = false;
    updateDiscoverLoadMoreState();
  }
}

async function loadCurrentUserProfile() {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  try {
    const snapshot = await getDoc(doc(db, 'users', currentUser.uid));
    if (snapshot.exists()) {
      const profileData = snapshot.data();
      currentUserProfileCache = profileData;
      renderMyProfile(profileData);
      return profileData;
    }
  } catch (error) {
    console.error('failed to load profile', error);
  }

  return null;
}

async function loadEditProfileForm() {
  const cityEl = document.getElementById('edit-profile-city');
  const bioEl = document.getElementById('edit-profile-bio');
  const charCountEl = document.getElementById('edit-profile-char-count');
  const tags = document.querySelectorAll('#edit-profile-interest-grid .interest-tag');

  if (!cityEl || !bioEl || !charCountEl || tags.length === 0) return;

  const profileData = await loadCurrentUserProfile();
  if (!profileData) return;

  cityEl.value = profileData.city || '';
  bioEl.value = profileData.bio || '';
  charCountEl.textContent = `${bioEl.value.length} / 150`;
  charCountEl.style.color = bioEl.value.length > 130 ? '#BA7517' : '';

  const interests = Array.isArray(profileData.interests) ? profileData.interests : [];
  tags.forEach(tagBtn => {
    const tagValue = tagBtn.textContent.trim();
    tagBtn.classList.toggle('selected', interests.includes(tagValue));
  });
}

async function saveEditedProfile() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('you must be signed in to edit your profile');
  }

  const cityEl = document.getElementById('edit-profile-city');
  const bioEl = document.getElementById('edit-profile-bio');
  const selectedTags = document.querySelectorAll('#edit-profile-interest-grid .interest-tag.selected');

  if (!cityEl || !bioEl) {
    throw new Error('edit profile form is unavailable');
  }

  const city = cityEl.value.trim();
  const bio = bioEl.value.trim();
  const interests = Array.from(selectedTags).map(tag => tag.textContent.trim());

  if (!city) {
    throw new Error('please enter your city');
  }

  if (interests.length < 3) {
    throw new Error('please select at least 3 interests');
  }

  await setDoc(doc(db, 'users', currentUser.uid), {
    city,
    bio,
    interests,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function saveCurrentUserProfile() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('you must be signed in to save your profile');
  }

  const profile = getCurrentProfileValues();
  const photoInput = document.getElementById('photo-input');
  const photoFile = photoInput?.files?.[0] || null;
  const userRef = doc(db, 'users', currentUser.uid);
  const existingSnapshot = await getDoc(userRef);

  let photoURL = '';
  if (photoFile) {
    try {
      const avatarRef = ref(storage, `avatars/${currentUser.uid}.jpg`);
      await uploadBytes(avatarRef, photoFile, {
        contentType: photoFile.type || 'image/jpeg'
      });
      photoURL = await getDownloadURL(avatarRef);
    } catch (error) {
      photoURL = '';
      console.warn('photo upload failed, saving profile without photo url', error);
    }
  }

  const profilePayload = {
    name: profile.name,
    city: profile.city,
    bio: profile.bio,
    photoURL,
    interests: profile.interests,
    intent: profile.intent,
    updatedAt: serverTimestamp()
  };

  if (!existingSnapshot.exists()) {
    profilePayload.createdAt = serverTimestamp();
  }

  await setDoc(userRef, profilePayload, { merge: true });
  currentUserProfileCache = profilePayload;
}

// Validate signup form
async function validateSignup() {
  // Clear all error messages
  document.getElementById('error-name').textContent = '';
  document.getElementById('error-email').textContent = '';
  document.getElementById('error-pass').textContent = '';
  document.getElementById('error-dob').textContent = '';
  
  // Get form values
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-pass').value;
  const dob = document.getElementById('signup-dob').value;
  
  let isValid = true;
  
  // Validate name
  if (!name) {
    document.getElementById('error-name').textContent = 'please enter your name';
    isValid = false;
  }
  
  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    document.getElementById('error-email').textContent = 'please enter your email';
    isValid = false;
  } else if (!emailRegex.test(email)) {
    document.getElementById('error-email').textContent = 'please enter a valid email address';
    isValid = false;
  }
  
  // Validate password
  if (!pass) {
    document.getElementById('error-pass').textContent = 'please enter a password';
    isValid = false;
  } else if (pass.length < 8) {
    document.getElementById('error-pass').textContent = 'password must be at least 8 characters';
    isValid = false;
  }
  
  // Validate date of birth
  if (!dob) {
    document.getElementById('error-dob').textContent = 'please enter your date of birth';
    isValid = false;
  } else {
    const birthDate = new Date(dob);
    const today = new Date();
    const eighteenthBirthday = new Date(birthDate);
    eighteenthBirthday.setFullYear(eighteenthBirthday.getFullYear() + 18);

    if (today < eighteenthBirthday) {
      document.getElementById('error-dob').textContent = 'you must be at least 18 years old';
      isValid = false;
    }
  }
  
  // If all valid, store signup details in memory and continue onboarding
  if (isValid) {
    pendingSignupCredentials = {
      name,
      email,
      pass,
      dob
    };

    showScreen('screen-interests');
  }
}

// Show a screen by ID
let welcomeTimeoutId = null;

function startWelcomeFlow() {
  const progressFill = document.getElementById('welcome-progress-fill');
  if (!progressFill) return;

  if (welcomeTimeoutId) {
    clearTimeout(welcomeTimeoutId);
    welcomeTimeoutId = null;
  }

  progressFill.style.transition = 'none';
  progressFill.style.width = '0%';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      progressFill.style.transition = 'width 2.5s linear';
      progressFill.style.width = '100%';
    });
  });

  welcomeTimeoutId = setTimeout(() => {
    showScreen('screen-home');
  }, 2500);
}

function clearVerificationCooldownTimer() {
  if (verificationCooldownTimerId) {
    clearInterval(verificationCooldownTimerId);
    verificationCooldownTimerId = null;
  }
}

function getVerificationCooldownRemaining() {
  return Math.max(0, Math.ceil((verificationResendCooldownEndsAt - Date.now()) / 1000));
}

function updateVerificationCooldownUI() {
  const resendBtn = document.getElementById('verify-resend-btn');
  const resendHint = document.getElementById('verify-resend-hint');
  if (!resendBtn || !resendHint) return;

  const remaining = getVerificationCooldownRemaining();
  if (remaining > 0) {
    resendBtn.disabled = true;
    resendHint.textContent = `you can resend in ${remaining}s`;
    return;
  }

  resendBtn.disabled = false;
  resendHint.textContent = 'did not get the email? you can resend it now.';
  clearVerificationCooldownTimer();
}

function startVerificationCooldown() {
  verificationResendCooldownEndsAt = Date.now() + 60000;
  updateVerificationCooldownUI();
  clearVerificationCooldownTimer();
  verificationCooldownTimerId = setInterval(() => {
    updateVerificationCooldownUI();
    if (getVerificationCooldownRemaining() <= 0) {
      clearVerificationCooldownTimer();
    }
  }, 1000);
}

function showVerifyEmailScreen(message = '') {
  const errorEl = document.getElementById('verify-email-error');
  const infoEl = document.getElementById('verify-email-message');
  if (errorEl) {
    errorEl.textContent = message;
  }
  if (infoEl) {
    const email = auth.currentUser?.email || pendingSignupCredentials?.email || 'your email';
    infoEl.textContent = `check your inbox for a verification link sent to ${email}.`;
  }

  updateVerificationCooldownUI();
  showScreen('screen-verify-email');
}

async function resendVerificationEmail() {
  const currentUser = auth.currentUser;
  const errorEl = document.getElementById('verify-email-error');
  const resendBtn = document.getElementById('verify-resend-btn');

  if (!currentUser) {
    if (errorEl) errorEl.textContent = 'you must be signed in to resend the verification email';
    return;
  }

  const remaining = getVerificationCooldownRemaining();
  if (remaining > 0) {
    if (errorEl) errorEl.textContent = `please wait ${remaining}s before resending`;
    return;
  }

  setButtonLoading(resendBtn, true);
  try {
    await sendEmailVerification(currentUser);
    startVerificationCooldown();
    if (errorEl) errorEl.textContent = '';
  } catch (error) {
    if (error?.code === 'auth/too-many-requests') {
      if (errorEl) errorEl.textContent = 'too many attempts. please wait a bit before trying again.';
      startVerificationCooldown();
      return;
    }

    if (errorEl) errorEl.textContent = error?.message || 'unable to resend verification email right now';
  } finally {
    setButtonLoading(resendBtn, false);
    updateVerificationCooldownUI();
  }
}

async function checkVerificationStatus() {
  const currentUser = auth.currentUser;
  const errorEl = document.getElementById('verify-email-error');

  if (!currentUser) {
    if (errorEl) errorEl.textContent = 'you must be signed in to check verification status';
    return;
  }

  try {
    await currentUser.reload();
    if (currentUser.emailVerified) {
      if (errorEl) errorEl.textContent = '';
      pendingSignupCredentials = null;
      clearVerificationCooldownTimer();
      verificationResendCooldownEndsAt = 0;
      showScreen('screen-welcome');
      return;
    }

    if (errorEl) errorEl.textContent = 'your email is not verified yet. please check your inbox and try again.';
    showVerifyEmailScreen(errorEl ? errorEl.textContent : 'your email is not verified yet. please check your inbox and try again.');
  } catch (error) {
    if (errorEl) errorEl.textContent = error?.message || 'unable to check verification status right now';
  }
}

function showScreen(id, options = {}) {
  const fromBack = Boolean(options.fromBack);
  const currentActiveScreen = document.querySelector('.screen.active');
  const currentActiveScreenId = currentActiveScreen ? currentActiveScreen.id : '';

  if (id === 'screen-forgot') {
    const forgotForm = document.getElementById('forgot-form');
    const forgotConfirm = document.getElementById('forgot-confirm');
    const forgotEmail = document.getElementById('forgot-email');
    const forgotError = document.getElementById('forgot-error');

    if (forgotForm) forgotForm.style.display = 'block';
    if (forgotConfirm) forgotConfirm.style.display = 'none';
    if (forgotEmail) forgotEmail.value = '';
    if (forgotError) forgotError.textContent = '';
  }

  if (id === 'screen-interests') {
    const shouldResetInterests = !fromBack && (
      currentActiveScreenId === 'screen-signup' ||
      currentActiveScreenId === 'screen-landing'
    );

    if (!shouldResetInterests) {
      document.querySelectorAll('#screen-interests .interest-tag').forEach(btn => {
        const tag = btn.textContent.trim();
        btn.classList.toggle('selected', selectedInterests.includes(tag));
      });

      const countEl = document.getElementById('interest-count');
      const nextBtn = document.getElementById('interest-next');
      const count = selectedInterests.length;

      if (countEl) {
        if (count === 0) {
          countEl.textContent = '0 selected — pick at least 3';
          countEl.style.color = '';
        } else if (count < 3) {
          countEl.textContent = `${count} selected — pick ${3 - count} more`;
          countEl.style.color = '#BA7517';
        } else {
          countEl.textContent = `${count} selected ✓ looking good!`;
          countEl.style.color = '#1D9E75';
        }
      }

      if (nextBtn) {
        nextBtn.disabled = count < 3;
      }
    } else {
    selectedInterests = [];

    document.querySelectorAll('#screen-interests .interest-tag').forEach(btn => {
      btn.classList.remove('selected');
    });

    const countEl = document.getElementById('interest-count');
    if (countEl) {
      countEl.textContent = '0 selected — pick at least 3';
    }

    const nextBtn = document.getElementById('interest-next');
    if (nextBtn) {
      nextBtn.disabled = true;
    }
    }
  }

  if (id !== 'screen-welcome' && welcomeTimeoutId) {
    clearTimeout(welcomeTimeoutId);
    welcomeTimeoutId = null;
  }

  if (id !== 'screen-chat') {
    stopChatListener();
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
    window.scrollTo(0, 0);

    if (id !== 'screen-welcome' && id !== 'screen-landing') {
      const firstFocusable = target.querySelector('input, button, [tabindex="0"]');
      if (firstFocusable && !firstFocusable.disabled) {
        firstFocusable.focus();
      }
    }

    if (id === 'screen-welcome') {
      startWelcomeFlow();
    }

    if (id === 'screen-myprofile') {
      loadCurrentUserProfile();
    }

    if (id === 'screen-home') {
      loadDiscoverMatches();
    }

    if (id === 'screen-matches') {
      loadConnectionsList();
    }

    if (id === 'screen-spaces') {
      loadSpaces();
    }

    if (id === 'screen-editprofile') {
      loadEditProfileForm();
    }

    if (id !== 'screen-chat') {
      stopChatListener();
    }

    if (id !== 'screen-space-chat') {
      window.ZvibeModules?.spaces?.stopSpaceMessageSubscription?.();
    }
  }
}

// Select connection intent
function selectIntent(btn) {
  document.querySelectorAll('.intent-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedIntent = btn.textContent.trim();

  const nextBtn = document.getElementById('intent-next');
  if (nextBtn) {
    nextBtn.disabled = false;
  }
}

// Toggle interest tags
let selectedInterests = [];
function toggleInterest(btn) {
  btn.classList.toggle('selected');
  const tag = btn.textContent.trim();
  if (btn.classList.contains('selected')) {
    selectedInterests.push(tag);
  } else {
    selectedInterests = selectedInterests.filter(t => t !== tag);
  }
  const count = selectedInterests.length;
  const countEl = document.getElementById('interest-count');
  const nextBtn = document.getElementById('interest-next');
  if (count === 0) {
    countEl.textContent = '0 selected — pick at least 3';
    countEl.style.color = '';
  } else if (count < 3) {
    countEl.textContent = `${count} selected — pick ${3 - count} more`;
    countEl.style.color = '#BA7517';
  } else {
    countEl.textContent = `${count} selected ✓ looking good!`;
    countEl.style.color = '#1D9E75';
  }
  nextBtn.disabled = count < 3;
}

// Photo preview
function triggerUpload() {
  document.getElementById('photo-input').click();
}
function previewPhoto(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => {
      const preview = document.getElementById('avatar-preview');
      preview.innerHTML = `<img src="${e.target.result}" alt="profile photo">`;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

// Open chat screen
async function showChat(name, initials, color, userId = '') {
  const otherUserId = userId || name.toLowerCase().replace(/\s+/g, '-');
  stopChatListener();
  currentChatRoomId = '';
  currentChatPartnerName = name;

  if (auth.currentUser) {
    currentChatRoomId = buildChatRoomId(auth.currentUser.uid, otherUserId);
  }

  // Update chat nav
  const navAvatar = document.getElementById('chat-nav-avatar');
  const navName = document.getElementById('chat-nav-name');
  if (navAvatar && navName) {
    navAvatar.textContent = initials;
    navAvatar.style.background = color + '22';
    navAvatar.style.color = color;
    navName.textContent = name;
  }

  // Reset spark bar for each chat open
  const sparkBar = document.getElementById('spark-bar');
  if (sparkBar) sparkBar.style.display = 'flex';

  const revealBar = document.querySelector('.reveal-bar');
  if (revealBar) {
    revealBar.style.display = 'flex';
  }

  showScreen('screen-chat');

  if (currentChatRoomId) {
    try {
      const connectionRef = doc(db, 'connections', currentChatRoomId);
      const connectionSnapshot = await getDoc(connectionRef);
      const connectionData = connectionSnapshot.exists() ? connectionSnapshot.data() : null;
      await updateRevealBar(connectionData);

      if (connectionData?.revealedAt) {
        setChatNavStatus('photo revealed');
      } else if (connectionData?.createdAt) {
        const createdAtMillis = getTimestampMillis(connectionData.createdAt);
        const elapsedDays = createdAtMillis ? Math.max(1, Math.ceil((Date.now() - createdAtMillis) / (24 * 60 * 60 * 1000))) : 1;
        const currentDay = Math.min(3, elapsedDays);
        setChatNavStatus(`identity hidden · reveals in ${Math.max(1, 3 - currentDay)} days`);
      } else {
        setChatNavStatus('identity hidden');
      }

      await markChatMessagesAsRead(currentChatRoomId);
      subscribeTypingIndicators();
    } catch (error) {
      console.error('failed to load reveal state', error);
      hideRevealBar();
      setChatNavStatus('identity hidden');
    }
  } else {
    hideRevealBar();
  }

  if (currentChatRoomId) {
    const messagesQuery = query(
      collection(db, 'chatRooms', currentChatRoomId, 'messages'),
      orderBy('timestamp')
    );

    unsubscribeChatMessages = onSnapshot(messagesQuery, snapshot => {
      renderChatMessages(snapshot);
    });
  }
}

function hideRevealBar() {
  const revealBar = document.querySelector('.reveal-bar');
  if (revealBar) {
    revealBar.style.display = 'none';
  }
}

async function updateRevealBar(connectionData) {
  const revealBar = document.querySelector('.reveal-bar');
  const revealText = document.getElementById('reveal-bar-text');
  const revealProgressFill = document.getElementById('reveal-progress-fill');
  const revealButton = document.getElementById('reveal-now-btn');

  if (!revealBar || !revealText || !revealProgressFill || !revealButton) return;

  if (!connectionData || connectionData.revealedAt) {
    hideRevealBar();
    return;
  }

  const createdAtMillis = getTimestampMillis(connectionData.createdAt);
  if (!createdAtMillis) {
    hideRevealBar();
    return;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const elapsedDays = Math.max(1, Math.ceil((Date.now() - createdAtMillis) / dayMs));
  const currentDay = Math.min(3, elapsedDays);
  const progressPercent = Math.min(100, (currentDay / 3) * 100);

  if (elapsedDays >= 3) {
    hideRevealBar();
    await revealPhoto();
    return;
  }

  revealBar.style.display = 'flex';
  revealText.textContent = `photo reveals after 3 days — you're on day ${currentDay} of 3`;
  revealProgressFill.style.width = `${progressPercent}%`;
  revealButton.style.display = 'inline-flex';
}

async function revealPhoto() {
  const navAvatar = document.getElementById('chat-nav-avatar');
  if (!navAvatar) return;

  if (currentChatRoomId) {
    try {
      const connectionRef = doc(db, 'connections', currentChatRoomId);
      const connectionSnapshot = await getDoc(connectionRef);

      if (connectionSnapshot.exists()) {
        await setDoc(connectionRef, {
          revealedAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      console.error('failed to set reveal timestamp', error);
    }
  }

  hideRevealBar();
  navAvatar.classList.add('revealing');

  setTimeout(() => {
    navAvatar.style.background = '#e4e4e4';
    navAvatar.style.color = '#1a1a1a';
    navAvatar.innerHTML = '<img src="https://i.pravatar.cc/150" alt="revealed profile avatar">';
    navAvatar.setAttribute('data-revealed', 'true');
    navAvatar.classList.remove('revealing');
  }, 600);
}

function confirmReveal() {
  showConfirmModal(
    'reveal early?',
    'Revealing your photo now means they can also see yours immediately. This skips the 3-day anonymous chat period — are you sure?',
    () => {
      revealPhoto().catch(error => {
        console.error('failed to reveal photo', error);
      });
    }
  );
}

let lastMessageTime = 0;

// Send a chat message
async function sendMessage() {
  const now = Date.now();
  if (now - lastMessageTime < 1000) {
    return;
  }
  lastMessageTime = now;

  const input = document.getElementById('chat-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text || !auth.currentUser || !currentChatRoomId) return;

  input.value = '';
  if (typingDebounceTimerId) {
    clearTimeout(typingDebounceTimerId);
    typingDebounceTimerId = null;
  }

  setTypingIndicator(false).catch(error => {
    console.warn('failed to clear typing indicator', error);
  });

  try {
    await addDoc(collection(db, 'chatRooms', currentChatRoomId, 'messages'), {
      text,
      senderId: auth.currentUser.uid,
      timestamp: serverTimestamp(),
      status: 'sent'
    });
  } catch (error) {
    console.error('failed to send message', error);
    input.value = text;
  }
}

async function handleForgotPassword() {
  const emailEl = document.getElementById('forgot-email');
  const forgotForm = document.getElementById('forgot-form');
  const forgotConfirm = document.getElementById('forgot-confirm');
  const forgotError = document.getElementById('forgot-error');

  if (!emailEl || !forgotForm || !forgotConfirm || !forgotError) return;

  const email = emailEl.value.trim();
  forgotError.textContent = '';

  if (!email) {
    forgotError.textContent = 'please enter your email address';
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    if (error?.code === 'auth/invalid-email') {
      forgotError.textContent = 'please enter a valid email address';
      return;
    }

    if (error?.code === 'auth/too-many-requests') {
      forgotError.textContent = 'too many attempts. please try again later';
      return;
    }
  }

  forgotForm.style.display = 'none';
  forgotConfirm.style.display = 'block';
}

function showMatchEmptyState() {
  const matchCards = document.querySelector('.match-cards');
  if (!matchCards || matchCards.querySelector('.match-empty-state')) return;

  const emptyState = document.createElement('div');
  emptyState.className = 'match-empty-state';
  emptyState.innerHTML = `
    <div class="match-empty-icon">🎉</div>
    <h3>you've seen everyone for now</h3>
    <p>check back later for new matches</p>
    <button class="btn-primary" onclick="showScreen('screen-spaces')">explore spaces</button>
  `;
  matchCards.appendChild(emptyState);
}

function updateMatchEmptyState() {
  const matchCards = document.querySelector('.match-cards');
  if (!matchCards) return;

  const remainingMatchCards = matchCards.querySelectorAll('.match-card');
  if (remainingMatchCards.length === 0) {
    showMatchEmptyState();
  }
}

function removeMatchCard(card) {
  if (!card) return;

  if (card.dataset.userId) {
    markUsersAsSeen([card.dataset.userId]);
  }

  card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  card.style.opacity = '0';
  card.style.transform = 'translateX(-120%)';

  setTimeout(() => {
    card.remove();
    updateMatchEmptyState();
  }, 300);
}

// Send spark prompt as message
function sendSpark() {
  const sparkText = document.getElementById('spark-text');
  const input = document.getElementById('chat-input');
  if (sparkText && input) {
    input.value = sparkText.textContent.replace(/"/g, '');
    sendMessage();
    // Hide spark bar
    const sparkBar = document.getElementById('spark-bar');
    if (sparkBar) sparkBar.style.display = 'none';
  }
}

let confirmModalOnConfirm = null;
let reportFocusTrapCleanup = null;
let changeEmailFocusTrapCleanup = null;
let changePasswordFocusTrapCleanup = null;

function trapFocus(modalElement) {
  if (!modalElement) {
    return () => {};
  }

  const focusableElements = Array.from(
    modalElement.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])')
  ).filter(el => !el.disabled && el.getAttribute('aria-hidden') !== 'true');

  if (focusableElements.length === 0) {
    return () => {};
  }

  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  if (document.activeElement && !modalElement.contains(document.activeElement)) {
    firstFocusable.focus();
  }

  const handleKeydown = event => {
    if (event.key !== 'Tab') return;

    if (event.shiftKey && document.activeElement === firstFocusable) {
      event.preventDefault();
      lastFocusable.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus();
    }
  };

  modalElement.addEventListener('keydown', handleKeydown);

  return () => {
    modalElement.removeEventListener('keydown', handleKeydown);
  };
}

function showConfirmModal(title, message, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-modal-title');
  const messageEl = document.getElementById('confirm-modal-message');

  if (!modal || !titleEl || !messageEl) return;

  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmModalOnConfirm = typeof onConfirm === 'function' ? onConfirm : null;
  modal.style.display = 'flex';
}

function closeConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  if (!modal) return;

  modal.style.display = 'none';
  confirmModalOnConfirm = null;
}

function openChangeEmailModal() {
  const modal = document.getElementById('change-email-modal');
  const input = document.getElementById('change-email-input');
  const errorEl = document.getElementById('change-email-error');

  if (!modal || !input || !errorEl) return;

  input.value = '';
  errorEl.textContent = '';
  modal.style.display = 'flex';
  changeEmailFocusTrapCleanup = trapFocus(modal);
  input.focus();
}

function closeChangeEmailModal() {
  const modal = document.getElementById('change-email-modal');
  if (!modal) return;

  modal.style.display = 'none';
  if (changeEmailFocusTrapCleanup) {
    changeEmailFocusTrapCleanup();
    changeEmailFocusTrapCleanup = null;
  }
}

async function submitChangeEmail() {
  const input = document.getElementById('change-email-input');
  const errorEl = document.getElementById('change-email-error');
  const submitBtn = document.getElementById('change-email-submit-btn');
  const currentUser = auth.currentUser;

  if (!input || !errorEl || !submitBtn) return;

  errorEl.textContent = '';
  if (!currentUser) {
    errorEl.textContent = 'you must be signed in to update your email';
    return;
  }

  const newEmail = input.value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!newEmail || !emailRegex.test(newEmail)) {
    errorEl.textContent = 'please enter a valid email address';
    return;
  }

  setButtonLoading(submitBtn, true);
  try {
    await updateEmail(currentUser, newEmail);
    await setDoc(doc(db, 'users', currentUser.uid), {
      updatedAt: serverTimestamp()
    }, { merge: true });

    if (currentUserProfileCache) {
      currentUserProfileCache.email = newEmail;
    }

    closeChangeEmailModal();
    showConfirmModal('email updated', 'your account email has been updated successfully.');
  } catch (error) {
    if (error?.code === 'auth/requires-recent-login') {
      errorEl.textContent = 'for security, please sign in again and try updating your email.';
      return;
    }

    if (error?.code === 'auth/email-already-in-use') {
      errorEl.textContent = 'that email is already in use by another account';
      return;
    }

    if (error?.code === 'auth/invalid-email') {
      errorEl.textContent = 'please enter a valid email address';
      return;
    }

    errorEl.textContent = error?.message || 'unable to update email right now';
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

function openChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  const currentInput = document.getElementById('change-password-current-input');
  const newInput = document.getElementById('change-password-new-input');
  const errorEl = document.getElementById('change-password-error');

  if (!modal || !currentInput || !newInput || !errorEl) return;

  currentInput.value = '';
  newInput.value = '';
  errorEl.textContent = '';
  modal.style.display = 'flex';
  changePasswordFocusTrapCleanup = trapFocus(modal);
  currentInput.focus();
}

function closeChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (!modal) return;

  modal.style.display = 'none';
  if (changePasswordFocusTrapCleanup) {
    changePasswordFocusTrapCleanup();
    changePasswordFocusTrapCleanup = null;
  }
}

async function submitChangePassword() {
  const currentInput = document.getElementById('change-password-current-input');
  const newInput = document.getElementById('change-password-new-input');
  const errorEl = document.getElementById('change-password-error');
  const submitBtn = document.getElementById('change-password-submit-btn');
  const currentUser = auth.currentUser;

  if (!currentInput || !newInput || !errorEl || !submitBtn) return;

  errorEl.textContent = '';
  if (!currentUser) {
    errorEl.textContent = 'you must be signed in to update your password';
    return;
  }

  const currentPassword = currentInput.value;
  const newPassword = newInput.value;

  if (!currentPassword) {
    errorEl.textContent = 'please enter your current password';
    return;
  }

  if (!newPassword || newPassword.length < 8) {
    errorEl.textContent = 'new password must be at least 8 characters';
    return;
  }

  setButtonLoading(submitBtn, true);
  try {
    await updatePassword(currentUser, newPassword);
    closeChangePasswordModal();
    showConfirmModal('password updated', 'your password has been changed successfully.');
  } catch (error) {
    if (error?.code === 'auth/requires-recent-login') {
      errorEl.textContent = 'for security, please sign in again and then update your password.';
      return;
    }

    if (error?.code === 'auth/weak-password') {
      errorEl.textContent = 'please choose a stronger password';
      return;
    }

    errorEl.textContent = error?.message || 'unable to update password right now';
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

function handleConfirmModalAction() {
  const onConfirm = confirmModalOnConfirm;
  closeConfirmModal();
  if (onConfirm) onConfirm();
}

async function deleteStoragePathIfExists(storagePath) {
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    if (error?.code === 'storage/object-not-found') {
      return;
    }

    throw error;
  }
}

async function deleteDocumentsInBatches(docSnapshots, applyOperation) {
  const batchSize = 450;

  for (let index = 0; index < docSnapshots.length; index += batchSize) {
    const batch = writeBatch(db);
    const chunk = docSnapshots.slice(index, index + batchSize);

    chunk.forEach(docSnapshot => {
      applyOperation(batch, docSnapshot);
    });

    await batch.commit();
  }
}

async function deleteAccountAndAllData(currentUser) {
  if (!currentUser) {
    throw new Error('you must be signed in to delete your account');
  }

  const uid = currentUser.uid;

  try {
    const messagesSnapshot = await getDocs(query(
      collectionGroup(db, 'messages'),
      where('senderId', '==', uid)
    ));

    const roomMessageDocs = messagesSnapshot.docs.filter(messageDoc => {
      const path = messageDoc.ref.path;
      return path.startsWith('chatRooms/') || path.startsWith('connections/') || path.startsWith('chats/');
    });

    await deleteDocumentsInBatches(roomMessageDocs, (batch, messageDoc) => {
      const messageData = messageDoc.data();
      const deletedMarker = '[deleted user] ';
      const messageText = messageData.text || '';
      batch.update(messageDoc.ref, {
        text: messageText.startsWith(deletedMarker)
          ? messageText
          : `${deletedMarker}${messageText}`
      });
    });

    const membershipSnapshot = await getDocs(query(
      collectionGroup(db, 'members'),
      where('userId', '==', uid)
    ));

    await deleteDocumentsInBatches(membershipSnapshot.docs, (batch, memberDoc) => {
      const spaceRef = memberDoc.ref.parent.parent;
      batch.delete(memberDoc.ref);

      if (spaceRef) {
        batch.update(spaceRef, {
          memberCount: increment(-1)
        });
      }
    });

    const seenUsersSnapshot = await getDocs(collection(db, 'users', uid, 'seenUsers'));

    await deleteDocumentsInBatches(seenUsersSnapshot.docs, (batch, seenDoc) => {
      batch.delete(seenDoc.ref);
    });

    await Promise.all([
      deleteStoragePathIfExists(`users/${uid}/photo`),
      deleteStoragePathIfExists(`avatars/${uid}.jpg`)
    ]);

    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', uid));
    await batch.commit();

    await deleteUser(currentUser);
  } catch (error) {
    if (error?.code === 'auth/requires-recent-login') {
      throw error;
    }

    console.error('failed to delete account and all data', error);
    throw error;
  }
}

function confirmSignOut() {
  showConfirmModal('sign out', 'Sign out?', () => {
    signOut(auth)
      .then(() => {
        showScreen('screen-landing');
      })
      .catch(error => {
        console.error('failed to sign out', error);
      });
  });
}

function confirmDeleteAccount() {
  showConfirmModal('delete account', 'Delete your account? This cannot be undone.', () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showScreen('screen-landing');
      return;
    }

    deleteAccountAndAllData(currentUser)
      .then(() => {
        showScreen('screen-landing');
      })
      .catch(error => {
        if (error?.code === 'auth/requires-recent-login') {
          showConfirmModal('re-login required', 'For security, please sign in again and then try deleting your account.');
          return;
        }

        console.error('failed to delete account', error);
      });
  });
}

// Report modal
function showReport() {
  const modal = document.getElementById('report-modal');
  if (!modal) return;

  modal.style.display = 'flex';
  reportFocusTrapCleanup = trapFocus(modal);
}
function closeReport() {
  const modal = document.getElementById('report-modal');
  if (!modal) return;

  modal.style.display = 'none';

  if (reportFocusTrapCleanup) {
    reportFocusTrapCleanup();
    reportFocusTrapCleanup = null;
  }
}
function submitReport(btn) {
  closeReport();
  document.getElementById('report-confirm').style.display = 'flex';
}

function blockUser() {
  closeReport();
  showToast('user blocked', 'info', 2000);
}

// Unblock user
function unblockUser(btn) {
  const item = btn.closest('.blocked-item');
  if (item) {
    item.style.transition = 'all 0.3s ease';
    item.style.opacity = '0.5';
    btn.textContent = 'unblocked ✓';
    btn.disabled = true;
    setTimeout(() => {
      item.remove();
    }, 1500);
  }
}

// Filter chips toggle
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    chip.closest('.filter-chips').querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

// Settings toggle items click
document.querySelectorAll('.toggle-item').forEach(item => {
  item.addEventListener('click', e => {
    if (e.target.classList.contains('toggle')) return;
    const toggle = item.querySelector('.toggle');
    if (toggle) toggle.checked = !toggle.checked;
  });
});

// Animate match bar fills on page load
function animateMatchBars() {
  document.querySelectorAll('.match-bar-fill').forEach(bar => {
    const target = bar.style.width;
    bar.style.width = '0';
    setTimeout(() => { bar.style.width = target; }, 300);
  });
}

function checkEmptyStates() {
  const chatList = document.querySelector('.chat-list');
  const emptyConnections = document.getElementById('empty-connections');
  if (!chatList || !emptyConnections) return;

  const visibleConnectionCount = Array.from(chatList.children).filter(child => child.id !== 'empty-connections').length;
  emptyConnections.style.display = visibleConnectionCount === 0 ? 'block' : 'none';
}

// Init
window.addEventListener('DOMContentLoaded', () => {
  const landingSignInBtn = document.getElementById('landing-signin-btn');
  const landingGetStartedBtn = document.getElementById('landing-get-started-btn');
  const signupContinueBtn = document.getElementById('signup-continue-btn');
  const loginSubmitBtn = document.getElementById('login-submit-btn');
  const loginEmailEl = document.getElementById('login-email');
  const loginPassEl = document.getElementById('login-pass');
  const loginErrorEl = document.getElementById('login-error');
  const forgotSubmitBtn = document.getElementById('forgot-submit-btn');
  const profileAvatarUpload = document.getElementById('profile-avatar-upload');
  const createProfileBtn = document.getElementById('create-profile-btn');
  const editProfileSaveBtn = document.getElementById('edit-profile-save-btn');
  const bioEl = document.getElementById('profile-bio');
  const charCountEl = document.getElementById('char-count');
  const editBioEl = document.getElementById('edit-profile-bio');
  const editCharCountEl = document.getElementById('edit-profile-char-count');
  const chatInputEl = document.getElementById('chat-input');
  const chatSendBtn = document.querySelector('.chat-send-btn');
  const reportBtn = document.querySelector('.report-btn');
  const changeEmailBtn = document.getElementById('settings-change-email-btn');
  const changePasswordBtn = document.getElementById('settings-change-password-btn');
  const changeEmailSubmitBtn = document.getElementById('change-email-submit-btn');
  const changePasswordSubmitBtn = document.getElementById('change-password-submit-btn');
  const changeEmailInput = document.getElementById('change-email-input');
  const changePasswordCurrentInput = document.getElementById('change-password-current-input');
  const changePasswordNewInput = document.getElementById('change-password-new-input');
  const onboardingInterestTags = document.querySelectorAll('#screen-interests .interest-tag');
  const intentButtons = document.querySelectorAll('#screen-intent .intent-btn');
  const bottomNavButtons = document.querySelectorAll('.bottom-nav .bnav-btn[data-screen]');

  if (landingSignInBtn) {
    landingSignInBtn.addEventListener('click', () => {
      showScreen('screen-login');
    });
  }

  if (landingGetStartedBtn) {
    landingGetStartedBtn.addEventListener('click', () => {
      showScreen('screen-signup');
    });
  }

  if (signupContinueBtn) {
    signupContinueBtn.dataset.loadingText = 'creating account...';
    signupContinueBtn.addEventListener('click', async () => {
      setButtonLoading(signupContinueBtn, true);
      try {
        await validateSignup();
      } finally {
        setButtonLoading(signupContinueBtn, false);
      }
    });
  }

  if (loginSubmitBtn) {
    loginSubmitBtn.dataset.loadingText = 'signing in...';
    loginSubmitBtn.addEventListener('click', async () => {
      if (loginErrorEl) {
        loginErrorEl.textContent = '';
      }

      const email = loginEmailEl ? loginEmailEl.value.trim() : '';
      const pass = loginPassEl ? loginPassEl.value : '';

      if (!email || !pass) {
        if (loginErrorEl) {
          loginErrorEl.textContent = 'please enter your email and password';
        }
        return;
      }

      setButtonLoading(loginSubmitBtn, true);
      try {
        await signInWithEmailAndPassword(auth, email, pass);
      } catch (error) {
        if (loginErrorEl) {
          loginErrorEl.textContent = formatAuthError(error?.code);
        }
      } finally {
        setButtonLoading(loginSubmitBtn, false);
      }
    });
  }

  if (forgotSubmitBtn) {
    forgotSubmitBtn.dataset.loadingText = 'sending link...';
    forgotSubmitBtn.addEventListener('click', async () => {
      setButtonLoading(forgotSubmitBtn, true);
      try {
        await handleForgotPassword();
      } finally {
        setButtonLoading(forgotSubmitBtn, false);
      }
    });
  }

  onboardingInterestTags.forEach(tag => {
    tag.addEventListener('click', () => {
      toggleInterest(tag);
    });
  });

  intentButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectIntent(btn);
    });
  });

  if (profileAvatarUpload) {
    profileAvatarUpload.addEventListener('click', () => {
      triggerUpload();
    });
  }

  if (createProfileBtn) {
    createProfileBtn.dataset.loadingText = 'creating profile...';
    createProfileBtn.addEventListener('click', async () => {
      showProfileSaveError('');
      setButtonLoading(createProfileBtn, true);

      try {
        if (!auth.currentUser) {
          if (!pendingSignupCredentials?.email || !pendingSignupCredentials?.pass) {
            showScreen('screen-signup');
            showProfileSaveError('');
            const emailError = document.getElementById('error-email');
            if (emailError) {
              emailError.textContent = 'please complete signup details first';
            }
            return;
          }

          try {
            await createUserWithEmailAndPassword(
              auth,
              pendingSignupCredentials.email,
              pendingSignupCredentials.pass
            );
          } catch (error) {
            showScreen('screen-signup');
            setSignupFirebaseError(error);
            return;
          }
        }

        if (auth.currentUser && !auth.currentUser.emailVerified) {
          await sendEmailVerification(auth.currentUser);
        }

        await saveCurrentUserProfile();
        pendingSignupCredentials = null;
        if (auth.currentUser && !auth.currentUser.emailVerified) {
          startVerificationCooldown();
          showVerifyEmailScreen();
        } else {
          showScreen('screen-welcome');
        }
      } catch (error) {
        showProfileSaveError(error?.message || 'unable to save your profile');
      } finally {
        setButtonLoading(createProfileBtn, false);
      }
    });
  }

  if (editProfileSaveBtn) {
    editProfileSaveBtn.dataset.loadingText = 'saving changes...';
    editProfileSaveBtn.addEventListener('click', async () => {
      showProfileSaveError('');
      setButtonLoading(editProfileSaveBtn, true);

      try {
        await saveEditedProfile();
        showScreen('screen-myprofile');
      } catch (error) {
        showProfileSaveError(error?.message || 'unable to save your profile changes');
      } finally {
        setButtonLoading(editProfileSaveBtn, false);
      }
    });
  }

  bottomNavButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetScreen = btn.getAttribute('data-screen');
      if (targetScreen) {
        showScreen(targetScreen);
      }
    });
  });

  if (reportBtn) {
    reportBtn.addEventListener('click', () => {
      showReport();
    });
  }

  if (changeEmailBtn) {
    changeEmailBtn.addEventListener('click', () => {
      openChangeEmailModal();
    });
  }

  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', () => {
      openChangePasswordModal();
    });
  }

  if (changeEmailSubmitBtn) {
    changeEmailSubmitBtn.dataset.loadingText = 'updating email...';
    changeEmailSubmitBtn.addEventListener('click', () => {
      submitChangeEmail();
    });
  }

  if (changePasswordSubmitBtn) {
    changePasswordSubmitBtn.dataset.loadingText = 'updating password...';
    changePasswordSubmitBtn.addEventListener('click', () => {
      submitChangePassword();
    });
  }

  if (changeEmailInput) {
    changeEmailInput.addEventListener('keyup', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitChangeEmail();
      }
    });
  }

  if (changePasswordCurrentInput && changePasswordNewInput) {
    const handlePasswordEnter = event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitChangePassword();
      }
    };

    changePasswordCurrentInput.addEventListener('keyup', handlePasswordEnter);
    changePasswordNewInput.addEventListener('keyup', handlePasswordEnter);
  }

  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', () => {
      sendMessage();
    });
  }

  if (bioEl && charCountEl) {
    bioEl.addEventListener('input', () => {
      const len = bioEl.value.length;
      charCountEl.textContent = `${len} / 150`;
      charCountEl.style.color = len > 130 ? '#BA7517' : '';
    });
  }

  if (editBioEl && editCharCountEl) {
    editBioEl.addEventListener('input', () => {
      const len = editBioEl.value.length;
      editCharCountEl.textContent = `${len} / 150`;
      editCharCountEl.style.color = len > 130 ? '#BA7517' : '';
    });
  }
  if (chatInputEl) {
    chatInputEl.addEventListener('input', () => {
      handleChatTyping();
    });
    chatInputEl.addEventListener('keyup', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
      }
    });
  }

  onAuthStateChanged(auth, user => {
    const currentActiveScreen = document.querySelector('.screen.active');
    const currentActiveScreenId = currentActiveScreen ? currentActiveScreen.id : '';
    const authScreens = ['screen-landing', 'screen-login', 'screen-signup', 'screen-forgot'];

    if (user) {
      if (!user.emailVerified) {
        showVerifyEmailScreen();
        return;
      }

      if (!currentActiveScreenId || authScreens.includes(currentActiveScreenId)) {
        showScreen('screen-home');
      } else if (currentActiveScreenId === 'screen-home') {
        loadDiscoverMatches();
      }
      return;
    }

    if (!currentActiveScreenId || currentActiveScreen.classList.contains('app-screen')) {
      showScreen('screen-landing');
    }
  });

  if (!auth.currentUser) {
    showScreen('screen-landing');
  }
  animateMatchBars();
  checkEmptyStates();
  
  // Initialize space chat event handlers
  if (typeof window.ZvibeModules?.ui?.initializeSpaceChatEvents === 'function') {
    window.ZvibeModules.ui.initializeSpaceChatEvents();
  }
});

Object.assign(window, {
  showScreen,
  togglePasswordVisibility,
  validateSignup,
  showToast,
  resendVerificationEmail,
  checkVerificationStatus,
  selectIntent,
  triggerUpload,
  previewPhoto,
  showChat,
  revealPhoto,
  confirmReveal,
  sendMessage,
  sendSpark,
  showConfirmModal,
  closeConfirmModal,
  openChangeEmailModal,
  closeChangeEmailModal,
  submitChangeEmail,
  openChangePasswordModal,
  closeChangePasswordModal,
  submitChangePassword,
  handleConfirmModalAction,
  confirmSignOut,
  confirmDeleteAccount,
  showReport,
  closeReport,
  submitReport,
  blockUser,
  unblockUser
});

})();
