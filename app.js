(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let sourceImage = null;
  let seed = Math.floor(Math.random() * 0xffffffff);

  const systemWords = ['NULL', 'SIGNAL', 'VECTOR', 'GHOST', 'SHELL', 'DELTA', 'EXIT', 'VOID', 'SYNC', 'BOOT', 'TRACE', 'ROOT'];
  const asciiBits = ['▓', '▒', '░', '█', '╬', '╫', '┼', '┬', '┴', '╳', '╱', '╲', '│', '─', '═', '║', '¦', ':', '.', '+', '*', '0', '1', '<', '>', '[', ']'];
  const asciiChunks = [
    '[SYS]', '[ERR]', '[RUN]', '[LOCK]', '<root>', '<void>', '0x00FF', '101101', 'ΔΔΔ', '::', '▓▒░', '█▒█', '<<<', '>>>', '||', '++',
    '[[]]', '{::}', '/\\', '\\/','<-#->', '[=]', '[I/O]', '<:>'
  ];
  const iconSet = ['[+]', '[x]', '<+>', '<#>', '/\\', '\\/', '[[]]', '{-}', '<01>', '[::]', '|-|', '<*>'];

  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  }

  function hexToRgb(hex) {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function fitCover(img, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const iw = img.width * s;
    const ih = img.height * s;
    return [(w - iw) / 2, (h - ih) / 2, iw, ih];
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function updateOutputs() {
    $('scaleOut').textContent = $('scaleInput').value;
    $('thresholdOut').textContent = $('thresholdInput').value;
    $('vignetteOut').textContent = $('vignetteInput').value;
    $('grainOut').textContent = $('grainInput').value;
    $('overlayOut').textContent = $('overlayInput').value;
    $('textSizeOut').textContent = $('textSizeInput').value;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function applyVignetteToContext(targetCtx, w, h, strengthPct) {
    const strength = clamp(strengthPct / 100, 0, 1);
    if (strength <= 0) return;

    const img = targetCtx.getImageData(0, 0, w, h);
    const data = img.data;
    const cx = w / 2;
    const cy = h / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);
    const start = 0.38;

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
        const edge = smoothstep(start, 1, dist);
        const darken = edge * strength * 0.96;
        const mult = 1 - darken;
        const i = (y * w + x) * 4;
        data[i] *= mult;
        data[i + 1] *= mult;
        data[i + 2] *= mult;
      }
    }

    targetCtx.putImageData(img, 0, 0);
  }

  function drawDither() {
    const w = clamp(Number($('widthInput').value) || 1200, 320, 2600);
    const h = clamp(Number($('heightInput').value) || 1500, 320, 2600);
    const pixelScale = Number($('scaleInput').value) || 3;
    const threshold = Number($('thresholdInput').value) || 0;
    const vignette = Number($('vignetteInput').value) || 0;
    const grain = Number($('grainInput').value) || 0;
    const dark = hexToRgb($('darkInput').value);
    const hot = hexToRgb($('hotInput').value);

    canvas.width = w;
    canvas.height = h;

    const small = document.createElement('canvas');
    const sw = Math.max(1, Math.floor(w / pixelScale));
    const sh = Math.max(1, Math.floor(h / pixelScale));
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext('2d', { willReadFrequently: true });

    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, sw, sh);

    if (sourceImage) {
      const [x, y, iw, ih] = fitCover(sourceImage, sw, sh);
      sctx.drawImage(sourceImage, x, y, iw, ih);
    } else {
      const grad = sctx.createLinearGradient(0, 0, sw, sh);
      grad.addColorStop(0, '#080808');
      grad.addColorStop(0.45, '#9b9b9b');
      grad.addColorStop(1, '#050505');
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, sw, sh);
      sctx.fillStyle = '#dddddd';
      sctx.font = `900 ${Math.floor(sw / 10)}px monospace`;
      sctx.fillText('DROP IMAGE', sw * 0.12, sh * 0.52);
    }

    applyVignetteToContext(sctx, sw, sh, vignette);

    const img = sctx.getImageData(0, 0, sw, sh);
    const data = img.data;
    const lum = new Float32Array(sw * sh);

    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      lum[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 + (Math.random() - 0.5) * grain;
    }

    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const i = y * sw + x;
        const old = lum[i];
        const next = old > 128 + threshold ? 255 : 0;
        const err = old - next;
        lum[i] = next;
        if (x + 1 < sw) lum[i + 1] += err * 7 / 16;
        if (y + 1 < sh) {
          if (x > 0) lum[i + sw - 1] += err * 3 / 16;
          lum[i + sw] += err * 5 / 16;
          if (x + 1 < sw) lum[i + sw + 1] += err * 1 / 16;
        }
      }
    }

    const out = sctx.createImageData(sw, sh);
    for (let p = 0, i = 0; p < lum.length; p += 1, i += 4) {
      const c = lum[p] > 0 ? hot : dark;
      out.data[i] = c[0];
      out.data[i + 1] = c[1];
      out.data[i + 2] = c[2];
      out.data[i + 3] = 255;
    }
    sctx.putImageData(out, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(small, 0, 0, w, h);
  }

  function drawAsciiText(text, x, y, size, alpha = 1, align = 'left') {
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${Math.max(10, Math.floor(size))}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }

  function repeatedCharLine(char, count) {
    return char.repeat(Math.max(1, count));
  }

  function drawAsciiFrame(w, h, alpha, textScale) {
    const margin = Math.floor(Math.min(w, h) * 0.045);
    const cell = Math.max(16, Math.floor(Math.min(w, h) * 0.022 * textScale));
    const cols = Math.max(6, Math.floor((w - margin * 2) / (cell * 0.62)));
    const rows = Math.max(6, Math.floor((h - margin * 2) / cell));
    const top = `┌${repeatedCharLine('─', cols)}┐`;
    const bottom = `└${repeatedCharLine('─', cols)}┘`;

    drawAsciiText(top, margin, margin + cell * 0.8, cell, alpha * 0.72);
    drawAsciiText(bottom, margin, h - margin, cell, alpha * 0.72);

    for (let i = 1; i < rows; i += 1) {
      const y = margin + i * cell;
      drawAsciiText('│', margin, y, cell, alpha * 0.55);
      drawAsciiText('│', w - margin - cell * 0.3, y, cell, alpha * 0.55);
    }

    const bandCount = 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < bandCount; i += 1) {
      const y = margin + cell * (2 + i * (1.3 + rnd()));
      const leftBlock = `${asciiChunks[Math.floor(rnd() * asciiChunks.length)]}${repeatedCharLine('·', 2 + Math.floor(rnd() * 8))}`;
      const rightBlock = `${repeatedCharLine('·', 2 + Math.floor(rnd() * 8))}${asciiChunks[Math.floor(rnd() * asciiChunks.length)]}`;
      drawAsciiText(leftBlock, margin + cell * 1.1, y, cell * 0.62, alpha * (0.22 + rnd() * 0.3));
      drawAsciiText(rightBlock, w - margin - cell * 1.2, y, cell * 0.62, alpha * (0.22 + rnd() * 0.3), 'right');
    }

    for (let i = 0; i < 12; i += 1) {
      const zone = i < 6 ? 'left' : 'right';
      const edgeX = zone === 'left' ? margin + cell * (1.4 + rnd() * 4) : w - margin - cell * (1.4 + rnd() * 4);
      const edgeY = margin + cell * (2 + rnd() * (rows - 4));
      const icon = iconSet[Math.floor(rnd() * iconSet.length)];
      drawAsciiText(icon, edgeX, edgeY, cell * (0.72 + rnd() * 0.18), alpha * (0.28 + rnd() * 0.45), zone === 'left' ? 'left' : 'right');
    }
  }

  function drawCenterComposition(w, h, alpha, textScale, pool) {
    const centerX = w * 0.5;
    const centerY = h * 0.52;

    const primary = (pool[0] || 'DELTA').toUpperCase();
    const secondary = (pool[1] || 'NULL SIGNAL').toUpperCase();
    const tertiary = (pool[2] || 'BECOME THE EXIT').toUpperCase();

    drawAsciiText('[::]', centerX, centerY - h * 0.16, w * 0.024 * textScale, alpha * 0.55, 'center');
    drawAsciiText('<+>', centerX - w * 0.11, centerY - h * 0.14, w * 0.018 * textScale, alpha * 0.3, 'center');
    drawAsciiText('<+>', centerX + w * 0.11, centerY - h * 0.14, w * 0.018 * textScale, alpha * 0.3, 'center');

    drawAsciiText(primary, centerX, centerY - h * 0.01, w * 0.085 * textScale, alpha * 0.97, 'center');
    drawAsciiText(secondary, centerX, centerY + h * 0.07, w * 0.032 * textScale, alpha * 0.82, 'center');
    drawAsciiText(tertiary, centerX, centerY + h * 0.125, w * 0.022 * textScale, alpha * 0.75, 'center');

    const bracketHalf = w * 0.18;
    const bracketY1 = centerY - h * 0.065;
    const bracketY2 = centerY + h * 0.095;
    drawAsciiText(`┌${repeatedCharLine('─', 12)}┐`, centerX - bracketHalf, bracketY1, w * 0.015 * textScale, alpha * 0.38, 'center');
    drawAsciiText(`└${repeatedCharLine('─', 12)}┘`, centerX + bracketHalf, bracketY2, w * 0.015 * textScale, alpha * 0.38, 'center');

    for (let i = 0; i < 8; i += 1) {
      const offsetY = (-0.19 + i * 0.055) * h;
      const leftX = centerX - w * (0.29 + rnd() * 0.08);
      const rightX = centerX + w * (0.29 + rnd() * 0.08);
      const label = `${systemWords[Math.floor(rnd() * systemWords.length)]} // ${Math.floor(rnd() * 9999).toString().padStart(4, '0')}`;
      drawAsciiText(label, leftX, centerY + offsetY, w * 0.012 * textScale, alpha * (0.18 + rnd() * 0.22), 'center');
      drawAsciiText(label, rightX, centerY + offsetY, w * 0.012 * textScale, alpha * (0.18 + rnd() * 0.22), 'center');
    }

    const chunkCount = 18;
    for (let i = 0; i < chunkCount; i += 1) {
      const ring = i % 2 === 0 ? 0.24 : 0.33;
      const side = i % 4;
      let x = centerX;
      let y = centerY;
      if (side === 0) { x -= w * ring; y += (rnd() - 0.5) * h * 0.28; }
      if (side === 1) { x += w * ring; y += (rnd() - 0.5) * h * 0.28; }
      if (side === 2) { x += (rnd() - 0.5) * w * 0.28; y -= h * ring * 0.75; }
      if (side === 3) { x += (rnd() - 0.5) * w * 0.28; y += h * ring * 0.68; }
      const chunk = asciiChunks[Math.floor(rnd() * asciiChunks.length)];
      drawAsciiText(chunk, x, y, w * (0.012 + rnd() * 0.01) * textScale, alpha * (0.16 + rnd() * 0.26), 'center');
    }
  }

  function drawOverlay() {
    const w = canvas.width;
    const h = canvas.height;
    const alpha = Number($('overlayInput').value) / 100;
    const textScale = Number($('textSizeInput').value) / 100;
    const words = $('wordsInput').value.split(',').map((s) => s.trim()).filter(Boolean);
    const pool = words.length ? words : systemWords;
    const color = $('asciiInput').value;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, w * 0.0015);
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    drawAsciiFrame(w, h, alpha, textScale);
    drawCenterComposition(w, h, alpha, textScale, pool);

    const microCount = Math.max(12, Math.floor((w + h) / 180));
    for (let i = 0; i < microCount; i += 1) {
      const onTop = i % 2 === 0;
      const x = onTop ? w * (0.1 + rnd() * 0.8) : (i % 4 < 2 ? w * 0.085 : w * 0.915);
      const y = onTop ? (i % 4 < 2 ? h * 0.1 : h * 0.9) : h * (0.16 + rnd() * 0.68);
      const bit = asciiBits[Math.floor(rnd() * asciiBits.length)].repeat(1 + Math.floor(rnd() * 4));
      drawAsciiText(bit, x, y, w * 0.009 * textScale, alpha * (0.08 + rnd() * 0.15), 'center');
    }

    ctx.restore();
  }

  function render() {
    updateOutputs();
    drawDither();
    drawOverlay();
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      URL.revokeObjectURL(url);
      render();
    };
    img.src = url;
  }

  $('imageInput').addEventListener('change', (event) => loadFile(event.target.files[0]));
  $('randomBtn').addEventListener('click', () => {
    seed = Math.floor(Math.random() * 0xffffffff);
    render();
  });
  $('renderBtn').addEventListener('click', render);
  $('downloadBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `dither_ascii_${Date.now()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  const dropzone = $('dropzone');
  ['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.remove('drag');
  }));
  dropzone.addEventListener('drop', (event) => loadFile(event.dataTransfer.files[0]));

  [
    'wordsInput', 'widthInput', 'heightInput', 'scaleInput', 'thresholdInput', 'vignetteInput',
    'darkInput', 'hotInput', 'asciiInput', 'grainInput', 'overlayInput', 'textSizeInput'
  ].forEach((id) => $(id).addEventListener('input', render));

  render();
})();
