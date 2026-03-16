import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import {
  getFirestore, doc, setDoc, getDoc, updateDoc,
  collection, query, where, getDocs
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import {
  getAuth, signInWithPopup, GoogleAuthProvider,
  onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';

// =========================================================
// STATE
// =========================================================
const S = {
  db: null,
  auth: null,
  user: null,
  listId: null,
  listData: null,
  isOwner: false,
  pendingBuyItemId: null,
  pendingDeleteItemId: null,
  editingItemId: null
};
let authResolved = false;

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
// FIREBASE INIT
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
    S.db  = getFirestore(app);
    S.auth = getAuth(app);
    onAuthStateChanged(S.auth, user => {
      S.user = user;
      authResolved = true;
      updateAuthUI();
      // If auth resolved with no user on a protected page, bounce home
      if (!user) {
        const h = location.hash.replace('#', '') || '/';
        if (h === '/create' || h === '/mylists') {
          navigateTo('home');
          toast('Sign in to access that page', 'info');
        }
      }
    });
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
    const match = raw.match(/firebaseConfig\s*=\s*(\{[^}]+\})/) ||
                  raw.match(/(\{[^}]*"?apiKey"?\s*:[^}]+\})/);
    if (!match) throw new Error('No config object found');
    const str = match[1];
    let parsed;
    try {
      parsed = JSON.parse(str);
    } catch {
      const jsonStr = str
        .replace(/\/\/[^\n]*/g, '')
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
      parsed = JSON.parse(jsonStr);
    }
    if (!parsed.apiKey || !parsed.projectId) throw new Error('Missing fields');
    localStorage.setItem('wl-firebase', JSON.stringify(parsed));
    S.db = null;
    if (initFirebase()) {
      toast('Firebase connected! 🎉', 'success');
      navigateTo('home');
    } else {
      throw new Error('Init failed');
    }
  } catch (e) {
    console.error('Config parse error:', e);
    toast('Could not read config — paste the snippet from Firebase console', 'error');
  }
}
window.saveFirebaseConfig = saveFirebaseConfig;

// =========================================================
// AUTH UI
// =========================================================
function updateAuthUI() {
  const area = document.getElementById('auth-area');
  const myListsBtn = document.getElementById('my-lists-btn');
  if (!area) return;

  if (S.user) {
    const name  = (S.user.displayName || S.user.email || 'User').split(' ')[0];
    const photo = S.user.photoURL || '';
    const avatar = photo
      ? `<img src="${photo}" class="auth-avatar" referrerpolicy="no-referrer" alt="${esc(name)}" />`
      : `<div class="auth-avatar-fallback">${name[0].toUpperCase()}</div>`;
    area.innerHTML = `<button class="auth-user-btn" onclick="handleAuthClick()">${avatar}<span>${esc(name)}</span></button>`;
    if (myListsBtn) myListsBtn.style.display = 'flex';
  } else {
    area.innerHTML = `<button class="btn btn-primary btn-sm" onclick="handleAuthClick()">Sign In</button>`;
    if (myListsBtn) myListsBtn.style.display = 'none';
  }
}

async function handleAuthClick() {
  if (!S.auth) { toast('Set up Firebase first', 'info'); return; }
  if (S.user) {
    try {
      await signOut(S.auth);
      navigateTo('home');
      toast('Signed out', 'info');
    } catch { toast('Sign out failed', 'error'); }
  } else {
    try {
      await signInWithPopup(S.auth, new GoogleAuthProvider());
      toast('Signed in! 🎉', 'success');
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') {
        console.error(e);
        toast('Sign in failed — check your Firebase has Authentication enabled', 'error');
      }
    }
  }
}
window.handleAuthClick = handleAuthClick;

// =========================================================
// ROUTING
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
      if (authResolved && !S.user) { toast('Sign in to create a list', 'info'); return; }
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
      if (authResolved && !S.user) { toast('Sign in to see your lists', 'info'); return; }
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

function goCreate() { navigateTo('create'); }
window.goCreate = goCreate;

// =========================================================
// MODALS
// =========================================================
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
window.closeModal = closeModal;

