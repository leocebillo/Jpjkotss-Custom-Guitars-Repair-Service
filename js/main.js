/* JPJKOTSS Custom Guitars — shared site script.
   Every feature checks that its element exists, so this one file
   is safe to load on every page. */
(function () {
  // --- Mobile menu ---
  var menuBtn = document.querySelector('.menu-btn');
  var links = document.getElementById('nav-links');
  if (menuBtn && links) {
    menuBtn.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // --- Highlight the current page in the nav ---
  var here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });

  // --- Footer year ---
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // --- Fretboard (home page). Fret distance from nut = L * (1 - 2^(-n/12)),
  //     normalized to the last fret so the board fills the width. ---
  var board = document.getElementById('board');
  var nums = document.getElementById('fretnums');
  if (board && nums) {
    var FRETS = 17, end = 1 - Math.pow(2, -FRETS / 12);
    var pos = function (n) { return (1 - Math.pow(2, -n / 12)) / end * 100; };
    var single = [3, 5, 7, 9, 15, 17], labeled = [3, 5, 7, 9, 12, 15, 17];
    var add = function (cls, left, top) {
      var el = document.createElement('div');
      el.className = cls; el.style.left = left + '%';
      if (top != null) el.style.top = top + '%';
      board.appendChild(el); return el;
    };
    for (var n = 1; n <= FRETS; n++) {
      add('fret', pos(n));
      var mid = (pos(n - 1) + pos(n)) / 2;
      if (single.indexOf(n) >= 0) add('dot', mid, 50);
      if (n === 12) { add('dot', mid, 30); add('dot', mid, 70); }
      var lab = document.createElement('span');
      lab.textContent = n; lab.style.left = mid + '%';
      if (labeled.indexOf(n) < 0) lab.className = 'odd';
      nums.appendChild(lab);
    }
    for (var s = 0; s < 6; s++) {
      var st = document.createElement('div');
      st.className = 'string';
      st.style.top = (10 + s * 10.4) + 'px';
      st.style.opacity = 0.55 + s * 0.08;
      st.style.height = (s > 2 ? 2 : 1) + 'px';
      board.appendChild(st);
    }
  }

  // --- Copy buttons (phone / email) ---
  document.querySelectorAll('.copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var reset = function () { setTimeout(function () { b.textContent = 'Copy'; }, 1600); };
      var fallback = function () {
        var r = document.createRange();
        r.selectNodeContents(b.previousElementSibling);
        var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        b.textContent = 'Selected'; reset();
      };
      try {
        navigator.clipboard.writeText(b.getAttribute('data-copy'))
          .then(function () { b.textContent = 'Copied'; reset(); }, fallback);
      } catch (e) { fallback(); }
    });
  });

  // --- Contact form: opens the visitor's email app with the message filled in.
  //     To receive messages directly instead, point the form at a service such as
  //     Formspree and delete this block. ---
  var form = document.getElementById('contact-form');
  var note = document.getElementById('form-note');

  // Coming from a shop item ("Ask about this item"): fill in which item.
  var askItem = new URLSearchParams(location.search).get('item');
  if (form && askItem) {
    form.elements.type.value = 'Buying from the shop';
    form.elements.message.value = 'I’m interested in: ' + askItem + '\n\n';
  }

  if (form && note) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.elements.name.value.trim();
      var reply = form.elements.reply.value.trim();
      if (!name || !reply) {
        note.textContent = 'Add your name and a phone number or email so we can get back to you.';
        note.dataset.state = '';
        (name ? form.elements.reply : form.elements.name).focus();
        return;
      }
      var type = form.elements.type.value;
      var body = 'Name: ' + name + '\nReach me at: ' + reply + '\nService: ' + type + '\n\n' + form.elements.message.value.trim();
      location.href = 'mailto:Kotss@hotmail.com?subject=' + encodeURIComponent('Website inquiry: ' + type) + '&body=' + encodeURIComponent(body);
      note.textContent = 'Your email app should open with this message. If it doesn’t, email Kotss@hotmail.com or call 956-651-0999.';
      note.dataset.state = 'ok';
    });
  }
})();
