(() => {
  'use strict';

  /* ---------------- state ---------------- */
  const state = {
    grid: { id: 'strip4', cols: 1, rows: 4, count: 4 },
    theme: {
      id: 'cloud',
      bg: '#e3f4ff',
      accent: '#5fc3f0',
      text: '#1f7fae',
      style: 'scallop',
      bump: 11,
    },
    filter: { id: 'normal', css: 'none' },
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
    layout: document.getElementById('screen-layout'),
    frame: document.getElementById('screen-frame'),
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
    if (n === 1) showScreen('layout');
    else if (n === 2) showScreen('frame');
    else if (n === 3) showScreen('booth');
    else if (n === 4) showScreen('result');
    updateStepper(n);
  }

  document.getElementById('btnToFrame').addEventListener('click', () => {
    goToStep(2);
    renderPreview();
  });
  document.getElementById('btnBackToLayout').addEventListener('click', () => goToStep(1));
  document.getElementById('btnToSnap').addEventListener('click', async () => {
    goToStep(3);
    await startCamera();
  });
  document.getElementById('btnBackToFrame').addEventListener('click', () => goToStep(2));

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
      document.getElementById(btn.dataset.tab).classList.remove('hidden');
    });
  });

  /* ---------------- option chips ---------------- */
  const btnCapture = document.getElementById('btnCapture');
  const shotProgress = document.getElementById('shotProgress');

  function updateProgressLabel() {
    const done = state.shots.filter(Boolean).length;
    shotProgress.textContent = done === 0 && !state.capturing
      ? `Tekan tombol untuk mulai (0/${state.grid.count})`
      : `${done}/${state.grid.count} foto diambil`;
  }

  function initChips() {
    document.querySelectorAll('#gridRow .grid-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#gridRow .grid-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.grid = {
          id: btn.dataset.grid,
          cols: Number(btn.dataset.cols),
          rows: Number(btn.dataset.rows),
          count: Number(btn.dataset.count),
        };
        updateProgressLabel();
        renderPreview();
      });
    });

    document.querySelectorAll('#themeRow .theme-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#themeRow .theme-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.theme = {
          id: btn.dataset.theme,
          bg: btn.dataset.bg,
          accent: btn.dataset.accent,
          text: btn.dataset.text,
          style: btn.dataset.style,
          bump: Number(btn.dataset.bump || 0),
        };
        renderPreview();
      });
    });

    document.querySelectorAll('#filterRow .filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#filterRow .filter-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.filter = { id: btn.dataset.filter, css: btn.dataset.css };
        video.style.filter = state.filter.css === 'none' ? 'none' : state.filter.css;
        renderPreview();
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

  /* ---------------- capture ---------------- */
  const countdownOverlay = document.getElementById('countdownOverlay');
  const flashEl = document.getElementById('flashEl');
  const thumbsRow = document.getElementById('thumbsRow');
  const retakeHint = document.getElementById('retakeHint');
  const btnContinue = document.getElementById('btnContinue');
  const btnRetakeAll = document.getElementById('btnRetakeAll');

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
    ctx.filter = state.filter.css === 'none' ? 'none' : state.filter.css;
    // mirror horizontally so the photo matches what the user saw in the preview
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

  function resetBoothUI() {
    state.shots = [];
    thumbsRow.innerHTML = '';
    updateProgressLabel();
    btnCapture.disabled = false;
    btnCapture.classList.remove('hidden');
    btnContinue.classList.add('hidden');
    btnRetakeAll.classList.add('hidden');
    retakeHint.classList.add('hidden');
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

  /* ---------------- live setup preview ---------------- */
  const previewCanvas = document.getElementById('previewCanvas');
  const PREVIEW_ASPECT = 540 / 720; // matches the ideal camera resolution

  function drawPlaceholderSlot(ctx, x, y, w, h) {
    ctx.save();
    ctx.filter = state.filter.css === 'none' ? 'none' : state.filter.css;

    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#dce8f0');
    grad.addColorStop(1, '#b7ccd9');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // simple person silhouette so the filter effect reads clearly
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

    ctx.restore();
  }

  function renderPreview() {
    if (!previewCanvas) return;
    paintCard(previewCanvas, state.theme, state.grid, PREVIEW_ASPECT, (ctx, x, y, w, h) => {
      drawPlaceholderSlot(ctx, x, y, w, h);
    });
  }

  /* ---------------- compose final result ---------------- */
  const resultCanvas = document.getElementById('resultCanvas');

  async function composeResult() {
    const imgs = await Promise.all(state.shots.map(loadImage));
    if (typeof document.fonts !== 'undefined' && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* ignore */ }
    }
    const aspect = imgs[0].height / imgs[0].width;
    paintCard(resultCanvas, state.theme, state.grid, aspect, (ctx, x, y, w, h, idx) => {
      ctx.drawImage(imgs[idx], x, y, w, h);
    });
  }

  /* ---------------- navigation & actions ---------------- */
  btnCapture.addEventListener('click', captureSequence);

  btnContinue.addEventListener('click', async () => {
    await composeResult();
    goToStep(4);
  });

  btnRetakeAll.addEventListener('click', () => {
    resetBoothUI();
  });

  document.getElementById('btnDownload').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `snapain-${Date.now()}.png`;
    link.href = resultCanvas.toDataURL('image/png');
    link.click();
  });

  document.getElementById('btnRetake').addEventListener('click', () => {
    resetBoothUI();
    goToStep(3);
  });

  /* ---------------- init ---------------- */
  initChips();
  renderPreview();
})();
