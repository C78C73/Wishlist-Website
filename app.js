import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import {
  getFirestore, doc, setDoc, getDoc, updateDoc
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';

// =========================================================
// STATE
// =========================================================
const S = {
  db: null,
  listId: null,
  listData: null,
  isOwner: false,
  pendingBuyItemId: null,
  pendingDeleteItemId: null
};

// =========================================================
// THEME
// =========================================================
const savedTheme = localStorage.getItem('wl-theme') || 'light';
applyTheme(savedTheme);

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem('wl-theme', next);
  applyTheme(next);
}
window.toggleTheme = toggleTheme;

// =========================================================
// FIREBASE
// =========================================================
function loadConfig() {
  try { return JSON.parse(localStorage.getItem('wl-firebase') || 'null'); }
  catch { return null; }
}

function initFirebase() {
  const cfg = loadConfig();
  if (!cfg) return false;
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    S.db = getFirestore(app);
    return true;
  } catch (e) {
    console.error('Firebase init failed:', e);
    return false;
  }
}

function needsFirebase(cb) {
  if (S.db) { cb(); return; }
  if (initFirebase()) { cb(); return; }
  showPage('setup');
}

function saveFirebaseConfig() {
  const raw = document.getElementById('firebase-config-input').value.trim();
  if (!raw) { toast('Please paste your Firebase config', 'error'); return; }
  try {
    // Target the config object specifically — avoid matching import { } destructuring
    // Strategy 1: look for firebaseConfig = { ... } (no nested braces in config values)
    // Strategy 2: look for any { ... } block that contains apiKey
    const match = raw.match(/firebaseConfig\s*=\s*(\{[^}]+\})/) ||
                  raw.match(/(\{[^}]*"?apiKey"?\s*:[^}]+\})/);
    if (!match) throw new Error('No config object found');
    const str = match[1];

    let parsed;
    try {
      parsed = JSON.parse(str);
    } catch {
      // Firebase console gives JS objects with unquoted keys — convert to JSON
      const jsonStr = str
        .replace(/\/\/[^\n]*/g, '')                                          // strip // comments
        .replace(/,(\s*[}\]])/g, '$1')                                       // strip trailing commas
        .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3'); // quote bare keys
      parsed = JSON.parse(jsonStr);
    }

    if (!parsed.apiKey || !parsed.projectId) throw new Error('Missing required fields');
    localStorage.setItem('wl-firebase', JSON.stringify(parsed));
    S.db = null;
    if (initFirebase()) {
      toast('Firebase connected! 🎉', 'success');
      navigateTo('create');
    } else {
      throw new Error('Init failed');
    }
  } catch (e) {
    console.error('Config parse error:', e);
    toast('Could not read config — please paste the snippet from Firebase console', 'error');
  }
}
window.saveFirebaseConfig = saveFirebaseConfig;

// =========================================================
// ROUTING & PAGES
// =========================================================
const PAGES = ['home', 'setup', 'create', 'manage', 'buyer', 'mylists'];

function showPage(name) {
  PAGES.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) el.classList.toggle('active', p === name);
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function navigateTo(view, params) {
  params = params || {};
  if (view === 'home') {
    history.pushState(null, '', location.pathname + '#/');
    showPage('home');
  } else if (view === 'setup') {
    history.pushState(null, '', location.pathname + '#/setup');
    showPage('setup');
  } else if (view === 'create') {
    needsFirebase(() => {
      history.pushState(null, '', location.pathname + '#/create');
      showPage('create');
    });
  } else if (view === 'manage' && params.listId) {
    needsFirebase(() => {
      history.pushState(null, '', location.pathname + '#/manage/' + params.listId);
      showPage('manage');
      loadManagePage(params.listId);
    });
  } else if (view === 'buyer' && params.listId) {
    needsFirebase(() => {
      history.pushState(null, '', location.pathname + '#/view/' + params.listId);
      showPage('buyer');
      loadBuyerPage(params.listId);
    });
  } else if (view === 'mylists') {
    needsFirebase(() => {
      history.pushState(null, '', location.pathname + '#/mylists');
      showPage('mylists');
      renderMyLists();
    });
  }
}
window.navigateTo = navigateTo;

