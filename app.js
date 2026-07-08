(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let sourceImage = null;
  let seed = Math.floor(Math.random() * 0xffffffff);

  const systemWords = ['NULL', 'SIGNAL', 'VECTOR', 'GHOST', 'SHELL', 'DELTA', 'EXIT', 'VOID', 'SYNC', 'BOOT', 'TRACE', 'ROOT'];
  const glyphs = ['+', 'x', '#', '*', ':', '.', '0', '1', '<', '>', '[', ']', '{', '}', '|', '/', '\\', '-', '=', '_'];
  const icons = ['[+]', '[x]', '<+>', '<#>', '/\\', '\\/', '[[]]', '{-}', '<01>', '[::]', '|-|', '<*>', '{+}', '[><]', '<|>'];
  const labels = ['[SYS]', '[ERR]', '[RUN]', '[LOCK]', '<root>', '0x00FF', '101101', '[I/O]', '<bus>', '|:|', '>>>', '<<<'];
  const bayer4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];

  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hexToRgb(hex) { const n = Number.parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function fitCover(img, w, h) { const s = Math.max(w / img.width, h / img.height); const iw = img.width * s; const ih = img.height * s; return [(w - iw) / 2, (h - ih) / 2, iw, ih]; }
  function smoothstep(edge0, edge1, x) { const t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); }

  function fontStack() {
    const v = $('fontInput').value;
    if (v === 'cascadia') return '"Cascadia Mono", Consolas, "Courier New", monospace';
    if (v === 'courier') return '"Courier New", Courier, monospace';
    if (v === 'monospace') return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    return 'Consolas, "Cascadia Mono", "Lucida Console", "Courier New", monospace';
  }

  function updateOutputs() {
    $('scaleOut').textContent = $('scaleInput').value;
    $('thresholdOut').textContent = $('thresholdInput').value;
    $('contrastOut').textContent = $('contrastInput').value;
    $('vignetteOut').textContent = $('vignetteInput').value;
    $('grainOut').textContent = $('grainInput').value;
    $('overlayOut').textContent = $('overlayInput').value;
    $('textSizeOut').textContent = $('textSizeInput').value;
    $('densityOut').textContent = $('densityInput').value;
  }

  function floydSteinberg(lum, sw, sh, threshold) {
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
  }

  function bayerDither(lum, sw, sh, threshold) {
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const i = y * sw + x;
        const b = ((bayer4[y % 4][x % 4] + 0.5) / 16 - 0.5) * 110;
        lum[i] = lum[i] > 128 + threshold + b ? 255 : 0;
      }
    }
  }

  function drawDither() {
    const w = clamp(Number($('widthInput').value) || 1200, 320, 2600);
    const h = clamp(Number($('heightInput').value) || 1500, 320, 2600);
    const scale = clamp(Number($('scaleInput').value) || 3, 3, 12);
    const threshold = Number($('thresholdInput').value) || 0;
    const contrast = Number($('contrastInput').value) || 0;
    const vignette = Number($('vignetteInput').value) || 0;
    const grain = Number($('grainInput').value) || 0;
    const algorithm = $('algorithmInput').value;
    const dark = hexToRgb($('darkInput').value);
    const hot = hexToRgb($('hotInput').value);

    canvas.width = w;
    canvas.height = h;

    const small = document.createElement('canvas');
    const sw = Math.max(1, Math.floor(w / scale));
    const sh = Math.max(1, Math.floor(h / scale));
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
      grad.addColorStop(0, '#090909'); grad.addColorStop(0.45, '#aaa'); grad.addColorStop(1, '#030303');
      sctx.fillStyle = grad; sctx.fillRect(0, 0, sw, sh);
      sctx.fillStyle = '#ddd'; sctx.font = `900 ${Math.floor(sw / 10)}px ${fontStack()}`; sctx.fillText('DROP IMAGE', sw * 0.12, sh * 0.52);
    }

    const img = sctx.getImageData(0, 0, sw, sh);
    const data = img.data;
    const lum = new Float32Array(sw * sh);
    const cFactor = contrast >= 0 ? 1 + contrast / 28 : 1 + contrast / 100;
    const cx = sw / 2, cy = sh / 2, maxDist = Math.sqrt(cx * cx + cy * cy);

    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const di = (y * sw + x) * 4;
        let l = data[di] * 0.299 + data[di + 1] * 0.587 + data[di + 2] * 0.114;
        l = (l - 128) * cFactor + 128;
        if (vignette > 0) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
          l *= 1 - smoothstep(0.38, 1, dist) * (vignette / 100) * 0.96;
        }
        l += (Math.random() - 0.5) * grain;
        lum[y * sw + x] = clamp(l, 0, 255);
      }
    }

    if (algorithm === 'bayer') bayerDither(lum, sw, sh, threshold); else floydSteinberg(lum, sw, sh, threshold);

    const out = sctx.createImageData(sw, sh);
    for (let p = 0, i = 0; p < lum.length; p += 1, i += 4) {
      const col = lum[p] > 0 ? hot : dark;
      out.data[i] = col[0]; out.data[i + 1] = col[1]; out.data[i + 2] = col[2]; out.data[i + 3] = 255;
    }
    sctx.putImageData(out, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(small, 0, 0, w, h);
  }

  function setFont(size, weight = 400) {
    ctx.font = `${weight} ${Math.max(8, Math.floor(size))}px ${fontStack()}`;
    ctx.textBaseline = 'alphabetic';
  }

  function drawText(text, x, y, size, color, align = 'left', weight = 400) {
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.shadowBlur = 0;
    setFont(size, weight);
    ctx.fillText(text, x, y);
  }

  function poolWords() {
    const words = $('wordsInput').value.split(',').map((s) => s.trim()).filter(Boolean);
    return words.length ? words : systemWords;
  }

  function drawRulers(w, h, cell, glyphColor, density) {
    const count = Math.floor((8 + density * 18) * 0.8);
    for (let i = 0; i < count; i += 1) {
      const horizontal = rnd() > 0.4;
      const size = cell * (0.74 + rnd() * 0.28);
      if (horizontal) {
        const ch = ['-', '=', '_', '·'][Math.floor(rnd() * 4)];
        const len = 4 + Math.floor(rnd() * (10 + density * 24));
        const pre = rnd() > 0.66 ? icons[Math.floor(rnd() * icons.length)] + ' ' : '';
        drawText(pre + ch.repeat(len), w * (0.04 + rnd() * 0.88), h * (0.06 + rnd() * 0.88), size, glyphColor, 'left');
      } else {
        const ch = ['|', ':', '¦'][Math.floor(rnd() * 3)];
        const rows = 3 + Math.floor(rnd() * (4 + density * 10));
        const x = w * (0.05 + rnd() * 0.9);
        const y = h * (0.06 + rnd() * 0.84);
        for (let j = 0; j < rows; j += 1) drawText(ch, x, y + j * cell * 0.85, size, glyphColor, 'center');
      }
    }
  }

  function drawIcons(w, h, cell, glyphColor, density) {
    const count = Math.floor(6 + density * ((w + h) / 46));
    for (let i = 0; i < count; i += 1) {
      const r = rnd();
      let text = r < 0.36 ? icons[Math.floor(rnd() * icons.length)] : r < 0.72 ? labels[Math.floor(rnd() * labels.length)] : glyphs[Math.floor(rnd() * glyphs.length)].repeat(2 + Math.floor(rnd() * 7));
      drawText(text, w * (0.04 + rnd() * 0.92), h * (0.05 + rnd() * 0.9), cell * (0.7 + rnd() * 0.42), glyphColor, rnd() > 0.5 ? 'left' : 'center');
    }
  }

  function drawWords(w, h, cell, wordColor, density, words) {
    const count = Math.floor(3 + density * 6);
    for (let i = 0; i < count; i += 1) {
      const word = words[i % words.length].toUpperCase();
      drawText(word, w * (0.1 + rnd() * 0.8), h * (0.12 + rnd() * 0.76), cell * (0.95 + rnd() * 0.45), wordColor, 'center', 700);
    }
  }

  function drawOverlay() {
    const w = canvas.width, h = canvas.height;
    const opacity = Number($('overlayInput').value) / 100;
    const density = Number($('densityInput').value) / 100;
    const textScale = Number($('textSizeInput').value) / 100;
    const glyphColor = $('glyphColorInput').value;
    const wordColor = $('wordColorInput').value;
    const words = poolWords();
    const cell = Math.max(12, Math.min(w, h) * 0.016 * textScale);

    ctx.save();
    ctx.globalCompositeOperation = $('blendModeInput').value;
    ctx.globalAlpha = opacity;
    ctx.shadowBlur = 0;
    drawRulers(w, h, cell, glyphColor, density);
    drawIcons(w, h, cell, glyphColor, density);
    drawWords(w, h, cell, wordColor, density, words);
    ctx.restore();
  }

  function render() { updateOutputs(); drawDither(); drawOverlay(); }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { sourceImage = img; URL.revokeObjectURL(url); render(); };
    img.src = url;
  }

  $('imageInput').addEventListener('change', (event) => loadFile(event.target.files[0]));
  $('randomBtn').addEventListener('click', () => { seed = Math.floor(Math.random() * 0xffffffff); render(); });
  $('renderBtn').addEventListener('click', render);
  $('downloadBtn').addEventListener('click', () => { const a = document.createElement('a'); a.download = `dither_ascii_${Date.now()}.png`; a.href = canvas.toDataURL('image/png'); a.click(); });

  const dropzone = $('dropzone');
  ['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', (event) => loadFile(event.dataTransfer.files[0]));

  ['wordsInput','widthInput','heightInput','algorithmInput','scaleInput','thresholdInput','contrastInput','vignetteInput','grainInput','darkInput','hotInput','blendModeInput','fontInput','textSizeInput','densityInput','overlayInput','wordColorInput','glyphColorInput']
    .forEach((id) => { const el = $(id); el.addEventListener('input', render); el.addEventListener('change', render); });

  render();
})();
