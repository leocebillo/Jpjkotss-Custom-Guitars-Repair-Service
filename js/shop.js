/* Shop listing, item page, and featured items on the home page.
   Each part runs only if its container is on the page. */
import * as store from './store.js';

const { esc, money, stockStatus } = store;
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);

/* ---------- shared bits ---------- */
function photo(p, cls) {
  const src = p.photos[0];
  return src
    ? `<div class="${cls} has-img"><img src="${esc(src)}" alt="${esc(p.name)}" loading="lazy"></div>`
    : `<div class="${cls}"><span class="ph">${esc(p.category)}</span></div>`;
}
function stockPill(p) {
  return p.qty > 0 ? '<span class="pill s-in">In stock</span>' : '<span class="pill s-sold">Sold</span>';
}
function card(p) {
  const sold = p.qty <= 0;
  return `<a class="card${sold ? ' is-sold' : ''}" href="item.html?id=${encodeURIComponent(p.id)}">
    ${photo(p, 'card-photo')}
    <div class="card-body">
      <div class="card-meta"><span>${esc(p.brand || p.category)}</span><span class="pill cond">${esc(p.condition)}</span></div>
      <h3>${esc(p.name)}</h3>
      <div class="card-foot"><span class="price">${money(p.price)}</span>${stockPill(p)}</div>
    </div>
  </a>`;
}
function showDemoNote() {
  const n = $('#demo-note');
  if (n && store.isDemo) n.hidden = false;
}
const byFeatured = (a, b) => (b.featured - a.featured) || (b.createdAt - a.createdAt);

/* ---------- shop.html ---------- */
async function initShop() {
  showDemoNote();
  const grid = $('#shop-grid'), count = $('#result-count'), chipsEl = $('#cat-chips');
  const state = { q: '', cat: params.get('cat') || 'All', cond: 'All', sort: 'featured', inStock: false };

  chipsEl.innerHTML = ['All', ...store.CATEGORIES].map(c =>
    `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="${c === state.cat}">${esc(c)}</button>`).join('');
  $('#f-cond').innerHTML = '<option value="All">Any condition</option>' + store.CONDITIONS.map(c => `<option>${esc(c)}</option>`).join('');

  let items = [];
  try { items = await store.listProducts(); }
  catch (e) { grid.innerHTML = `<div class="empty"><b>The shop couldn’t load.</b>Refresh the page, or call 956-651-0999 to ask what’s in stock.</div>`; console.error(e); return; }

  function render() {
    const q = state.q.toLowerCase();
    let list = items.filter(p =>
      (state.cat === 'All' || p.category === state.cat) &&
      (state.cond === 'All' || p.condition === state.cond) &&
      (!state.inStock || p.qty > 0) &&
      (!q || [p.name, p.brand, p.category, p.description, p.sku].join(' ').toLowerCase().includes(q)));
    const sorts = {
      featured: (a, b) => ((b.qty > 0) - (a.qty > 0)) || byFeatured(a, b),
      newest: (a, b) => b.createdAt - a.createdAt,
      low: (a, b) => a.price - b.price,
      high: (a, b) => b.price - a.price
    };
    list.sort(sorts[state.sort]);
    count.textContent = `${list.length} item${list.length === 1 ? '' : 's'}`;
    grid.innerHTML = list.length ? list.map(card).join('')
      : `<div class="empty" style="grid-column:1/-1"><b>Nothing matches that search.</b>Try a different category, or call the shop. We may have it in the back.</div>`;
  }

  chipsEl.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.cat = b.dataset.cat;
    chipsEl.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === b));
    render();
  });
  $('#f-search').addEventListener('input', e => { state.q = e.target.value; render(); });
  $('#f-cond').addEventListener('change', e => { state.cond = e.target.value; render(); });
  $('#f-sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
  $('#f-instock').addEventListener('change', e => { state.inStock = e.target.checked; render(); });
  render();
}

