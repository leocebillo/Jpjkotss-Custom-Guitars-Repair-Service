/* =========================================================
   Data layer for the shop and inventory.
   Pages only talk to these functions, so they work the same in
   demo mode (browser storage) and live mode (Firebase).
   ========================================================= */
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const isDemo = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('YOUR_');

export const CATEGORIES = ['Electric guitars', 'Acoustic guitars', 'Basses', 'Orchestra strings', 'Amps & effects', 'Accessories', 'Parts'];
export const CONDITIONS = ['New', 'Used', 'Custom build'];

/* ---------- helpers ---------- */
export const money = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 'sold' | 'low' | 'in' — low only when the item has a low-stock alert set */
export function stockStatus(p) {
  if (p.qty <= 0) return 'sold';
  if (p.lowStock > 0 && p.qty <= p.lowStock) return 'low';
  return 'in';
}

/** "Label: Value" lines -> [{label, value}] */
export function parseSpecs(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.indexOf(':');
    return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: '', value: l };
  });
}

const toMillis = v => (v && typeof v.toMillis === 'function') ? v.toMillis() : (typeof v === 'number' ? v : 0);

function norm(p) {
  return {
    id: p.id,
    sku: p.sku || '',
    name: p.name || 'Untitled item',
    category: p.category || CATEGORIES[0],
    brand: p.brand || '',
    condition: p.condition || 'New',
    price: Number(p.price) || 0,
    qty: Math.max(0, parseInt(p.qty, 10) || 0),
    lowStock: Math.max(0, parseInt(p.lowStock, 10) || 0),
    description: p.description || '',
    specs: p.specs || '',
    photos: Array.isArray(p.photos) ? p.photos : [],
    featured: !!p.featured,
    published: p.published !== false,
    createdAt: toMillis(p.createdAt),
    updatedAt: toMillis(p.updatedAt)
  };
}

function clean(p) {
  const n = norm(p);
  delete n.id; delete n.createdAt; delete n.updatedAt;
  if (!n.sku) n.sku = 'JPJ-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  return n;
}

function checkSize(data) {
  if (JSON.stringify(data).length > 900000) {
    throw new Error('The photos on this item are too large to save together. Remove a photo, or use an image path instead of an upload.');
  }
}

/* =========================================================
   Firebase (live mode)
   ========================================================= */
let fbPromise = null;
function fb() {
  if (!fbPromise) {
    fbPromise = Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-firestore.js'),
      import(SDK + 'firebase-auth.js')
    ]).then(([app, fs, au]) => {
      const a = app.initializeApp(firebaseConfig);
      return { db: fs.getFirestore(a), auth: au.getAuth(a), fs, au };
    });
  }
  return fbPromise;
}

