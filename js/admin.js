/* Staff area: sign-in page and inventory dashboard. */
import * as store from './store.js';

const { esc, money, stockStatus } = store;
const $ = s => document.querySelector(s);
const page = document.body.dataset.page;

// Photo paths are relative to the site root; admin pages live one folder down.
const src = u => /^(https?:|data:|blob:|\/)/.test(u) ? u : '../' + u;

let toastTimer;
function toast(msg, isErr) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.toggle('err', !!isErr); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), isErr ? 5000 : 2400);
}

/* =========================================================
   Login page
   ========================================================= */
function initLogin() {
  const form = $('#login-form'), msg = $('#login-msg'), btn = $('#l-submit');
  if (store.isDemo) $('#demo-hint').hidden = false;
  const say = (text, kind) => { msg.textContent = text; msg.className = 'login-msg ' + (kind || ''); };

  store.onAuth((user, reason) => {
    if (user) location.replace('index.html');
    else if (reason === 'not-admin') say('This account isn’t set up as shop staff. Ask the site admin to add it.', 'err');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    btn.disabled = true; say('Signing in…');
    try { await store.login(form.email.value, form.password.value); location.replace('index.html'); }
    catch (err) { say(err.message, 'err'); btn.disabled = false; }
  });

  $('#forgot').addEventListener('click', async () => {
    try {
      await store.resetPassword(form.email.value);
      say(store.isDemo ? 'Password reset isn’t available in demo mode.' : 'Check your email for a link to reset your password.', 'ok');
    } catch (err) { say(err.message, 'err'); }
  });
}

/* =========================================================
   Inventory dashboard
   ========================================================= */