/* ---------- item.html ---------- */
async function initItem() {
  showDemoNote();
  const view = $('#item-view');
  const id = params.get('id') || location.hash.slice(1);
  const p = id ? await store.getProduct(id).catch(() => null) : null;
  if (!p || !p.published) {
    view.innerHTML = `<div class="empty"><b>This item isn’t available.</b>It may have sold or been taken down. <a class="text-link" href="shop.html">Back to the shop</a></div>`;
    return;
  }
  document.title = `${p.name} | JPJKOTSS Custom Guitars`;
  const specs = store.parseSpecs(p.specs);
  const ask = `contact.html?item=${encodeURIComponent(p.sku + ' – ' + p.name)}`;
  const sold = p.qty <= 0;

  view.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="shop.html">Shop</a><span>/</span><a href="shop.html?cat=${encodeURIComponent(p.category)}">${esc(p.category)}</a></nav>
    <div class="item-grid">
      <div>
        <div id="g-main">${p.photos[0] ? `<div class="gallery-main has-img"><img src="${esc(p.photos[0])}" alt="${esc(p.name)}"></div>` : `<div class="gallery-main"><span class="ph">Photo coming soon</span></div>`}</div>
        ${p.photos.length > 1 ? `<div class="thumbs">${p.photos.map((src, i) => `<button type="button" data-i="${i}" aria-current="${i === 0}" aria-label="Photo ${i + 1}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div class="item-info">
        <p class="eyebrow">${esc(p.category)}${p.brand ? ' · ' + esc(p.brand) : ''}</p>
        <h1>${esc(p.name)}</h1>
        <div class="item-tags">${stockPill(p)}<span class="pill cond">${esc(p.condition)}</span>${p.featured ? '<span class="pill feat">Featured</span>' : ''}</div>
        <div class="item-price">${money(p.price)}</div>
        ${p.description ? `<p class="item-desc">${esc(p.description)}</p>` : ''}
        <div class="item-cta">
          ${sold
            ? `<a class="btn btn-dark" href="${ask}">Ask about a similar one</a>`
            : `<a class="btn btn-primary" href="tel:+19566510999">Call to buy · <span class="mono">956-651-0999</span></a>
               <a class="btn btn-outline" href="${ask}">Ask about this item</a>`}
          <p class="fine">Buy in person at 229 S. Texas Blvd. Ste C, Weslaco. Call first to confirm it’s still here.</p>
        </div>
        ${specs.length ? `<dl class="specs">${specs.map(s => `<div><dt>${esc(s.label || 'Note')}</dt><dd>${esc(s.value)}</dd></div>`).join('')}</dl>` : ''}
        <span class="sku">SKU ${esc(p.sku)}</span>
      </div>
    </div>`;

  view.querySelectorAll('.thumbs button').forEach(b => b.addEventListener('click', () => {
    const src = p.photos[+b.dataset.i];
    $('#g-main').innerHTML = `<div class="gallery-main has-img"><img src="${esc(src)}" alt="${esc(p.name)}"></div>`;
    view.querySelectorAll('.thumbs button').forEach(x => x.setAttribute('aria-current', x === b));
  }));

  const related = $('#related-grid');
  if (related) {
    const all = await store.listProducts().catch(() => []);
    const more = all.filter(x => x.id !== p.id && x.category === p.category && x.qty > 0).slice(0, 4);
    if (more.length) { related.innerHTML = more.map(card).join(''); $('#related').hidden = false; }
  }
}

/* ---------- index.html: featured items ---------- */
async function initFeatured() {
  const all = await store.listProducts().catch(() => []);
  const list = all.filter(p => p.featured && p.qty > 0).sort(byFeatured).slice(0, 4);
  const fill = list.length ? list : all.filter(p => p.qty > 0).sort(byFeatured).slice(0, 4);
  if (!fill.length) return;
  $('#featured-grid').innerHTML = fill.map(card).join('');
  $('#featured').hidden = false;
}

if ($('#shop-grid')) initShop();
if ($('#item-view')) initItem();
if ($('#featured-grid')) initFeatured();
