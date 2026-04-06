import { auth, db, createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from './firebase-config.js';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from './node_modules/firebase/firestore/dist/index.esm.js';

// ===== ZVIBE APP LOGIC =====
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

function setSignupFirebaseError(error) {
  const emailError = document.getElementById('error-email');
  const passError = document.getElementById('error-pass');
  if (!emailError || !passError) return;

  emailError.textContent = '';
  passError.textContent = '';

  const message = error?.message || 'something went wrong';
  if (error?.code === 'auth/weak-password') {
    passError.textContent = message;
  } else {
    emailError.textContent = message;
  }
}

let selectedIntent = '';
let selectedChatUserId = '';
let currentChatRoomId = '';
let unsubscribeChatMessages = null;

function stopChatListener() {
  if (unsubscribeChatMessages) {
    unsubscribeChatMessages();
    unsubscribeChatMessages = null;
  }
}

function buildChatRoomId(currentUserId, otherUserId) {
  return [currentUserId, otherUserId].sort().join('_');
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
    const isSentByCurrentUser = messageData.senderId === auth.currentUser?.uid;

    messageEl.className = `msg ${isSentByCurrentUser ? 'sent' : 'received'}`;
    messageEl.textContent = messageData.text || '';
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
  const interests = Array.isArray(profileData?.interests) ? profileData.interests : [];
  const intent = profileData?.intent || 'add your intent';

  avatarEl.textContent = getProfileInitials(name);
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

async function loadCurrentUserProfile() {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  try {
    const snapshot = await getDoc(doc(db, 'users', currentUser.uid));
    if (snapshot.exists()) {
      const profileData = snapshot.data();
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
  const userRef = doc(db, 'users', currentUser.uid);
  const existingSnapshot = await getDoc(userRef);

  const profilePayload = {
    name: profile.name,
    email: profile.email,
    city: profile.city,
    bio: profile.bio,
    interests: profile.interests,
    intent: profile.intent,
    updatedAt: serverTimestamp()
  };

  if (!existingSnapshot.exists()) {
    profilePayload.createdAt = serverTimestamp();
  }

  await setDoc(userRef, profilePayload, { merge: true });
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
  
  // If all valid, create the user in Firebase first
  if (isValid) {
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
      showScreen('screen-interests');
    } catch (error) {
      setSignupFirebaseError(error);
    }
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

function showScreen(id) {
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

    if (id === 'screen-editprofile') {
      loadEditProfileForm();
    }

    if (id !== 'screen-chat') {
      stopChatListener();
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
function showChat(name, initials, color, userId = '') {
  const otherUserId = userId || name.toLowerCase().replace(/\s+/g, '-');
  stopChatListener();
  currentChatRoomId = '';

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

  showScreen('screen-chat');

  if (currentChatRoomId) {
    const messagesQuery = query(
      collection(db, 'chats', currentChatRoomId, 'messages'),
      orderBy('timestamp')
    );

    unsubscribeChatMessages = onSnapshot(messagesQuery, snapshot => {
      renderChatMessages(snapshot);
    });
  }
}

function revealPhoto() {
  const navAvatar = document.getElementById('chat-nav-avatar');
  if (!navAvatar) return;

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
      revealPhoto();
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
  const messages = document.getElementById('chat-messages');
  if (!input || !messages) return;
  const text = input.value.trim();
  if (!text || !auth.currentUser || !currentChatRoomId) return;

  // Add sent message
  const msg = document.createElement('div');
  msg.className = 'msg sent';
  msg.textContent = text;
  messages.appendChild(msg);
  input.value = '';
  messages.scrollTop = messages.scrollHeight;

  try {
    await addDoc(collection(db, 'chats', currentChatRoomId, 'messages'), {
      text,
      senderId: auth.currentUser.uid,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('failed to send message', error);
  }

  const typingIndicator = document.createElement('div');
  typingIndicator.className = 'msg received typing-indicator';
  typingIndicator.id = 'typing-indicator';
  typingIndicator.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  messages.appendChild(typingIndicator);
  messages.scrollTop = messages.scrollHeight;

  // Simulate a reply after a short delay
  setTimeout(() => {
    const existingTypingIndicator = document.getElementById('typing-indicator');
    if (existingTypingIndicator) existingTypingIndicator.remove();

    const replies = [
      "that's so interesting! tell me more 😊",
      "haha yes!! totally agree with that 📸",
      "wow we really do have so much in common!",
      "I was thinking the exact same thing!",
      "okay now I'm even more curious about you 👀",
      "that made me smile honestly 😄",
      "100%! we should definitely meet up sometime",
    ];
    const reply = document.createElement('div');
    reply.className = 'msg received';
    reply.textContent = replies[Math.floor(Math.random() * replies.length)];
    messages.appendChild(reply);
    messages.scrollTop = messages.scrollHeight;
  }, 1200);
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

function handleConfirmModalAction() {
  const onConfirm = confirmModalOnConfirm;
  closeConfirmModal();
  if (onConfirm) onConfirm();
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

    deleteUser(currentUser)
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

  const existingToast = document.getElementById('block-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.id = 'block-toast';
  toast.textContent = 'user blocked';
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.background = 'rgba(26,26,26,0.95)';
  toast.style.color = '#fff';
  toast.style.padding = '10px 14px';
  toast.style.borderRadius = '999px';
  toast.style.fontSize = '13px';
  toast.style.zIndex = '9999';
  toast.style.boxShadow = '0 6px 16px rgba(0,0,0,0.25)';
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2000);
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
  const onboardingInterestTags = document.querySelectorAll('#screen-interests .interest-tag');
  const intentButtons = document.querySelectorAll('#screen-intent .intent-btn');
  const bottomNavButtons = document.querySelectorAll('.bottom-nav .bnav-btn[data-screen]');
  const matchPassButtons = document.querySelectorAll('.match-card .action-pass');
  const matchConnectButtons = document.querySelectorAll('.match-card .action-connect');
  const spaceJoinButtons = document.querySelectorAll('.space-join-btn');
  const matchCards = document.querySelectorAll('.match-card');

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
    signupContinueBtn.addEventListener('click', () => {
      validateSignup();
    });
  }

  if (loginSubmitBtn) {
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

      try {
        await signInWithEmailAndPassword(auth, email, pass);
        showScreen('screen-home');
      } catch (error) {
        if (loginErrorEl) {
          loginErrorEl.textContent = error?.message || 'unable to sign in';
        }
      }
    });
  }

  if (forgotSubmitBtn) {
    forgotSubmitBtn.addEventListener('click', () => {
      handleForgotPassword();
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
    createProfileBtn.addEventListener('click', async () => {
      showProfileSaveError('');

      try {
        await saveCurrentUserProfile();
        showScreen('screen-welcome');
      } catch (error) {
        showProfileSaveError(error?.message || 'unable to save your profile');
      }
    });
  }

  if (editProfileSaveBtn) {
    editProfileSaveBtn.addEventListener('click', async () => {
      showProfileSaveError('');

      try {
        await saveEditedProfile();
        showScreen('screen-myprofile');
      } catch (error) {
        showProfileSaveError(error?.message || 'unable to save your profile changes');
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

  matchPassButtons.forEach(btn => {
    btn.addEventListener('click', event => {
      event.stopPropagation();
      const card = btn.closest('.match-card');
      removeMatchCard(card);
    });
  });

  matchConnectButtons.forEach(btn => {
    btn.addEventListener('click', event => {
      event.stopPropagation();
      showChat(btn.dataset.name, btn.dataset.initials, btn.dataset.color, btn.dataset.userId);
    });
  });

  spaceJoinButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('joined-btn')) return;

      btn.textContent = 'joined ✓';
      btn.classList.add('joined-btn');
      const card = btn.closest('.space-card');
      if (card) card.classList.add('joined');
    });
  });

  if (reportBtn) {
    reportBtn.addEventListener('click', () => {
      showReport();
    });
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
    chatInputEl.addEventListener('keyup', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
      }
    });
  }

  matchCards.forEach(card => {
    let startX = 0;
    let moveX = 0;
    let isDragging = false;

    const handleSwipeEnd = () => {
      card.style.transition = 'transform 0.3s ease';

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
  });

  onAuthStateChanged(auth, user => {
    const currentActiveScreen = document.querySelector('.screen.active');
    const currentActiveScreenId = currentActiveScreen ? currentActiveScreen.id : '';
    const authScreens = ['screen-landing', 'screen-login', 'screen-signup', 'screen-forgot'];

    if (user) {
      if (!currentActiveScreenId || authScreens.includes(currentActiveScreenId)) {
        showScreen('screen-home');
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
});

Object.assign(window, {
  showScreen,
  togglePasswordVisibility,
  validateSignup,
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