function handleHash() {
  const hash = location.hash.replace('#', '') || '/';
  if (hash === '/' || hash === '') {
    showPage('home');
  } else if (hash === '/setup') {
    showPage('setup');
  } else if (hash === '/create') {
    needsFirebase(() => showPage('create'));
  } else if (hash.startsWith('/manage/')) {
    const id = hash.split('/')[2];
    needsFirebase(() => { showPage('manage'); loadManagePage(id); });
  } else if (hash.startsWith('/view/')) {
    const id = hash.split('/')[2];
    needsFirebase(() => { showPage('buyer'); loadBuyerPage(id); });
  } else if (hash === '/mylists') {
    needsFirebase(() => { showPage('mylists'); renderMyLists(); });
  } else {
    showPage('home');
  }
}

window.addEventListener('popstate', handleHash);

// =========================================================
// HOME
// =========================================================
function showViewEntry() {
  const el = document.getElementById('view-entry');
  el.classList.add('visible');
  document.getElementById('list-code-input').focus();
}
window.showViewEntry = showViewEntry;

document.getElementById('list-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') goToList();
});

function goToList() {
  const code = document.getElementById('list-code-input').value.trim();
  if (!code) { toast('Enter a list code first', 'error'); return; }
  navigateTo('buyer', { listId: code });
}
window.goToList = goToList;

function goCreate() {
  navigateTo('create');
}
window.goCreate = goCreate;

// =========================================================
// MODALS
// =========================================================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
window.closeModal = closeModal;

document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.overlay.open').forEach(o => closeModal(o.id));
  }
});

