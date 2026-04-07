import { auth, db } from '../firebase-config.js';
import { collection, documentId, getDocs, limit, query, startAfter, where } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

export function renderDiscoverMatches(matches = []) {
  const container = document.getElementById('discover-match-cards');
  if (!container) return;

  container.innerHTML = '';
  if (!matches.length) {
    container.innerHTML = '<div class="match-empty-state"><div class="match-empty-icon">🎉</div><h3>no matches yet</h3></div>';
    return;
  }

  matches.forEach(match => {
    const card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML = `<div class="match-name">${String(match.name || 'Anonymous')}</div>`;
    container.appendChild(card);
  });
}

export async function loadDiscoverMatches({ exclusions = [], lastVisibleDoc = null, batchSize = 50 } = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) return { docs: [], lastVisible: null, hasMore: false };

  const constraints = [];
  const sanitizedExclusions = exclusions.filter(Boolean).slice(0, 10);

  if (sanitizedExclusions.length) constraints.push(where(documentId(), 'not-in', sanitizedExclusions));
  constraints.push(limit(batchSize));
  if (lastVisibleDoc) constraints.push(startAfter(lastVisibleDoc));

  const snapshot = await getDocs(query(collection(db, 'users'), ...constraints));
  return {
    docs: snapshot.docs,
    lastVisible: snapshot.docs[snapshot.docs.length - 1] || null,
    hasMore: snapshot.size === batchSize
  };
}

export function createMatchCard(match) {
  const card = document.createElement('div');
  card.className = 'match-card';
  card.innerHTML = `<div class="match-name">${String(match?.name || 'Anonymous')}</div>`;
  return card;
}