document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.overlay.open').forEach(o => closeModal(o.id));
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
    const data = {
      id: listId, name, ownerName: owner, occasion: occ, items: [],
      createdAt: Date.now(),
      ownerUid:   S.user ? S.user.uid   : null,
      ownerEmail: S.user ? S.user.email : null
    };
    await setDoc(doc(S.db, 'lists', listId), data);

    const mine = getMyListsLocal();
    mine.unshift({ id: listId, name, ownerName: owner, occasion: occ, createdAt: Date.now() });
    saveMyListsLocal(mine);

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
  S.listId   = listId;
  S.isOwner  = true;
  const container = document.getElementById('manage-items');
  container.innerHTML = '<div class="loading-state"><div class="spinner spinner-lg"></div><p style="margin-top:0.75rem;">Loading your list…</p></div>';

  try {
    const snap = await getDoc(doc(S.db, 'lists', listId));
    if (!snap.exists()) { container.innerHTML = notFoundHtml(); return; }

    const data = snap.data();
    S.listData = data;

    // If list has an owner and it doesn't match current user, deny management
    if (data.ownerUid && S.user && data.ownerUid !== S.user.uid) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔒</div>
          <h3>Not your list</h3>
          <p>You can only manage lists you created.</p>
          <button class="btn btn-primary" style="margin-top:1rem;" onclick="navigateTo('buyer',{listId:'${listId}'})">View as Buyer →</button>
        </div>`;
      return;
    }

    document.getElementById('manage-title').textContent = data.name;
    document.getElementById('manage-breadcrumb').textContent = data.name;
    document.getElementById('manage-occasion').textContent = occasionLabel(data.occasion);
    document.title = data.name + ' — Wishlist';
    renderManageItems(data.items || []);
  } catch (e) {
    console.error(e);
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading list</h3><p>Check your connection.</p></div>';
  }
}

function renderManageItems(items) {
  const c = document.getElementById('manage-items');
  if (!items.length) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">🎁</div><h3>No items yet</h3><p>Add your first item using the button above.</p></div>';
    return;
  }
  c.innerHTML =
    '<p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.25rem;">' +
    '<span class="count-badge">' + items.length + ' item' + (items.length !== 1 ? 's' : '') + '</span>' +
    '&nbsp; Bought items are hidden from this view ✨</p>' +
    '<div class="items-grid" id="manage-grid"></div>';
  const grid = document.getElementById('manage-grid');
  items.forEach((item, i) => grid.appendChild(buildItemCard(item, i, true)));
}

// =========================================================
// ITEM CARDS
// =========================================================
function buildItemCard(item, idx, isOwner) {
  const div = document.createElement('div');
  div.className = 'item-card' + ((!isOwner && item.bought) ? ' bought' : '');
  div.style.animationDelay = (idx * 0.06) + 's';

  const hasImg = item.imageUrl && item.imageUrl.trim();
  const imgBlock = hasImg
    ? `<img class="item-img" src="${esc(item.imageUrl)}" alt="${esc(item.name)}" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="item-img-placeholder" style="display:none;">🎁</div>`
    : `<div class="item-img-placeholder">🎁</div>`;

  let actions = '';
  if (isOwner) {
    actions =
      (item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">🔗 Link</a>` : '') +
      `<button class="btn btn-secondary btn-sm" onclick="openEditItemModal('${item.id}')">Edit</button>` +
      `<button class="btn btn-danger btn-sm" onclick="askDeleteItem('${item.id}')">Remove</button>`;
  } else if (item.bought) {
    actions = '<span class="bought-badge">✓ Bought</span>';
  } else {
    actions =
      (item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">🔗 View</a>` : '') +
      `<button class="btn btn-primary btn-sm" onclick="askMarkBought('${item.id}')">I'll buy this!</button>`;
  }

  div.innerHTML = imgBlock +
    '<div class="item-body">' +
      `<div class="item-name">${esc(item.name)}</div>` +
      (item.price ? `<div class="item-price">${esc(item.price)}</div>` : '') +
      (item.notes ? `<div class="item-notes">${esc(item.notes)}</div>` : '') +
      `<div class="item-actions">${actions}</div>` +
    '</div>';
  return div;
}