// =========================================================
// TOAST
// =========================================================
function toast(msg, type) {
  type = type || 'info';
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span>' + (icons[type] || icons.info) + '</span> ' + esc(msg);
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut 0.28s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// =========================================================
// CREATE LIST
// =========================================================
async function createList() {
  const owner = document.getElementById('create-owner').value.trim();
  const name  = document.getElementById('create-name').value.trim();
  const occ   = document.getElementById('create-occasion').value;
  if (!owner) { toast('Please enter your name', 'error'); return; }
  if (!name)  { toast('Please enter a list name', 'error'); return; }

  const btn = document.getElementById('create-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating…';

  try {
    const listId = uid();
    const data = { id: listId, name, ownerName: owner, occasion: occ, items: [], createdAt: Date.now() };
    await setDoc(doc(S.db, 'lists', listId), data);

    // Save to local "my lists"
    const mine = getMyLists();
    mine.unshift({ id: listId, name, ownerName: owner, occasion: occ, createdAt: Date.now() });
    saveMyLists(mine);

    toast('List created! 🎉', 'success');
    navigateTo('manage', { listId });
  } catch (e) {
    console.error(e);
    toast('Failed to create list — check your Firebase connection', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create List & Add Items →';
  }
}
window.createList = createList;

// =========================================================
// MANAGE PAGE
// =========================================================
async function loadManagePage(listId) {
  S.listId = listId;
  S.isOwner = true;
  const container = document.getElementById('manage-items');
  container.innerHTML = '<div class="loading-state"><div class="spinner spinner-lg"></div><p style="margin-top:0.75rem;">Loading your list…</p></div>';

  try {
    const snap = await getDoc(doc(S.db, 'lists', listId));
    if (!snap.exists()) {
      container.innerHTML = notFoundHtml();
      return;
    }
    const data = snap.data();
    S.listData = data;
    document.getElementById('manage-title').textContent = data.name;
    document.getElementById('manage-breadcrumb').textContent = data.name;
    document.getElementById('manage-occasion').textContent = occasionLabel(data.occasion);
    document.title = data.name + ' — Wishlist';
    renderManageItems(data.items || []);
  } catch (e) {
    console.error(e);
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading list</h3><p>Check your internet connection.</p></div>';
  }
}

function renderManageItems(items) {
  const c = document.getElementById('manage-items');
  if (!items.length) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">🎁</div><h3>No items yet</h3><p>Add your first item using the button above (or the + button on mobile).</p></div>';
    return;
  }
  c.innerHTML = '<p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:0.25rem;"><span id="manage-count" class="count-badge">' + items.length + ' item' + (items.length !== 1 ? 's' : '') + '</span>&nbsp; Bought items are hidden from this view to preserve your surprises ✨</p><div class="items-grid" id="manage-grid"></div>';
  const grid = document.getElementById('manage-grid');
  items.forEach((item, i) => {
    const card = buildItemCard(item, i, true);
    grid.appendChild(card);
  });
}

function buildItemCard(item, idx, isOwner) {
  const div = document.createElement('div');
  div.className = 'item-card' + ((!isOwner && item.bought) ? ' bought' : '');
  div.style.animationDelay = (idx * 0.06) + 's';

  const hasImg = item.imageUrl && item.imageUrl.trim();
  const imgBlock = hasImg
    ? '<img class="item-img" src="' + esc(item.imageUrl) + '" alt="' + esc(item.name) + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';" /><div class="item-img-placeholder" style="display:none;">🎁</div>'
    : '<div class="item-img-placeholder">🎁</div>';

  let actions = '';
  if (isOwner) {
    actions = (item.url ? '<a href="' + esc(item.url) + '" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">🔗 Link</a>' : '') +
      '<button class="btn btn-danger btn-sm" onclick="askDeleteItem(\'' + item.id + '\')">Remove</button>';
  } else if (item.bought) {
    actions = '<span class="bought-badge">✓ Bought</span>';
  } else {
    actions = (item.url ? '<a href="' + esc(item.url) + '" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">🔗 View</a>' : '') +
      '<button class="btn btn-primary btn-sm" onclick="askMarkBought(\'' + item.id + '\')">I\'ll buy this!</button>';
  }

  div.innerHTML = imgBlock +
    '<div class="item-body">' +
      '<div class="item-name">' + esc(item.name) + '</div>' +
      (item.price ? '<div class="item-price">' + esc(item.price) + '</div>' : '') +
      (item.notes ? '<div class="item-notes">' + esc(item.notes) + '</div>' : '') +
      '<div class="item-actions">' + actions + '</div>' +
    '</div>';
  return div;
}

// =========================================================
// ADD ITEM MODAL
// =========================================================
function openAddItemModal() {
  ['item-url','item-name','item-price','item-image','item-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('fetch-preview').classList.add('hidden');
  openModal('modal-add-item');
}
window.openAddItemModal = openAddItemModal;

async function fetchFromUrl() {
  const url = document.getElementById('item-url').value.trim();
  if (!url) { toast('Paste a URL first', 'error'); return; }
  const btn = document.getElementById('fetch-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const res = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(url));
    const json = await res.json();
    if (json.status === 'success') {
      const d = json.data;
      const title = d.title || '';
      const image = (d.image && d.image.url) || '';
      const desc  = d.description || '';
      if (title) document.getElementById('item-name').value = title;
      if (image) document.getElementById('item-image').value = image;
      const prev = document.getElementById('fetch-preview');
      prev.classList.remove('hidden');
      const fpImg = document.getElementById('fp-img');
      if (image) { fpImg.src = image; fpImg.style.display = 'block'; }
      else fpImg.style.display = 'none';
      document.getElementById('fp-title').textContent = title || 'No title found';
      document.getElementById('fp-desc').textContent = desc ? desc.slice(0, 100) + (desc.length > 100 ? '…' : '') : '';
      toast('Details fetched ✓', 'success');
    } else {
      toast('Could not auto-fill — try filling in manually', 'info');
    }
  } catch {
    toast('Fetch failed — please fill in details manually', 'info');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fetch';
  }
}
window.fetchFromUrl = fetchFromUrl;

async function submitAddItem() {
  if (!S.listId) return;
  const name = document.getElementById('item-name').value.trim();
  if (!name) { toast('Item name is required', 'error'); return; }

  const btn = document.getElementById('add-item-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Adding…';

  const item = {
    id: uid(),
    name,
    url:      document.getElementById('item-url').value.trim(),
    imageUrl: document.getElementById('item-image').value.trim(),
    price:    document.getElementById('item-price').value.trim(),
    notes:    document.getElementById('item-notes').value.trim(),
    bought:   false,
    boughtAt: null,
    createdAt: Date.now()
  };

  try {
    const newItems = [...(S.listData.items || []), item];
    await updateDoc(doc(S.db, 'lists', S.listId), { items: newItems });
    S.listData.items = newItems;
    renderManageItems(newItems);
    closeModal('modal-add-item');
    toast('Item added! 🎉', 'success');
  } catch (e) {
    console.error(e);
    toast('Error adding item — please try again', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Item';
  }
}
window.submitAddItem = submitAddItem;

// =========================================================
// DELETE ITEM
// =========================================================
function askDeleteItem(itemId) {
  S.pendingDeleteItemId = itemId;
  const item = S.listData && S.listData.items.find(it => it.id === itemId);
  document.getElementById('delete-item-name').textContent = item ? item.name : 'this item';
  openModal('modal-delete-item');
}
window.askDeleteItem = askDeleteItem;

document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
  if (!S.pendingDeleteItemId || !S.listId) return;
  const btn = document.getElementById('confirm-delete-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const newItems = S.listData.items.filter(it => it.id !== S.pendingDeleteItemId);
    await updateDoc(doc(S.db, 'lists', S.listId), { items: newItems });
    S.listData.items = newItems;
    renderManageItems(newItems);
    closeModal('modal-delete-item');
    toast('Item removed', 'success');
  } catch (e) {
    console.error(e);
    toast('Error removing item', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Remove';
    S.pendingDeleteItemId = null;
  }
});

// =========================================================
// SHARE
// =========================================================
function openShareModal() {
  if (!S.listId) return;
  const url = location.origin + location.pathname + '#/view/' + S.listId;
  document.getElementById('share-link').value = url;
  document.getElementById('share-code').textContent = S.listId;
  openModal('modal-share');
}
window.openShareModal = openShareModal;

function copyShareLink() {
  const val = document.getElementById('share-link').value;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(val).then(() => toast('Link copied!', 'success'));
  } else {
    const inp = document.getElementById('share-link');
    inp.select();
    document.execCommand('copy');
    toast('Link copied!', 'success');
  }
}
window.copyShareLink = copyShareLink;

// =========================================================
// BUYER PAGE
// =========================================================
async function loadBuyerPage(listId) {
  S.listId = listId;
  S.isOwner = false;
  const container = document.getElementById('buyer-items');
  container.innerHTML = '<div class="loading-state"><div class="spinner spinner-lg"></div><p style="margin-top:0.75rem;">Loading wishlist…</p></div>';
  document.getElementById('buyer-progress').style.display = 'none';

  try {
    const snap = await getDoc(doc(S.db, 'lists', listId));
    if (!snap.exists()) {
      container.innerHTML = notFoundHtml();
      return;
    }
    const data = snap.data();
    S.listData = data;
    document.getElementById('buyer-title').textContent = data.name;
    document.getElementById('buyer-occasion').textContent = occasionLabel(data.occasion);
    document.getElementById('buyer-owner').innerHTML = '<span style="color:var(--text-muted);">by </span><strong>' + esc(data.ownerName) + '</strong>';
    document.title = data.ownerName + "'s " + data.name + ' — Wishlist';
    renderBuyerItems(data.items || []);
    updateProgress(data.items || []);
  } catch (e) {
    console.error(e);
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading wishlist</h3><p>Check your connection and try again.</p></div>';
  }
}

function renderBuyerItems(items) {
  const c = document.getElementById('buyer-items');
  if (!items.length) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">🎁</div><h3>Nothing here yet</h3><p>This wishlist is empty — check back soon!</p></div>';
    return;
  }
  const available = items.filter(it => !it.bought);
  const bought    = items.filter(it => it.bought);
  c.innerHTML = '';

  if (available.length) {
    const sec = document.createElement('div');
    sec.innerHTML = '<div class="section-heading">Available <span class="count-badge">' + available.length + '</span></div>';
    const grid = document.createElement('div');
    grid.className = 'items-grid';
    available.forEach((it, i) => grid.appendChild(buildItemCard(it, i, false)));
    sec.appendChild(grid);
    c.appendChild(sec);
  }

  if (bought.length) {
    const sec = document.createElement('div');
    sec.style.marginTop = '2rem';
    sec.innerHTML = '<div class="section-heading" style="color:var(--text-muted);">Already Bought <span class="count-badge">' + bought.length + '</span></div>';
    const grid = document.createElement('div');
    grid.className = 'items-grid';
    bought.forEach((it, i) => grid.appendChild(buildItemCard(it, i, false)));
    sec.appendChild(grid);
    c.appendChild(sec);
  }
}

function updateProgress(items) {
  if (!items.length) { document.getElementById('buyer-progress').style.display = 'none'; return; }
  const b   = items.filter(it => it.bought).length;
  const pct = Math.round((b / items.length) * 100);
  document.getElementById('buyer-progress').style.display = 'block';
  document.getElementById('progress-label').textContent = b + ' of ' + items.length + ' items bought';
  document.getElementById('progress-pct').textContent   = pct + '%';
  setTimeout(() => { document.getElementById('progress-fill').style.width = pct + '%'; }, 80);
}

// =========================================================
// MARK AS BOUGHT
// =========================================================
function askMarkBought(itemId) {
  S.pendingBuyItemId = itemId;
  const item = S.listData && S.listData.items.find(it => it.id === itemId);
  document.getElementById('confirm-item-name').textContent = item ? item.name : 'this item';
  // Re-wire button to avoid duplicate handlers
  const old = document.getElementById('confirm-bought-btn');
  const fresh = old.cloneNode(true);
  old.parentNode.replaceChild(fresh, old);
  fresh.addEventListener('click', doMarkBought);
  openModal('modal-confirm-bought');
}
window.askMarkBought = askMarkBought;

async function doMarkBought() {
  if (!S.pendingBuyItemId || !S.listId) return;
  const btn = document.getElementById('confirm-bought-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const newItems = S.listData.items.map(it =>
      it.id === S.pendingBuyItemId ? { ...it, bought: true, boughtAt: Date.now() } : it
    );
    await updateDoc(doc(S.db, 'lists', S.listId), { items: newItems });
    S.listData.items = newItems;
    renderBuyerItems(newItems);
    updateProgress(newItems);
    closeModal('modal-confirm-bought');
    toast('Marked as bought! The surprise is safe 🎉', 'success');
  } catch (e) {
    console.error(e);
    toast('Error — please try again', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = "Yes, I'll buy this!";
    S.pendingBuyItemId = null;
  }
}

// =========================================================
// MY LISTS
// =========================================================
function getMyLists() {
  try { return JSON.parse(localStorage.getItem('wl-my-lists') || '[]'); }
  catch { return []; }
}
function saveMyLists(lists) {
  localStorage.setItem('wl-my-lists', JSON.stringify(lists));
}

function renderMyLists() {
  const lists = getMyLists();
  const c = document.getElementById('mylists-content');
  if (!lists.length) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h3>No lists yet</h3><p>Create your first wishlist to get started.</p></div>';
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'lists-grid';
  lists.forEach(list => {
    const card = document.createElement('div');
    card.className = 'list-card';
    card.innerHTML =
      '<span class="list-occasion-tag">' + occasionLabel(list.occasion) + '</span>' +
      '<h3>' + esc(list.name) + '</h3>' +
      '<p style="font-size:0.84rem; color:var(--text-muted);">by ' + esc(list.ownerName) + '</p>' +
      '<div class="list-meta">Created ' + timeAgo(list.createdAt) + '</div>' +
      '<div class="list-card-actions">' +
        '<button class="btn btn-primary btn-sm" onclick="navigateTo(\'manage\', {listId:\'' + list.id + '\'})">Manage</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="copyListUrl(\'' + list.id + '\')">📋 Share</button>' +
      '</div>';
    grid.appendChild(card);
  });
  c.innerHTML = '';
  c.appendChild(grid);
}

function copyListUrl(listId) {
  const url = location.origin + location.pathname + '#/view/' + listId;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => toast('Share link copied!', 'success'));
  }
}
window.copyListUrl = copyListUrl;

// =========================================================
// HELPERS
// =========================================================
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function occasionLabel(o) {
  return { birthday:'🎂 Birthday', christmas:'🎄 Christmas', wedding:'💍 Wedding', 'baby-shower':'👶 Baby Shower', graduation:'🎓 Graduation', housewarming:'🏠 Housewarming', anniversary:'💕 Anniversary', other:'🎁 Other' }[o] || '🎁 Other';
}

function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30)  return d + ' days ago';
  const m = Math.floor(d / 30);
  return m + ' month' + (m > 1 ? 's' : '') + ' ago';
}

function notFoundHtml() {
  return '<div class="empty-state"><div class="empty-icon">🔍</div><h3>List not found</h3><p>Double-check the code or ask for a new link.</p><button class="btn btn-primary" style="margin-top:1rem;" onclick="navigateTo(\'home\')">Go Home</button></div>';
}

// =========================================================
// BOOT
// =========================================================
initFirebase(); // try to restore saved config silently
handleHash();   // render correct page from URL