const live = {
  async list(all) {
    const { db, fs } = await fb();
    const ref = fs.collection(db, 'products');
    const snap = await fs.getDocs(all ? ref : fs.query(ref, fs.where('published', '==', true)));
    return snap.docs.map(d => norm({ id: d.id, ...d.data() }));
  },
  async get(id) {
    const { db, fs } = await fb();
    try {
      const d = await fs.getDoc(fs.doc(db, 'products', id));
      return d.exists() ? norm({ id: d.id, ...d.data() }) : null;
    } catch (e) { return null; } // hidden items are unreadable to the public
  },
  async save(p, by) {
    const { db, fs } = await fb();
    const data = clean(p);
    checkSize(data);
    const logRef = fs.doc(fs.collection(db, 'stockLog'));
    if (p.id) {
      const ref = fs.doc(db, 'products', p.id);
      await fs.runTransaction(db, async tx => {
        const old = await tx.get(ref);
        const before = old.exists() ? (old.data().qty || 0) : 0;
        tx.set(ref, { ...data, updatedAt: fs.serverTimestamp() }, { merge: true });
        if (data.qty !== before) tx.set(logRef, logEntry(p.id, data, data.qty - before, 'Edited count', by, fs.serverTimestamp()));
      });
      return p.id;
    }
    const ref = fs.doc(fs.collection(db, 'products'));
    const batch = fs.writeBatch(db);
    batch.set(ref, { ...data, createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() });
    batch.set(logRef, logEntry(ref.id, data, data.qty, 'Added to inventory', by, fs.serverTimestamp()));
    await batch.commit();
    return ref.id;
  },
  async adjust(id, delta, reason, by) {
    const { db, fs } = await fb();
    const ref = fs.doc(db, 'products', id);
    return fs.runTransaction(db, async tx => {
      const d = await tx.get(ref);
      if (!d.exists()) throw new Error('That item no longer exists.');
      const p = norm({ id, ...d.data() });
      const qty = Math.max(0, p.qty + delta);
      if (qty === p.qty) return p.qty;
      tx.update(ref, { qty, updatedAt: fs.serverTimestamp() });
      tx.set(fs.doc(fs.collection(db, 'stockLog')), logEntry(id, p, qty - p.qty, reason, by, fs.serverTimestamp(), qty));
      return qty;
    });
  },
  async remove(id, by) {
    const { db, fs } = await fb();
    const ref = fs.doc(db, 'products', id);
    const d = await fs.getDoc(ref);
    const batch = fs.writeBatch(db);
    if (d.exists()) {
      const p = norm({ id, ...d.data() });
      batch.set(fs.doc(fs.collection(db, 'stockLog')), logEntry(id, p, -p.qty, 'Deleted item', by, fs.serverTimestamp(), 0));
    }
    batch.delete(ref);
    await batch.commit();
  },
  async log(n) {
    const { db, fs } = await fb();
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'stockLog'), fs.orderBy('at', 'desc'), fs.limit(n)));
    return snap.docs.map(d => ({ ...d.data(), at: toMillis(d.data().at) }));
  }
};

function logEntry(productId, p, change, reason, by, at, qtyAfter) {
  return { productId, name: p.name, sku: p.sku, change, qtyAfter: qtyAfter ?? p.qty, reason, by: by || '', at };
}

/* =========================================================
   Demo mode (browser storage, sample items)
   ========================================================= */
const KEY = 'jpjkotss-demo-v1';
let mem = null;
function demoData() {
  if (mem) return mem;
  try { const raw = localStorage.getItem(KEY); if (raw) mem = JSON.parse(raw); } catch (e) { /* storage blocked */ }
  if (!mem || !Array.isArray(mem.products)) mem = { products: seedProducts(), log: [] };
  return mem;
}
function demoSave() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); }
  catch (e) { throw new Error('This browser is out of room for demo data. Remove some uploaded photos and try again.'); }
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

const demo = {
  async list(all) { return demoData().products.map(norm).filter(p => all || p.published); },
  async get(id) { const p = demoData().products.find(x => x.id === id); return p ? norm(p) : null; },
  async save(p, by) {
    const d = demoData(), data = clean(p), now = Date.now();
    checkSize(data);
    if (p.id) {
      const i = d.products.findIndex(x => x.id === p.id);
      const before = i >= 0 ? norm(d.products[i]).qty : 0;
      const prev = i >= 0 ? d.products[i] : {};
      const next = { ...prev, ...data, id: p.id, updatedAt: now };
      if (i >= 0) d.products[i] = next; else d.products.push({ ...next, createdAt: now });
      if (data.qty !== before) d.log.unshift(logEntry(p.id, data, data.qty - before, 'Edited count', by, now));
      demoSave();
      return p.id;
    }
    const id = uid();
    d.products.push({ ...data, id, createdAt: now, updatedAt: now });
    d.log.unshift(logEntry(id, data, data.qty, 'Added to inventory', by, now));
    demoSave();
    return id;
  },
  async adjust(id, delta, reason, by) {
    const d = demoData(), raw = d.products.find(x => x.id === id);
    if (!raw) throw new Error('That item no longer exists.');
    const p = norm(raw), qty = Math.max(0, p.qty + delta);
    if (qty === p.qty) return qty;
    raw.qty = qty; raw.updatedAt = Date.now();
    d.log.unshift(logEntry(id, p, qty - p.qty, reason, by, Date.now(), qty));
    demoSave();
    return qty;
  },
  async remove(id, by) {
    const d = demoData(), i = d.products.findIndex(x => x.id === id);
    if (i < 0) return;
    const p = norm(d.products[i]);
    d.products.splice(i, 1);
    d.log.unshift(logEntry(id, p, -p.qty, 'Deleted item', by, Date.now(), 0));
    demoSave();
  },
  async log(n) { return demoData().log.slice(0, n); }
};