// =========================================================
// ADD / EDIT ITEM MODAL
// =========================================================
function openAddItemModal() {
  S.editingItemId = null;
  clearItemForm();
  document.querySelector('#modal-add-item .modal-head h2').textContent = 'Add Item';
  document.getElementById('add-item-submit').textContent = 'Add Item';
  openModal('modal-add-item');
}
window.openAddItemModal = openAddItemModal;

function openEditItemModal(itemId) {
  const item = S.listData && S.listData.items.find(it => it.id === itemId);
  if (!item) return;
  S.editingItemId = itemId;
  clearItemForm();
  document.getElementById('item-url').value   = item.url      || '';
  document.getElementById('item-name').value  = item.name     || '';
  document.getElementById('item-price').value = item.price    || '';
  document.getElementById('item-image').value = item.imageUrl || '';
  document.getElementById('item-notes').value = item.notes    || '';
  document.querySelector('#modal-add-item .modal-head h2').textContent = 'Edit Item';
  document.getElementById('add-item-submit').textContent = 'Save Changes';
  // Show image preview if URL exists
  if (item.imageUrl) {
    const prev = document.getElementById('fetch-preview');
    const fpImg = document.getElementById('fp-img');
    prev.classList.remove('hidden');
    fpImg.src = item.imageUrl;
    fpImg.style.display = 'block';
    document.getElementById('fp-title').textContent = item.name || '';
    document.getElementById('fp-desc').textContent  = '';
  }
  openModal('modal-add-item');
}
window.openEditItemModal = openEditItemModal;

