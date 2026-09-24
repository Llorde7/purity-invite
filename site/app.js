(() => {
  'use strict';

  // ---- Config -------------------------------------------------------------
  // Get a free access key at https://web3forms.com (enter the email address
  // the RSVP should go to) and paste it here.
  const WEB3FORMS_ACCESS_KEY = 'c0a9e8c8-47ae-4e24-aae8-4a58c75c06a5';
  const HER_NAME = 'Purity';
  const FROM_NAME = 'Samuel';

  const PHOTOS = ['01', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(n => `photos/${n}.jpg`);
  const SLOT_STARTS = [8, 10, 12, 14, 16, 18, 20, 22];
  const LOCK_KEY = 'invite-rsvp-v1';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = sel => document.querySelector(sel);
  const fmtH = h => (h % 12 || 12) + (h < 12 || h === 24 ? ' AM' : ' PM');
  const slotLabel = h => `${fmtH(h)} – ${fmtH(h + 2)}`;
  const nowHours = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  const isPast = h => h + 2 <= nowHours();

  // ---- Names & date -------------------------------------------------------
  document.querySelectorAll('[data-her]').forEach(el => { el.textContent = HER_NAME; });
  document.querySelectorAll('[data-from]').forEach(el => { el.textContent = FROM_NAME; });
  const todayText = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  $('#today-label').textContent = 'Today, ' + todayText;

  // ---- Film strips (infinite, opposite directions) ------------------------
  const rowA = [...PHOTOS, ...PHOTOS];
  const rotated = [...PHOTOS.slice(5), ...PHOTOS.slice(0, 5)];
  const rowB = [...rotated, ...rotated];
  const films = [];

  function fillTrack(track, list, reverse) {
    const frag = document.createDocumentFragment();
    list.forEach((src, i) => {
      const img = new Image(225, 300);
      img.src = src;
      img.alt = '';
      img.decoding = 'async';
      // The first copy of each row is visible on load; the duplicate can wait.
      if (i >= PHOTOS.length) img.loading = 'lazy';
      frag.appendChild(img);
    });
    track.appendChild(frag);
    if (reduceMotion || !track.animate) return;
    const k = [{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }];
    films.push(track.animate(reverse ? k.reverse() : k, { duration: 45000, iterations: Infinity, easing: 'linear' }));
  }
  fillTrack($('[data-film="a"]'), rowA, false);
  fillTrack($('[data-film="b"]'), rowB, true);

  document.querySelectorAll('.film').forEach(film => {
    film.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') films.forEach(a => a.updatePlaybackRate(0.15)); });
    film.addEventListener('pointerleave', () => films.forEach(a => a.updatePlaybackRate(1)));
  });

  // ---- Reveal on scroll ---------------------------------------------------
  const revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.style.transitionDelay = (+(e.target.dataset.delay || 0)) + 'ms';
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }), { threshold: 0.12 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-in'));
  }

  // ---- RSVP ---------------------------------------------------------------
  const form = $('#rsvp-form');
  const slotsEl = $('#slots');
  const confirmBtn = $('#confirm');
  const errorEl = $('#rsvp-error');
  const doneEl = $('#rsvp-done');
  const modal = $('#confirm-modal');
  let selected = null;
  let sending = false;

  function readLock() {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY)); } catch { return null; }
  }
  function writeLock(data) {
    try { localStorage.setItem(LOCK_KEY, JSON.stringify(data)); } catch { /* private mode: lock lasts for this page view */ }
  }

  const slotButtons = SLOT_STARTS.map((h, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot' + (i % 3 === 2 ? ' is-purple' : '');
    btn.textContent = slotLabel(h);
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      if (sending || isPast(h)) return;
      selected = h;
      render();
    });
    slotsEl.appendChild(btn);
    return btn;
  });

  function render() {
    if (selected != null && isPast(selected)) selected = null;
    slotButtons.forEach((btn, i) => {
      const h = SLOT_STARTS[i];
      btn.disabled = sending || isPast(h);
      btn.setAttribute('aria-pressed', String(selected === h));
    });
    confirmBtn.disabled = sending || selected == null;
    confirmBtn.classList.toggle('is-sending', sending);
    confirmBtn.textContent = sending ? 'Sending…'
      : selected == null ? 'Pick a time above'
      : `Yes, ${slotLabel(selected)}`;
  }

  function showLocked(label, animate) {
    form.hidden = true;
    $('#done-slot').textContent = label;
    doneEl.hidden = false;
    if (animate && !reduceMotion) doneEl.classList.add('is-popping');
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  async function sendRsvp(label) {
    if (!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY.startsWith('YOUR_')) {
      throw new Error('Web3Forms access key is not set in app.js');
    }
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: WEB3FORMS_ACCESS_KEY,
        subject: `${HER_NAME} picked a time: ${label}`,
        from_name: 'Date Invitation',
        name: HER_NAME,
        date: `Today, ${todayText}`,
        time: label,
        submitted_at: new Date().toString(),
        message: `${HER_NAME} said yes and picked ${label} today (${todayText}).`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`);
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (sending || selected == null || readLock()) return;
    if (isPast(selected)) { render(); showError('That time has already passed. Please pick another.'); return; }

    const label = slotLabel(selected);
    errorEl.hidden = true;
    sending = true;
    render();
    try {
      await sendRsvp(label);
    } catch (err) {
      console.error('RSVP failed:', err);
      sending = false;
      render();
      showError('Hmm, that didn’t go through. Check your connection and try again.');
      return;
    }
    sending = false;
    writeLock({ slot: selected, label, date: todayText, at: Date.now() });
    showLocked(label, true);
    $('#modal-slot').textContent = label;
    if (typeof modal.showModal === 'function') modal.showModal();
    else alert(`It’s a date! Your time is locked in for today, ${label}.`);
  });

  // Close the modal by clicking the backdrop.
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });

  const lock = readLock();
  if (lock && lock.label) {
    showLocked(lock.label, false);
  } else {
    render();
    // Keep "past" slots accurate if the page stays open.
    setInterval(render, 60000);
  }
})();