function initInventory() {
  let user = null, items = [], editing = null, photos = [];
  const filters = { q: '', cat: 'all', status: 'all' };

  store.onAuth(u => {
    if (!u) { location.replace('login.html'); return; }
    user = u;
    $('#who').textContent = u.email;
    document.body.classList.remove('locked');
    if (store.isDemo) $('#demo-banner').hidden = false;
    load();
  });

  $('#signout').addEventListener('click', async () => { await store.logout(); location.replace('login.html'); });
  $('#demo-reset').addEventListener('click', () => { store.resetDemo(); load(); toast('Sample data restored'); });

  // filter + editor dropdowns
  $('#a-cat').innerHTML = '<option value="all">All categories</option>' + store.CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('');
  $('#e-category').innerHTML = store.CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('');
  $('#e-condition').innerHTML = store.CONDITIONS.map(c => `<option>${esc(c)}</option>`).join('');
  $('#a-search').addEventListener('input', e => { filters.q = e.target.value.toLowerCase(); renderTable(); });
  $('#a-cat').addEventListener('change', e => { filters.cat = e.target.value; renderTable(); });
  $('#a-status').addEventListener('change', e => { filters.status = e.target.value; renderTable(); });

  async function load() {
    try {
      items = await store.listProducts({ all: true });
      renderStats(); renderTable(); renderLog();
    } catch (err) {
      console.error(err);
      $('#inv-body').innerHTML = `<tr><td colspan="7" class="inv-empty">Couldn’t load inventory. Check your connection and refresh. (${esc(err.message)})</td></tr>`;
    }
  }

  function renderStats() {
    const listed = items.filter(p => p.published);
    const units = items.reduce((n, p) => n + p.qty, 0);
    const value = items.reduce((n, p) => n + p.qty * p.price, 0);
    const sold = items.filter(p => stockStatus(p) === 'sold' && p.published).length;
    const low = items.filter(p => stockStatus(p) === 'low').length;
    $('#st-listed').textContent = listed.length;
    $('#st-listed-sub').textContent = `of ${items.length} item${items.length === 1 ? '' : 's'} (${items.length - listed.length} hidden)`;
    $('#st-units').textContent = units.toLocaleString();
    $('#st-value').textContent = money(Math.round(value));
    $('#st-attn').textContent = sold + low;
    $('#st-attn-sub').textContent = `${low} low · ${sold} sold out & still listed`;
    $('#st-attn-tile').classList.toggle('alert', sold + low > 0);
  }

  function statusPill(p) {
    const s = stockStatus(p);
    if (s === 'sold') return '<span class="pill s-sold">Sold out</span>';
    if (s === 'low') return `<span class="pill s-low">Low</span>`;
    return '<span class="pill s-in">In stock</span>';
  }

  function renderTable() {
    const list = items.filter(p => {
      const s = stockStatus(p);
      return (filters.cat === 'all' || p.category === filters.cat) &&
        (filters.status === 'all' || (filters.status === 'hidden' ? !p.published : s === filters.status)) &&
        (!filters.q || (p.name + ' ' + p.sku + ' ' + p.brand).toLowerCase().includes(filters.q));
    }).sort((a, b) => a.name.localeCompare(b.name));

    $('#inv-body').innerHTML = list.length ? list.map(p => `
      <tr data-id="${esc(p.id)}" class="${p.published ? '' : 'is-hidden'}">
        <td><div class="c-item">
          <span class="thumb">${p.photos[0] ? `<img src="${esc(src(p.photos[0]))}" alt="">` : esc(p.category.slice(0, 3).toUpperCase())}</span>
          <span><b>${esc(p.name)}</b><span class="sku">${esc(p.sku)} · ${esc(p.condition)}</span></span>
        </div></td>
        <td class="c-cat">${esc(p.category)}</td>
        <td class="c-price">${money(p.price)}</td>
        <td><div class="stepper">
          <button type="button" data-act="dec" aria-label="Remove one ${esc(p.name)}" ${p.qty <= 0 ? 'disabled' : ''}>−</button>
          <output>${p.qty}</output>
          <button type="button" data-act="inc" aria-label="Add one ${esc(p.name)}">+</button>
        </div></td>
        <td>${statusPill(p)}</td>
        <td><label class="switch"><input type="checkbox" data-act="pub" ${p.published ? 'checked' : ''} aria-label="Show ${esc(p.name)} in shop"><i></i></label></td>
        <td><button class="link-btn" type="button" data-act="edit">Edit</button></td>
      </tr>`).join('')
      : `<tr><td colspan="7" class="inv-empty">${items.length ? 'No items match these filters.' : 'No items yet. Choose “+ Add item” to list the first one.'}</td></tr>`;
  }

  function renderLog() {
    store.listLog(15).then(log => {
      $('#log').innerHTML = log.length ? log.map(l => {
        const d = new Date(l.at);
        const when = isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        const cls = l.change > 0 ? 'up' : l.change < 0 ? 'down' : '';
        return `<li><span class="chg ${cls}">${l.change > 0 ? '+' : ''}${l.change}</span>
          <span class="what">${esc(l.name)} <small>${esc(l.reason)} · now ${l.qtyAfter}${l.by ? ' · ' + esc(l.by) : ''}</small></span>
          <time>${when}</time></li>`;
      }).join('') : '<li><span></span><span class="what"><small>Stock changes will show here.</small></span><span></span></li>';
    }).catch(() => { $('#log').innerHTML = ''; });
  }

  // Row actions
  $('#inv-body').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.dataset.act === 'pub') return;
    const id = b.closest('tr').dataset.id, p = items.find(x => x.id === id);
    if (b.dataset.act === 'edit') return openEditor(p);
    const delta = b.dataset.act === 'inc' ? 1 : -1;
    b.disabled = true;
    try {
      p.qty = await store.adjustStock(id, delta, delta > 0 ? 'Added stock' : 'Sold or removed', user.email);
      renderStats(); renderTable(); renderLog();
      toast(`${p.name}: ${p.qty} in stock`);
    } catch (err) { toast(err.message, true); b.disabled = false; }
  });
  $('#inv-body').addEventListener('change', async e => {
    if (e.target.dataset.act !== 'pub') return;
    const id = e.target.closest('tr').dataset.id, p = items.find(x => x.id === id);
    try {
      await store.saveProduct({ ...p, published: e.target.checked }, user.email);
      p.published = e.target.checked;
      renderStats(); renderTable();
      toast(p.published ? `${p.name} is now in the shop` : `${p.name} is hidden from the shop`);
    } catch (err) { e.target.checked = !e.target.checked; toast(err.message, true); }
  });

  /* ---------- Editor ---------- */
  const dlg = $('#editor'), form = $('#ed-form'), err = $('#ed-error'), del = $('#ed-delete');
  let armTimer;

  function openEditor(p) {
    editing = p || null;
    $('#ed-title').textContent = p ? 'Edit item' : 'Add item';
    $('#e-name').value = p ? p.name : '';
    $('#e-category').value = p ? p.category : store.CATEGORIES[0];
    $('#e-condition').value = p ? p.condition : 'New';
    $('#e-brand').value = p ? p.brand : '';
    $('#e-price').value = p ? p.price : '';
    $('#e-qty').value = p ? p.qty : 1;
    $('#e-low').value = p && p.lowStock ? p.lowStock : '';
    $('#e-sku').value = p ? p.sku : '';
    $('#e-desc').value = p ? p.description : '';
    $('#e-specs').value = p ? p.specs : '';
    $('#e-published').checked = p ? p.published : true;
    $('#e-featured').checked = p ? p.featured : false;
    photos = p ? p.photos.slice() : [];
    renderPhotos();
    err.hidden = true;
    del.hidden = !p; disarm();
    dlg.showModal();
    $('#e-name').focus();
  }
  const closeEditor = () => dlg.close();
  $('#add-btn').addEventListener('click', () => openEditor(null));
  $('#ed-close').addEventListener('click', closeEditor);
  $('#ed-cancel').addEventListener('click', closeEditor);

  function renderPhotos() {
    $('#e-photos').innerHTML = photos.map((u, i) => `
      <div class="photo-item"><img src="${esc(src(u))}" alt="Photo ${i + 1}">
        ${i === 0 ? '<span class="main-tag">Main</span>' : `<button type="button" class="mk" data-i="${i}" title="Make main photo" aria-label="Make photo ${i + 1} the main photo">★</button>`}
        <button type="button" class="rm" data-i="${i}" aria-label="Remove photo ${i + 1}">✕</button>
      </div>`).join('');
  }
  $('#e-photos').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.dataset.i;
    if (b.classList.contains('rm')) photos.splice(i, 1);
    else photos.unshift(photos.splice(i, 1)[0]);
    renderPhotos();
  });
  $('#e-url-add').addEventListener('click', () => {
    const v = $('#e-url').value.trim(); if (!v) return;
    photos.push(v); $('#e-url').value = ''; renderPhotos();
  });
  $('#e-file').addEventListener('change', async e => {
    for (const f of e.target.files) {
      try { photos.push(await shrink(f)); } catch (x) { showErr(x.message); }
    }
    e.target.value = ''; renderPhotos();
  });

  function showErr(m) { err.textContent = m; err.hidden = false; }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#e-name').value.trim(), price = parseFloat($('#e-price').value), qty = parseInt($('#e-qty').value, 10);
    if (!name) { showErr('Give the item a name.'); return $('#e-name').focus(); }
    if (!(price >= 0)) { showErr('Enter a price (use 0 if it’s not for sale yet).'); return $('#e-price').focus(); }
    if (!(qty >= 0)) { showErr('Enter how many are in stock (0 or more).'); return $('#e-qty').focus(); }
    const data = {
      id: editing && editing.id, name, price, qty,
      category: $('#e-category').value, condition: $('#e-condition').value, brand: $('#e-brand').value.trim(),
      lowStock: parseInt($('#e-low').value, 10) || 0, sku: $('#e-sku').value.trim(),
      description: $('#e-desc').value.trim(), specs: $('#e-specs').value.trim(), photos,
      published: $('#e-published').checked, featured: $('#e-featured').checked
    };
    const save = $('#ed-save'); save.disabled = true;
    try {
      await store.saveProduct(data, user.email);
      closeEditor(); await load();
      toast(editing ? 'Changes saved' : `${name} added`);
    } catch (x) { showErr(x.message); }
    save.disabled = false;
  });

  // Delete needs a second click to confirm.
  function disarm() { del.classList.remove('armed'); del.textContent = 'Delete item'; clearTimeout(armTimer); }
  del.addEventListener('click', async () => {
    if (!del.classList.contains('armed')) {
      del.classList.add('armed'); del.textContent = 'Click again to delete';
      armTimer = setTimeout(disarm, 4000); return;
    }
    try {
      await store.deleteProduct(editing.id, user.email);
      closeEditor(); await load(); toast(`${editing.name} deleted`);
    } catch (x) { showErr(x.message); disarm(); }
  });
}

/** Resize an uploaded photo to max 1000px JPEG so it fits in the database. */
function shrink(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error(`${file.name} isn’t an image.`));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 1000 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} couldn’t be opened as an image.`)); };
    img.src = url;
  });
}

if (page === 'login') initLogin();
if (page === 'inventory') initInventory();