function clearItemForm() {
  ['item-url','item-name','item-price','item-image','item-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('fetch-preview').classList.add('hidden');
}

async function fetchFromUrl() {
  const url = document.getElementById('item-url').value.trim();
  if (!url) { toast('Paste a URL first', 'error'); return; }
  const btn = document.getElementById('fetch-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const res  = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(url));
    const json = await res.json();
    if (json.status === 'success') {
      const d     = json.data;
      const title = d.title || '';
      const desc  = d.description || '';

      // Image: try image field, then logo as last resort
      const image = (d.image && d.image.url) || (d.logo && d.logo.url) || '';

      // Price: Microlink returns price as string or {amount, currency} object
      let price = '';
      if (d.price) {
        price = typeof d.price === 'string'
          ? d.price
          : (d.price.amount ? (d.price.currency || '') + d.price.amount : '');
      }

      if (title) document.getElementById('item-name').value  = title;
      if (image) document.getElementById('item-image').value = image;
      if (price) document.getElementById('item-price').value = price;

      const prev = document.getElementById('fetch-preview');
      prev.classList.remove('hidden');
      const fpImg = document.getElementById('fp-img');
      if (image) { fpImg.src = image; fpImg.style.display = 'block'; fpImg.referrerPolicy = 'no-referrer'; }
      else fpImg.style.display = 'none';
      document.getElementById('fp-title').textContent = title || 'No title found';
      document.getElementById('fp-desc').textContent  = desc ? desc.slice(0, 100) + (desc.length > 100 ? '…' : '') : '';

      toast('Details fetched ✓', 'success');
    } else {
      toast('Could not auto-fill — fill in manually', 'info');
    }
  } catch {
    toast('Fetch failed — please fill in manually', 'info');
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
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  const fields = {
    name,
    url:      document.getElementById('item-url').value.trim(),
    imageUrl: document.getElementById('item-image').value.trim(),
    price:    document.getElementById('item-price').value.trim(),
    notes:    document.getElementById('item-notes').value.trim()
  };

  try {
    let newItems;
    if (S.editingItemId) {
      // Edit existing item
      newItems = S.listData.items.map(it =>
        it.id === S.editingItemId ? { ...it, ...fields } : it
      );
    } else {
      // Add new item
      newItems = [...(S.listData.items || []), {
        id: uid(), ...fields, bought: false, boughtAt: null, createdAt: Date.now()
      }];
    }
    await updateDoc(doc(S.db, 'lists', S.listId), { items: newItems });
    S.listData.items = newItems;
    renderManageItems(newItems);
    closeModal('modal-add-item');
    toast(S.editingItemId ? 'Item updated ✓' : 'Item added! 🎉', 'success');
    S.editingItemId = null;
  } catch (e) {
    console.error(e);
    toast('Error saving item — please try again', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = S.editingItemId ? 'Save Changes' : 'Add Item';
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
  S.listId  = listId;
  S.isOwner = false;
  const container = document.getElementById('buyer-items');
  container.innerHTML = '<div class="loading-state"><div class="spinner spinner-lg"></div><p style="margin-top:0.75rem;">Loading wishlist…</p></div>';
  document.getElementById('buyer-progress').style.display = 'none';

  try {
    const snap = await getDoc(doc(S.db, 'lists', listId));
    if (!snap.exists()) { container.innerHTML = notFoundHtml(); return; }

    const data = snap.data();
    S.listData = data;
    document.getElementById('buyer-title').textContent  = data.name;
    document.getElementById('buyer-occasion').textContent = occasionLabel(data.occasion);
    document.getElementById('buyer-owner').innerHTML =
      '<span style="color:var(--text-muted);">by </span><strong>' + esc(data.ownerName) + '</strong>';
    document.title = data.ownerName + "'s " + data.name + ' — Wishlist';
    renderBuyerItems(data.items || []);
    updateProgress(data.items || []);
  } catch (e) {
    console.error(e);
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading wishlist</h3><p>Check your connection.</p></div>';
  }
}

function renderBuyerItems(items) {
  const c = document.getElementById('buyer-items');
  if (!items.length) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">🎁</div><h3>Nothing here yet</h3><p>This wishlist is empty — check back soon!</p></div>';
    return;
  }
  const available = items.filter(it => !it.bought);
  const bought    = items.filter(it =>  it.bought);
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
  const old   = document.getElementById('confirm-bought-btn');
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
    toast("Marked as bought! The surprise is safe 🎉", 'success');
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
function getMyListsLocal() {
  try { return JSON.parse(localStorage.getItem('wl-my-lists') || '[]'); }
  catch { return []; }
}
function saveMyListsLocal(lists) {
  localStorage.setItem('wl-my-lists', JSON.stringify(lists));
}

async function renderMyLists() {
  const c = document.getElementById('mylists-content');
  c.innerHTML = '<div class="loading-state"><div class="spinner spinner-lg"></div><p style="margin-top:0.75rem;">Loading your lists…</p></div>';

  let lists = [];

  // Query Firestore for lists owned by current user
  if (S.user) {
    try {
      const q    = query(collection(S.db, 'lists'), where('ownerUid', '==', S.user.uid));
      const snap = await getDocs(q);
      const remote = snap.docs.map(d => d.data());

      // Merge with local lists (deduplicate by id)
      const local     = getMyListsLocal();
      const remoteIds = new Set(remote.map(l => l.id));
      const localOnly = local.filter(l => !remoteIds.has(l.id));
      lists = [...remote, ...localOnly].sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error(e);
      lists = getMyListsLocal();
    }
  } else {
    lists = getMyListsLocal();
  }

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
      '<p style="font-size:0.84rem;color:var(--text-muted);">by ' + esc(list.ownerName) + '</p>' +
      '<div class="list-meta">Created ' + timeAgo(list.createdAt) + '</div>' +
      '<div class="list-card-actions">' +
        '<button class="btn btn-primary btn-sm" onclick="navigateTo(\'manage\',{listId:\'' + list.id + '\'})">Manage</button>' +
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
  return { birthday:'🎂 Birthday', christmas:'🎄 Christmas', wedding:'💍 Wedding',
    'baby-shower':'👶 Baby Shower', graduation:'🎓 Graduation', housewarming:'🏠 Housewarming',
    anniversary:'💕 Anniversary', other:'🎁 Other' }[o] || '🎁 Other';
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
initFirebase();
handleHash();
