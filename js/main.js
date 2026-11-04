// shared site script. every part checks its element exists first, so it's safe on any page
(function () {
  // mobile menu
  var menuBtn = document.querySelector('.menu-btn');
  var links = document.getElementById('nav-links');
  if (menuBtn && links) {
    menuBtn.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // highlight the current page in the nav
  var here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });

  // footer year
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // fretboard on the home page. fret n sits at L * (1 - 2^(-n/12)) from the nut,
  // scaled so the last fret lands at the right edge
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
    var strings = [];
    for (var s = 0; s < 6; s++) {
      var st = document.createElement('div');
      st.className = 'string';
      st.style.top = (10 + s * 10.4) + 'px';
      st.style.opacity = 0.55 + s * 0.08;
      st.style.height = (s > 2 ? 2 : 1) + 'px';
      st.addEventListener('animationend', function () { this.classList.remove('ring'); });
      board.appendChild(st);
      strings.push(st);
    }

    // open E major, high e on top down to low E on the bottom
    var notes = [329.63, 246.94, 207.65, 164.81, 123.47, 82.41];
    var audio = null;

    function wiggle(i) {
      var el = strings[i];
      el.classList.remove('ring');
      void el.offsetWidth; // restart the animation
      el.classList.add('ring');
    }

    function amp() {
      if (audio) return audio;
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      var ctx = new Ctx();

      // a little overdrive so it sounds like a guitar through an amp, not a harp
      var drive = ctx.createWaveShaper();
      var curve = new Float32Array(1024);
      for (var k = 0; k < 1024; k++) {
        var x = k / 512 - 1;
        curve[k] = Math.tanh(x * 5);
      }
      drive.curve = curve;

      var tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 3200;

      var vol = ctx.createGain();
      vol.gain.value = 0.18;

      drive.connect(tone).connect(vol).connect(ctx.destination);
      audio = { ctx: ctx, input: drive };
      return audio;
    }

    // Karplus-Strong: a burst of noise fed through a short delay line sounds like a plucked string
    function pluck(freq, when) {
      var a = amp();
      if (!a) return;
      var rate = a.ctx.sampleRate;
      var period = Math.round(rate / freq);
      var len = Math.floor(rate * 2.2);
      var buf = a.ctx.createBuffer(1, len, rate);
      var out = buf.getChannelData(0);
      var line = new Float32Array(period);
      for (var i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
      for (var j = 0, p = 0; j < len; j++) {
        var next = (p + 1) % period;
        out[j] = line[p];
        line[p] = (line[p] + line[next]) * 0.4985;
        p = next;
      }
      var src = a.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(a.input);
      src.start(a.ctx.currentTime + when);
    }

    function strum() {
      var a = amp();
      if (a && a.ctx.state === 'suspended') a.ctx.resume();
      // downstroke: low string first
      for (var i = 5; i >= 0; i--) {
        var delay = (5 - i) * 0.022;
        pluck(notes[i], delay);
        setTimeout(wiggle.bind(null, i), delay * 1000);
      }
    }

    board.addEventListener('click', strum);
    board.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); strum(); }
    });

    // brushing over a string makes it move (no sound until they click)
    board.addEventListener('pointermove', function (e) {
      var y = e.clientY - board.getBoundingClientRect().top;
      var i = Math.round((y - 10) / 10.4);
      if (i >= 0 && i < 6 && Math.abs(y - (10 + i * 10.4)) < 3 && !strings[i].classList.contains('ring')) wiggle(i);
    });
  }

  // contact page: highlight today and say if the shop is open right now (shop time, not the visitor's)
  var hoursList = document.querySelector('.hours');
  if (hoursList) {
    var open = { 2: [12, 19], 3: [12, 19], 4: [12, 19], 5: [12, 19], 6: [12, 17] };
    var parts = {};
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date())
      .forEach(function (x) { parts[x.type] = x.value; });
    var day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    var now = +parts.hour + parts.minute / 60;

    var todayRow = hoursList.querySelector('[data-day="' + day + '"]');
    if (todayRow) todayRow.classList.add('today');

    var badge = document.getElementById('open-now');
    if (badge && day >= 0) {
      var isOpen = open[day] && now >= open[day][0] && now < open[day][1];
      badge.textContent = isOpen ? 'Open now' : 'Closed now';
      badge.classList.toggle('is-open', !!isOpen);
      badge.hidden = false;
    }
  }

  // copy buttons (phone / email)
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

  // contact form. opens the visitor's email app with the message filled in.
  // if you hook the form up to Formspree or similar, delete this part
  var form = document.getElementById('contact-form');
  var note = document.getElementById('form-note');

  // came from "Ask about this item" on a shop page
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