const impl = isDemo ? demo : live;

/* ---------- public API ---------- */
export const listProducts = (opts = {}) => impl.list(!!opts.all);
export const getProduct = id => impl.get(id);
export const saveProduct = (p, by) => impl.save(p, by);
export const adjustStock = (id, delta, reason, by) => impl.adjust(id, delta, reason, by);
export const deleteProduct = (id, by) => impl.remove(id, by);
export const listLog = (n = 25) => impl.log(n);
export function resetDemo() { mem = null; try { localStorage.removeItem(KEY); } catch (e) {} }

/* =========================================================
   Staff sign-in
   Live: Firebase email/password + an admins/{uid} document.
   Demo: any email/password, remembered for this browser tab.
   ========================================================= */
const DEMO_USER = 'jpjkotss-demo-user';

const AUTH_ERRORS = {
  'auth/invalid-credential': 'That email and password don’t match. Check them and try again.',
  'auth/wrong-password': 'That email and password don’t match. Check them and try again.',
  'auth/user-not-found': 'That email and password don’t match. Check them and try again.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, or reset your password.',
  'auth/network-request-failed': 'Couldn’t reach the server. Check your internet connection.'
};
const friendly = e => new Error(AUTH_ERRORS[e && e.code] || (e && e.message) || 'Sign-in failed.');

async function checkAdmin(user) {
  const { db, fs } = await fb();
  try { return (await fs.getDoc(fs.doc(db, 'admins', user.uid))).exists(); }
  catch (e) { return false; }
}

export function onAuth(cb) {
  if (isDemo) {
    let email = null;
    try { email = sessionStorage.getItem(DEMO_USER); } catch (e) {}
    setTimeout(() => cb(email ? { email, uid: 'demo' } : null), 0);
    return;
  }
  fb().then(({ auth, au }) => au.onAuthStateChanged(auth, async u => {
    if (!u) return cb(null);
    if (await checkAdmin(u)) return cb({ email: u.email, uid: u.uid });
    await au.signOut(auth);
    cb(null, 'not-admin');
  }));
}

export async function login(email, password) {
  email = String(email || '').trim();
  if (!email || !password) throw new Error('Enter your email and password.');
  if (isDemo) {
    try { sessionStorage.setItem(DEMO_USER, email); } catch (e) {}
    return { email, uid: 'demo' };
  }
  const { auth, au } = await fb();
  let cred;
  try { cred = await au.signInWithEmailAndPassword(auth, email, password); }
  catch (e) { throw friendly(e); }
  if (!(await checkAdmin(cred.user))) {
    await au.signOut(auth);
    throw new Error('This account isn’t set up as shop staff. Ask the site admin to add it.');
  }
  return { email: cred.user.email, uid: cred.user.uid };
}

export async function logout() {
  if (isDemo) { try { sessionStorage.removeItem(DEMO_USER); } catch (e) {} return; }
  const { auth, au } = await fb();
  await au.signOut(auth);
}

