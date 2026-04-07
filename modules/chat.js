import { auth, db } from '../firebase-config.js';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

let unsubscribeMessages = null;

function buildChatRoomId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

export async function showChat({ userId, onMessages }) {
  const currentUser = auth.currentUser;
  if (!currentUser || !userId) return null;

  const roomId = buildChatRoomId(currentUser.uid, userId);
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  const messagesQuery = query(
    collection(db, 'chatRooms', roomId, 'messages'),
    orderBy('timestamp')
  );

  unsubscribeMessages = onSnapshot(messagesQuery, snapshot => {
    if (typeof onMessages === 'function') onMessages(snapshot);
  });

  return roomId;
}

export async function sendMessage({ roomId, text }) {
  const currentUser = auth.currentUser;
  if (!currentUser || !roomId || !text) return;

  return addDoc(collection(db, 'chatRooms', roomId, 'messages'), {
    text,
    senderId: currentUser.uid,
    timestamp: serverTimestamp(),
    status: 'sent'
  });
}

export async function loadMessages(roomId) {
  if (!roomId) return [];
  const roomRef = doc(db, 'chatRooms', roomId);
  const room = await getDoc(roomRef);
  return room.exists() ? room.data() : null;
}

export async function revealPhoto(roomId) {
  if (!roomId) return;
  const roomRef = doc(db, 'connections', roomId);
  return getDoc(roomRef);
}

export function stopChatSubscriptions() {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
}
