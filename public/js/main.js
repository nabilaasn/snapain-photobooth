(() => {
  'use strict';

  /* ---------------- template presets (grid shape x frame style) ---------------- */
  const GRIDS = [
    { id: 'strip4', cols: 1, rows: 4, count: 4 },
    { id: 'grid4', cols: 2, rows: 2, count: 4 },
    { id: 'strip3', cols: 1, rows: 3, count: 3 },
    { id: 'duo', cols: 1, rows: 2, count: 2 },
  ];

  const THEMES = [
    { id: 'cloud', bg: '#e3f4ff', accent: '#5fc3f0', text: '#1f7fae', style: 'scallop', bump: 11 },
    { id: 'galaxy', bg: '#ece2ff', accent: '#a98af2', text: '#6a46c9', style: 'dashed-star', bump: 0 },
    { id: 'leaf', bg: '#dcfff2', accent: '#5fdcb0', text: '#1f9c78', style: 'dotted-washi', bump: 0 },
    { id: 'sunflower', bg: '#fff6cf', accent: '#ffcf3d', text: '#a87b00', style: 'scallop', bump: 16 },
  ];

  const TEMPLATES = [];
  GRIDS.forEach((grid) => THEMES.forEach((theme) => TEMPLATES.push({ grid, theme })));

  // hand-drawn "Blue Denim Y2K" pack — each is a full custom illustration
  // instead of the generic border-on-a-rect theme system above. Function
  // declarations are hoisted, so these names resolve even though the
  // functions themselves are defined further down the file.
  const STRIP3 = GRIDS[2];
  TEMPLATES.push({ grid: STRIP3, theme: { id: 'denim-pocket', custom: drawDenimPocketCard } });
  TEMPLATES.push({ grid: STRIP3, theme: { id: 'denim-heart', custom: drawDenimHeartCard } });
  TEMPLATES.push({ grid: STRIP3, theme: { id: 'denim-diamond', custom: drawDenimDiamondCard } });
  TEMPLATES.push({ grid: STRIP3, theme: { id: 'denim-rounded', custom: drawDenimRoundedCard } });

  /* ---------------- state ---------------- */
  const state = {
    grid: TEMPLATES[0].grid,
    theme: TEMPLATES[0].theme,
    filter: { id: 'normal', css: 'none' },
    source: 'camera', // 'camera' | 'gallery'
    stream: null,
    shots: [], // dataURLs, index-aligned with grid slots
    capturing: false,
  };

  /* ---------------- landing <-> wizard ---------------- */
  const pageLanding = document.getElementById('page-landing');
  const appEl = document.getElementById('app');

  function enterBooth() {
    pageLanding.classList.add('hidden');
    appEl.classList.remove('hidden');
    document.documentElement.classList.add('locked');
    goToStep(1);
  }

  function exitBooth() {
    appEl.classList.add('hidden');
    pageLanding.classList.remove('hidden');
    document.documentElement.classList.remove('locked');
    if (state.stream) {
      state.stream.getTracks().forEach((t) => t.stop());
      state.stream = null;
    }
  }

  ['navStartBtn', 'heroStartBtn', 'ctaStartBtn'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', enterBooth);
  });
  document.getElementById('btnExitBooth').addEventListener('click', exitBooth);

  /* ---------------- wizard steps ---------------- */
  const screens = {
    template: document.getElementById('screen-template'),
    filter: document.getElementById('screen-filter'),
    booth: document.getElementById('screen-booth'),
    result: document.getElementById('screen-result'),
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.add('hidden'));
    screens[name].classList.remove('hidden');
  }

  function updateStepper(n) {
    document.querySelectorAll('#stepper .step').forEach((el) => {
      const s = Number(el.dataset.step);
      el.classList.toggle('active', s === n);
      el.classList.toggle('done', s < n);
      el.querySelector('.step-dot').textContent = s < n ? '✓' : String(s);
    });
    document.querySelectorAll('#stepper .step-line').forEach((line, i) => {
      line.classList.toggle('filled', i + 2 <= n);
    });
  }

  function goToStep(n) {
    if (n === 1) showScreen('template');
    else if (n === 2) showScreen('filter');
    else if (n === 3) {
      showScreen('booth');
      if (state.source === 'camera') {
        startCamera();
        updateProgressLabel();
      } else {
        renderGalleryThumbs();
        updateGalleryState();
      }
    } else if (n === 4) showScreen('result');
    updateStepper(n);
  }

  document.getElementById('btnTemplateNext').addEventListener('click', () => goToStep(2));
  document.getElementById('btnFilterBack').addEventListener('click', () => goToStep(1));
  document.getElementById('btnFilterNext').addEventListener('click', () => goToStep(3));
  document.getElementById('btnCaptureBack').addEventListener('click', () => goToStep(2));

  /* ---------------- step 1: template gallery ---------------- */
  const templateRow = document.getElementById('templateRow');

  function initTemplateGallery() {
    TEMPLATES.forEach((tpl, idx) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'template-card';
      if (idx === 0) card.classList.add('active');

      const canvas = document.createElement('canvas');
      card.appendChild(canvas);
      templateRow.appendChild(card);
      renderTemplateCard(canvas, tpl.theme, tpl.grid, PREVIEW_ASPECT, (ctx, x, y, w, h) => {
        drawPlaceholderSlot(ctx, x, y, w, h);
      });

      card.addEventListener('click', () => {
        document.querySelectorAll('.template-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        const countChanged = state.grid.count !== tpl.grid.count;
        state.grid = tpl.grid;
        state.theme = tpl.theme;
        if (countChanged) state.shots = [];
        updateProgressLabel();
      });
    });
  }

  /* ---------------- step 2: filter ---------------- */
  function initFilterChips() {
    document.querySelectorAll('#filterRow .filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#filterRow .filter-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.filter = { id: btn.dataset.filter, css: btn.dataset.css };
        video.style.filter = state.filter.css === 'none' ? 'none' : state.filter.css;
      });
    });
  }

  /* ---------------- step 3: photo source (camera vs gallery) ---------------- */
  const panelCamera = document.getElementById('panel-camera');
  const panelGallery = document.getElementById('panel-gallery');

  function initSourceToggle() {
    document.querySelectorAll('.source-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('active')) return;
        document.querySelectorAll('.source-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.source = btn.dataset.source;
        panelCamera.classList.toggle('hidden', state.source !== 'camera');
        panelGallery.classList.toggle('hidden', state.source !== 'gallery');
        resetShots();
        if (state.source === 'camera') startCamera();
      });
    });
  }

  /* ---------------- camera ---------------- */
  const video = document.getElementById('video');
  const camHint = document.getElementById('camHint');

  async function startCamera() {
    if (state.stream) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 540 } },
        audio: false,
      });
      state.stream = stream;
      video.srcObject = stream;
      camHint.classList.add('hidden');
      return true;
    } catch (err) {
      camHint.textContent = 'Kamera tidak bisa diakses. Cek izin kamera di browser kamu.';
      camHint.classList.remove('hidden');
      return false;
    }
  }

  /* ---------------- capture (camera mode) ---------------- */
  const countdownOverlay = document.getElementById('countdownOverlay');
  const flashEl = document.getElementById('flashEl');
  const thumbsRow = document.getElementById('thumbsRow');
  const shotProgress = document.getElementById('shotProgress');
  const retakeHint = document.getElementById('retakeHint');
  const btnCapture = document.getElementById('btnCapture');
  const btnContinue = document.getElementById('btnContinue');
  const btnRetakeAll = document.getElementById('btnRetakeAll');

  function updateProgressLabel() {
    const done = state.shots.filter(Boolean).length;
    shotProgress.textContent = done === 0 && !state.capturing
      ? `Tekan tombol untuk mulai (0/${state.grid.count})`
      : `${done}/${state.grid.count} foto diambil`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runCountdown(seconds) {
    for (let n = seconds; n >= 1; n--) {
      countdownOverlay.textContent = n;
      countdownOverlay.classList.remove('show');
      // force reflow so the animation restarts every tick
      void countdownOverlay.offsetWidth;
      countdownOverlay.classList.add('show');
      await sleep(1000);
    }
  }

  function captureFrame() {
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const c = document.createElement('canvas');
    c.width = vw;
    c.height = vh;
    const ctx = c.getContext('2d');
    // mirror horizontally so the photo matches what the user saw in the preview
    // (the filter is applied later at compose time, not baked in here)
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, vw, vh);
    return c.toDataURL('image/png');
  }

  function flash() {
    flashEl.classList.remove('go');
    void flashEl.offsetWidth;
    flashEl.classList.add('go');
  }

  function renderThumbs() {
    thumbsRow.innerHTML = '';
    state.shots.forEach((dataUrl, idx) => {
      if (!dataUrl) return;
      const item = document.createElement('div');
      item.className = 'thumb-item';

      const img = document.createElement('img');
      img.src = dataUrl;
      item.appendChild(img);

      const retakeBtn = document.createElement('button');
      retakeBtn.type = 'button';
      retakeBtn.className = 'thumb-retake-btn';
      retakeBtn.textContent = 'Ulang';
      retakeBtn.title = 'Ulangi foto ini';
      retakeBtn.disabled = state.capturing;
      retakeBtn.addEventListener('click', () => retakeShot(idx));
      item.appendChild(retakeBtn);

      thumbsRow.appendChild(item);
    });
  }

  function setLocked(locked) {
    state.capturing = locked;
    btnContinue.disabled = locked;
    btnRetakeAll.disabled = locked;
    renderThumbs();
  }

  async function captureSequence() {
    state.shots = [];
    btnCapture.disabled = true;
    updateProgressLabel();
    setLocked(true);

    const camOk = await startCamera();
    if (!camOk) {
      btnCapture.disabled = false;
      setLocked(false);
      return;
    }

    for (let i = 0; i < state.grid.count; i++) {
      await runCountdown(3);
      flash();
      state.shots[i] = captureFrame();
      renderThumbs();
      updateProgressLabel();
      await sleep(700);
    }

    countdownOverlay.textContent = '';
    btnCapture.classList.add('hidden');
    retakeHint.classList.remove('hidden');
    btnContinue.classList.remove('hidden');
    btnRetakeAll.classList.remove('hidden');
    setLocked(false);
  }

  async function retakeShot(index) {
    if (state.capturing) return;
    setLocked(true);
    const camOk = await startCamera();
    if (!camOk) {
      setLocked(false);
      return;
    }
    await runCountdown(3);
    flash();
    state.shots[index] = captureFrame();
    updateProgressLabel();
    setLocked(false);
  }

  function resetCameraUI() {
    thumbsRow.innerHTML = '';
    updateProgressLabel();
    btnCapture.disabled = false;
    btnCapture.classList.remove('hidden');
    retakeHint.classList.add('hidden');
  }

  /* ---------------- pick from gallery ---------------- */
  const galleryInput = document.getElementById('galleryInput');
  const galleryThumbsRow = document.getElementById('galleryThumbsRow');
  const galleryHint = document.getElementById('galleryHint');

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function renderGalleryThumbs() {
    galleryThumbsRow.innerHTML = '';
    for (let i = 0; i < state.grid.count; i++) {
      const slot = document.createElement('div');
      slot.className = 'gallery-slot';

      if (state.shots[i]) {
        const img = document.createElement('img');
        img.src = state.shots[i];
        slot.appendChild(img);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'thumb-retake-btn';
        removeBtn.textContent = 'Hapus';
        removeBtn.addEventListener('click', () => {
          state.shots[i] = undefined;
          renderGalleryThumbs();
          updateGalleryState();
        });
        slot.appendChild(removeBtn);
      } else {
        slot.classList.add('gallery-slot--empty');
        slot.textContent = '+';
        slot.addEventListener('click', () => galleryInput.click());
      }

      galleryThumbsRow.appendChild(slot);
    }
  }

  function updateGalleryState() {
    const done = state.shots.filter(Boolean).length;
    galleryHint.textContent = done >= state.grid.count
      ? 'Semua foto sudah dipilih.'
      : `Pilih ${state.grid.count - done} foto lagi dari galeri kamu.`;
    btnContinue.classList.toggle('hidden', done < state.grid.count);
  }

  function resetGalleryUI() {
    if (galleryInput) galleryInput.value = '';
    renderGalleryThumbs();
    updateGalleryState();
  }

  function initGalleryPicker() {
    galleryInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = ''; // allow re-picking the same file later
      if (!files.length) return;

      const emptyIdx = [];
      for (let i = 0; i < state.grid.count; i++) {
        if (!state.shots[i]) emptyIdx.push(i);
      }
      const toFill = files.slice(0, emptyIdx.length);
      const dataUrls = await Promise.all(toFill.map(readFileAsDataURL));
      dataUrls.forEach((url, k) => {
        state.shots[emptyIdx[k]] = url;
      });
      renderGalleryThumbs();
      updateGalleryState();
    });
  }

  /* ---------------- shared: reset shots when switching source / retaking ---------------- */
  function resetShots() {
    state.shots = [];
    state.capturing = false;
    btnContinue.classList.add('hidden');
    btnRetakeAll.classList.add('hidden');
    if (state.source === 'camera') resetCameraUI();
    else resetGalleryUI();
  }

  /* ---------------- shared card renderer ---------------- */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // fluffy bump ring along a rect's edge — used for the cloud & sunflower frames
  function drawScallopBorder(ctx, x, y, w, h, bumpR, color) {
    ctx.fillStyle = color;
    const step = bumpR * 1.55;
    const bump = (px, py) => {
      ctx.beginPath();
      ctx.arc(px, py, bumpR, 0, Math.PI * 2);
      ctx.fill();
    };
    for (let px = x; px <= x + w; px += step) {
      bump(px, y);
      bump(px, y + h);
    }
    for (let py = y; py <= y + h; py += step) {
      bump(x, py);
      bump(x + w, py);
    }
    bump(x + w, y);
    bump(x, y + h);
    bump(x + w, y + h);
  }

  function drawDiamond(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  // dashed outline with small diamonds sprinkled along the edge — the galaxy frame
  function drawDashedDiamondBorder(ctx, x, y, w, h, r, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([9, 7]);
    drawRoundRect(ctx, x, y, w, h, r);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const size = 7;
    const step = 44;
    for (let px = x + r + step / 2; px < x + w - r; px += step) {
      drawDiamond(ctx, px, y, size, color);
      drawDiamond(ctx, px, y + h, size, color);
    }
    for (let py = y + r + step / 2; py < y + h - r; py += step) {
      drawDiamond(ctx, x, py, size, color);
      drawDiamond(ctx, x + w, py, size, color);
    }
  }

  // dotted outline — the washi-tape leaf frame
  function drawDottedBorder(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    const dotR = 2.6;
    const step = 13;
    const dot = (px, py) => {
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fill();
    };
    for (let px = x + r; px <= x + w - r; px += step) {
      dot(px, y);
      dot(px, y + h);
    }
    for (let py = y + r; py <= y + h - r; py += step) {
      dot(x, py);
      dot(x + w, py);
    }
  }

  function drawWashiTape(ctx, cx, cy, w, h, color, angleDeg) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // draws the full card (background, decorative frame, title, photo slots, date)
  // onto `canvas`, sized to fit `grid` at the given photo `aspect` (h/w) ratio.
  // `drawSlot(ctx, x, y, w, h, idx)` paints whatever goes inside each photo slot.
  function paintCard(canvas, theme, grid, aspect, drawSlot) {
    const { cols, rows } = grid;
    const contentW = cols > 1 ? 420 : 460;
    const gap = 16;
    const pad = 26;
    const titleH = 60;
    const footerH = 56;
    const outerPad = 18; // bleed room so the decorative border isn't clipped at the canvas edge

    const photoW = (contentW - gap * (cols - 1)) / cols;
    const photoH = Math.round(photoW * aspect);

    const cardW = Math.round(pad * 2 + cols * photoW + (cols - 1) * gap);
    const cardH = Math.round(pad * 2 + titleH + rows * photoH + (rows - 1) * gap + footerH);

    canvas.width = cardW + outerPad * 2;
    canvas.height = cardH + outerPad * 2;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(outerPad, outerPad);

    // card background
    ctx.fillStyle = theme.bg;
    drawRoundRect(ctx, 0, 0, cardW, cardH, 28);
    ctx.fill();

    // decorative frame edge, shape depends on the chosen frame style
    const edgeX = 6;
    const edgeY = 6;
    const edgeW = cardW - 12;
    const edgeH = cardH - 12;
    if (theme.style === 'dashed-star') {
      drawDashedDiamondBorder(ctx, edgeX, edgeY, edgeW, edgeH, 22, theme.accent);
    } else if (theme.style === 'dotted-washi') {
      drawDottedBorder(ctx, edgeX, edgeY, edgeW, edgeH, 22, theme.accent);
    } else {
      drawScallopBorder(ctx, edgeX, edgeY, edgeW, edgeH, theme.bump || 11, theme.accent);
    }

    // title
    ctx.fillStyle = theme.text;
    ctx.font = "700 24px 'Poppins', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Snapain', cardW / 2, pad + titleH / 2);

    // photo slots
    const washiColors = [theme.accent, theme.text];
    for (let idx = 0; idx < cols * rows; idx++) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = pad + col * (photoW + gap);
      const y = pad + titleH + row * (photoH + gap);

      // white polaroid mat
      ctx.fillStyle = '#ffffff';
      drawRoundRect(ctx, x - 6, y - 6, photoW + 12, photoH + 12, 16);
      ctx.fill();

      // slot content, clipped rounded
      ctx.save();
      drawRoundRect(ctx, x, y, photoW, photoH, 12);
      ctx.clip();
      drawSlot(ctx, x, y, photoW, photoH, idx);
      ctx.restore();

      if (theme.style === 'dotted-washi') {
        drawWashiTape(ctx, x + 14, y - 4, 34, 14, washiColors[idx % washiColors.length], -8);
        drawWashiTape(ctx, x + photoW - 14, y - 4, 34, 14, washiColors[(idx + 1) % washiColors.length], 8);
      }
    }

    // footer date
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    ctx.fillStyle = theme.text;
    ctx.font = "600 17px 'Quicksand', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${dd}/${mm}/${yyyy}`, cardW / 2, cardH - pad - footerH / 2);

    ctx.restore();
  }

  const PREVIEW_ASPECT = 540 / 720; // matches the ideal camera resolution

  // simple person silhouette used on template gallery thumbnails
  function drawPlaceholderSlot(ctx, x, y, w, h) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#dce8f0');
    grad.addColorStop(1, '#b7ccd9');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    const cx = x + w / 2;
    const headR = h * 0.15;
    const headCy = y + h * 0.36;
    ctx.beginPath();
    ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx - headR * 1.7, y + h * 1.05);
    ctx.quadraticCurveTo(cx, y + h * 0.55, cx + headR * 1.7, y + h * 1.05);
    ctx.closePath();
    ctx.fill();
  }

  // renders one template card: the generic grid+border theme system, or a
  // fully custom illustration (the denim pack) when theme.custom is set.
  function renderTemplateCard(canvas, theme, grid, aspect, drawSlot) {
    if (theme.custom) {
      theme.custom(canvas, aspect, drawSlot);
      return;
    }
    paintCard(canvas, theme, grid, aspect, drawSlot);
  }

  /* ================= "Blue Denim Y2K" hand-drawn template pack ================= */
  const DENIM = '#3d5878';
  const DENIM_DARK = '#263c53';
  const DENIM_LIGHT = '#7b9bb8';

  // deterministic pseudo-random so the same template always renders identically
  function makeRand(seed) {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function speckleTexture(ctx, x, y, w, h, count, colorA, colorB, seed) {
    const rand = makeRand(seed);
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = rand() > 0.5 ? colorA : colorB;
      ctx.fillRect(x + rand() * w, y + rand() * h, 1.3, 1.3);
    }
  }

  function fillDenimTexture(ctx, x, y, w, h, base, seed) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    speckleTexture(ctx, x, y, w, h, 260, 'rgba(255,255,255,0.14)', 'rgba(10,20,35,0.16)', seed);
    ctx.restore();
  }

  function fillGingham(ctx, x, y, w, h, color, seed) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = '#fbf8f0';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.4;
    const step = 9;
    for (let px = x - step; px < x + w; px += step * 2) ctx.fillRect(px, y, step, h);
    for (let py = y - step; py < y + h; py += step * 2) ctx.fillRect(x, py, w, step);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function heartPath(ctx, cx, cy, w, h) {
    const wq = w / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + h * 0.46);
    ctx.bezierCurveTo(cx - wq * 1.3, cy - h * 0.02, cx - wq * 0.65, cy - h * 0.62, cx, cy - h * 0.2);
    ctx.bezierCurveTo(cx + wq * 0.65, cy - h * 0.62, cx + wq * 1.3, cy - h * 0.02, cx, cy + h * 0.46);
    ctx.closePath();
  }

  function laceRing(ctx, pathFn, color, bumpR) {
    // sprinkle small scallop bumps just outside a shape's own outline
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.95;
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      pathFn(t, (px, py) => {
        ctx.beginPath();
        ctx.arc(px, py, bumpR, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function pocketPath(ctx, x, y, w, h) {
    const inset = w * 0.05;
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(x + inset, y);
    ctx.lineTo(x + w - inset, y);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.closePath();
  }

  /* ---- flat vector stickers (hand-drawn, not emoji) ---- */
  function drawStarSticker(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const a2 = a1 + Math.PI / 5;
      const p1 = [Math.cos(a1) * r, Math.sin(a1) * r];
      const p2 = [Math.cos(a2) * r * 0.42, Math.sin(a2) * r * 0.42];
      if (i === 0) ctx.moveTo(p1[0], p1[1]); else ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFishSticker(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.6, size * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(size * 0.48, 0);
    ctx.lineTo(size * 0.95, -size * 0.35);
    ctx.lineTo(size * 0.95, size * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(-size * 0.24, -size * 0.06, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawAppleSticker(ctx, cx, cy, size) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#c53c3c';
    ctx.beginPath();
    ctx.arc(-size * 0.28, size * 0.06, size * 0.42, 0, Math.PI * 2);
    ctx.arc(size * 0.28, size * 0.06, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5b3a22';
    ctx.lineWidth = Math.max(1, size * 0.09);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.32);
    ctx.lineTo(0, -size * 0.58);
    ctx.stroke();
    ctx.fillStyle = '#5fae5f';
    ctx.beginPath();
    ctx.ellipse(size * 0.16, -size * 0.5, size * 0.16, size * 0.09, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBowSticker(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-size, -size * 0.55); ctx.lineTo(-size, size * 0.55);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(size, -size * 0.55); ctx.lineTo(size, size * 0.55);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHatSticker(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, size * 0.3, size * 0.78, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, size * 0.16);
    ctx.quadraticCurveTo(-size * 0.12, -size * 0.56, 0, -size * 0.56);
    ctx.quadraticCurveTo(size * 0.12, -size * 0.56, size * 0.4, size * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCatFaceSticker(ctx, cx, cy, size) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, -size * 0.42);
    ctx.lineTo(-size * 0.24, -size * 0.88);
    ctx.lineTo(-size * 0.02, -size * 0.42);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(size * 0.55, -size * 0.42);
    ctx.lineTo(size * 0.24, -size * 0.88);
    ctx.lineTo(size * 0.02, -size * 0.42);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.ellipse(-size * 0.18, -size * 0.02, size * 0.05, size * 0.08, 0, 0, Math.PI * 2);
    ctx.ellipse(size * 0.18, -size * 0.02, size * 0.05, size * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,60,60,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, size * 0.1); ctx.lineTo(-size * 0.05, size * 0.14);
    ctx.moveTo(-size * 0.5, size * 0.22); ctx.lineTo(-size * 0.05, size * 0.2);
    ctx.moveTo(size * 0.5, size * 0.1); ctx.lineTo(size * 0.05, size * 0.14);
    ctx.moveTo(size * 0.5, size * 0.22); ctx.lineTo(size * 0.05, size * 0.2);
    ctx.stroke();
    ctx.fillStyle = '#e79aa8';
    ctx.beginPath();
    ctx.moveTo(-size * 0.05, size * 0.1);
    ctx.lineTo(size * 0.05, size * 0.1);
    ctx.lineTo(0, size * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSmileySticker(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(-r * 0.32, -r * 0.1, r * 0.1, 0, Math.PI * 2);
    ctx.arc(r * 0.32, -r * 0.1, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = r * 0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -r * 0.05, r * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function denimStitchBorder(ctx, pathFn, color) {
    ctx.save();
    pathFn();
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.stroke();
    pathFn();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // template 1 — light scrapbook paper, denim jean-pocket photo slots
  function drawDenimPocketCard(canvas, aspect, drawSlot) {
    const photoW = 176;
    const photoH = Math.round(photoW * aspect);
    const pad = 20;
    const gap = 24;
    const cardW = photoW + pad * 2;
    const cardH = pad * 2 + 3 * photoH + 2 * gap;
    canvas.width = cardW;
    canvas.height = cardH;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f3f0e6';
    ctx.fillRect(0, 0, cardW, cardH);
    speckleTexture(ctx, 0, 0, cardW, cardH, 140, 'rgba(120,120,140,0.05)', 'rgba(80,80,60,0.04)', 7);

    for (let i = 0; i < 3; i++) {
      const x = pad;
      const y = pad + i * (photoH + gap);
      ctx.save();
      pocketPath(ctx, x, y, photoW, photoH);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.clip();
      drawSlot(ctx, x, y, photoW, photoH, i);
      ctx.restore();
      denimStitchBorder(ctx, () => pocketPath(ctx, x, y, photoW, photoH), DENIM);
      // pocket "opening" curve near the top
      ctx.save();
      ctx.strokeStyle = DENIM_LIGHT;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + photoW * 0.12, y + photoH * 0.16);
      ctx.quadraticCurveTo(x + photoW / 2, y + photoH * 0.06, x + photoW * 0.88, y + photoH * 0.16);
      ctx.stroke();
      ctx.restore();
    }

    drawFishSticker(ctx, cardW - 20, 18, 13, DENIM);
    drawStarSticker(ctx, 18, cardH - 18, 10, DENIM_DARK);
    drawStarSticker(ctx, cardW - 16, cardH / 2, 7, DENIM_LIGHT);
  }

  // template 2 — dark denim background, heart-shaped photo slots, lace + apples
  function drawDenimHeartCard(canvas, aspect, drawSlot) {
    const photoW = 168;
    const photoH = Math.round(photoW * aspect);
    const pad = 24;
    const gap = 30;
    const footerH = 30;
    const cardW = photoW + pad * 2;
    const cardH = pad * 2 + 3 * photoH + 2 * gap + footerH;
    canvas.width = cardW;
    canvas.height = cardH;
    const ctx = canvas.getContext('2d');

    fillDenimTexture(ctx, 0, 0, cardW, cardH, DENIM_DARK, 3);

    for (let i = 0; i < 3; i++) {
      const cx = cardW / 2;
      const cy = pad + photoH / 2 + i * (photoH + gap);
      const hw = photoW * 0.98;
      const hh = photoH * 1.06;

      laceRing(ctx, (t, place) => {
        const a = t * Math.PI * 2;
        const px = cx + Math.cos(a) * (hw / 2 + 4);
        const py = cy - hh * 0.08 + Math.sin(a) * (hh / 2 + 4);
        place(px, py);
      }, 'rgba(255,255,255,0.85)', 3.2);

      ctx.save();
      heartPath(ctx, cx, cy, hw, hh);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.clip();
      drawSlot(ctx, cx - photoW / 2, cy - photoH / 2, photoW, photoH, i);
      ctx.restore();

      ctx.save();
      heartPath(ctx, cx, cy, hw, hh);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      drawAppleSticker(ctx, cx + hw * 0.42, cy + hh * 0.36, 13);
    }

    drawBowSticker(ctx, cardW / 2, 14, 11, '#c53c3c');
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = "italic 700 15px 'Poppins', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Mi amor', cardW / 2, cardH - footerH / 2);
    ctx.restore();
  }

  // template 3 — light denim plaid, rounded photo slots with rivets
  function drawDenimDiamondCard(canvas, aspect, drawSlot) {
    const photoW = 176;
    const photoH = Math.round(photoW * aspect);
    const pad = 20;
    const gap = 22;
    const cardW = photoW + pad * 2;
    const cardH = pad * 2 + 3 * photoH + 2 * gap;
    canvas.width = cardW;
    canvas.height = cardH;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#dfe6ea';
    ctx.fillRect(0, 0, cardW, cardH);
    ctx.save();
    ctx.strokeStyle = 'rgba(90,120,145,0.35)';
    ctx.lineWidth = 1;
    for (let d = -cardH; d < cardW + cardH; d += 12) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + cardH, cardH);
      ctx.moveTo(d, cardH);
      ctx.lineTo(d + cardH, 0);
      ctx.stroke();
    }
    ctx.restore();

    for (let i = 0; i < 3; i++) {
      const x = pad;
      const y = pad + i * (photoH + gap);
      ctx.save();
      drawRoundRect(ctx, x, y, photoW, photoH, 14);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.clip();
      drawSlot(ctx, x, y, photoW, photoH, i);
      ctx.restore();

      ctx.save();
      drawRoundRect(ctx, x, y, photoW, photoH, 14);
      ctx.strokeStyle = DENIM;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.restore();

      const rivetColor = '#d9b23c';
      const rInset = 10;
      [[x + rInset, y + rInset], [x + photoW - rInset, y + rInset],
        [x + rInset, y + photoH - rInset], [x + photoW - rInset, y + photoH - rInset]].forEach(([rx, ry]) => {
        ctx.fillStyle = rivetColor;
        ctx.beginPath();
        ctx.arc(rx, ry, 3.4, 0, Math.PI * 2);
        ctx.fill();
      });

      if (i === 0) drawBowSticker(ctx, x + photoW / 2, y - 4, 12, '#c53c3c');
      if (i === 1) drawStarSticker(ctx, x - 6, y + photoH / 2, 10, DENIM);
      if (i === 2) drawSmileySticker(ctx, x + photoW + 4, y + photoH / 2, 11, '#ffd93d');
    }
  }

  // template 4 — dark denim, rounded stitched slots, gingham strip footer
  function drawDenimRoundedCard(canvas, aspect, drawSlot) {
    const photoW = 176;
    const photoH = Math.round(photoW * aspect);
    const pad = 18;
    const gap = 18;
    const headerH = 34;
    const footerH = 26;
    const cardW = photoW + pad * 2;
    const cardH = headerH + pad + 3 * photoH + 2 * gap + pad + footerH;
    canvas.width = cardW;
    canvas.height = cardH;
    const ctx = canvas.getContext('2d');

    fillDenimTexture(ctx, 0, 0, cardW, cardH - footerH, DENIM, 11);

    drawHatSticker(ctx, cardW * 0.32, headerH * 0.55, 15, '#c8964f');
    drawCatFaceSticker(ctx, cardW * 0.68, headerH * 0.55, 15);

    for (let i = 0; i < 3; i++) {
      const x = pad;
      const y = headerH + pad / 2 + i * (photoH + gap);
      ctx.save();
      drawRoundRect(ctx, x, y, photoW, photoH, 16);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.clip();
      drawSlot(ctx, x, y, photoW, photoH, i);
      ctx.restore();
      denimStitchBorder(ctx, () => drawRoundRect(ctx, x, y, photoW, photoH, 16), DENIM_LIGHT);
    }

    fillGingham(ctx, 0, cardH - footerH, cardW, footerH, DENIM, 5);
  }

  /* ---------------- compose final result ---------------- */
  const resultCanvas = document.getElementById('resultCanvas');

  async function composeResult() {
    const imgs = await Promise.all(state.shots.map(loadImage));
    if (typeof document.fonts !== 'undefined' && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* ignore */ }
    }
    const aspect = imgs[0].height / imgs[0].width;
    const filterCss = state.filter.css === 'none' ? 'none' : state.filter.css;
    renderTemplateCard(resultCanvas, state.theme, state.grid, aspect, (ctx, x, y, w, h, idx) => {
      ctx.filter = filterCss;
      ctx.drawImage(imgs[idx], x, y, w, h);
      ctx.filter = 'none';
    });
  }

  /* ---------------- navigation & actions ---------------- */
  btnCapture.addEventListener('click', captureSequence);

  btnContinue.addEventListener('click', async () => {
    await composeResult();
    goToStep(4);
  });

  btnRetakeAll.addEventListener('click', () => {
    resetShots();
  });

  document.getElementById('btnDownload').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `snapain-${Date.now()}.png`;
    link.href = resultCanvas.toDataURL('image/png');
    link.click();
  });

  document.getElementById('btnRetake').addEventListener('click', () => {
    resetShots();
    goToStep(3);
  });

  /* ---------------- init ---------------- */
  initTemplateGallery();
  initFilterChips();
  initSourceToggle();
  initGalleryPicker();
  updateProgressLabel();
})();