export async function resetPassword(email) {
  email = String(email || '').trim();
  if (!email) throw new Error('Enter your email first, then choose Forgot password.');
  if (isDemo) return;
  const { auth, au } = await fb();
  try { await au.sendPasswordResetEmail(auth, email); } catch (e) { throw friendly(e); }
}

/* ---------- sample inventory for demo mode ---------- */
function seedProducts() {
  const t = Date.now(), day = 864e5;
  const items = [
    { name: 'JPJ Custom T-Style Electric', category: 'Electric guitars', brand: 'JPJKOTSS', condition: 'Custom build', price: 1450, qty: 1, featured: true,
      description: 'A one-off T-style built in the shop. Lightweight ash body, a comfortable C-shape maple neck, and a fresh setup with low action.',
      specs: 'Body: Swamp ash\nNeck: Maple, C shape\nFingerboard radius: 9.5″\nScale: 25.5″\nPickups: Single-coil pair\nFinish: Two-tone sunburst' },
    { name: 'Dreadnought Acoustic, Solid Spruce Top', category: 'Acoustic guitars', brand: '', condition: 'Used', price: 425, qty: 1, featured: true,
      description: 'Pre-owned dreadnought with a solid spruce top. Fully gone over on the bench: fret polish, new saddle, new strings and a full setup.',
      specs: 'Top: Solid spruce\nBack & sides: Mahogany\nNut width: 1 11/16″\nWork done: Setup, new saddle, new strings' },
    { name: '4/4 Student Violin Outfit', category: 'Orchestra strings', brand: '', condition: 'New', price: 289, qty: 3, lowStock: 1, featured: true,
      description: 'Ready-to-play outfit for students. Every violin gets its bridge and soundpost fitted in the shop before it goes out.',
      specs: 'Size: 4/4\nIncludes: Bow, case, rosin\nShop setup: Bridge and soundpost fitted' },
    { name: 'Short-Scale Electric Bass', category: 'Basses', brand: '', condition: 'Used', price: 340, qty: 1,
      description: 'Short-scale bass that’s easy on smaller hands. New strings and an adjusted truss rod.',
      specs: 'Scale: 30″\nPickups: Split single-coil\nWork done: Setup, new strings' },
    { name: '15-Watt Practice Amp', category: 'Amps & effects', brand: '', condition: 'Used', price: 85, qty: 2,
      description: 'Small practice amp, tested and cleaned. Good first amp.', specs: 'Power: 15 W\nSpeaker: 8″\nInputs: Instrument, aux, headphone out' },
    { name: 'Electric Strings, Nickel 10–46', category: 'Accessories', brand: '', condition: 'New', price: 8.99, qty: 24, lowStock: 6,
      description: 'Regular-light nickel-wound strings. The gauge most electric guitars ship with.', specs: 'Gauges: 10, 13, 17, 26, 36, 46\nMaterial: Nickel-plated steel' },
    { name: 'Bone Nut Blank, Unslotted', category: 'Parts', brand: '', condition: 'New', price: 12, qty: 4, lowStock: 5,
      description: 'Unbleached bone nut blank for shaping and slotting. Ask about having us fit it for you.', specs: 'Material: Bone\nSize: 52 × 6 × 10 mm' },
    { name: 'JPJ Custom Offset Electric', category: 'Electric guitars', brand: 'JPJKOTSS', condition: 'Custom build', price: 1650, qty: 0,
      description: 'An offset-body custom build. This one has sold, but we can build another to your spec.', specs: 'Body: Alder\nNeck: Roasted maple\nScale: 25.5″' },
    { name: 'Consignment Acoustic (on hold)', category: 'Acoustic guitars', brand: '', condition: 'Used', price: 600, qty: 1, published: false,
      description: 'Waiting on photos from the owner before listing.', specs: '' }
  ];
  return items.map((p, i) => ({ ...p, id: 'sample-' + (i + 1), sku: 'JPJ-' + String(101 + i), photos: [], createdAt: t - i * day, updatedAt: t - i * day }));
}
