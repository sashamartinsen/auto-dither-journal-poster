(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let sourceImage = null;
  let sourceImage2 = null;
  let seed = Math.floor(Math.random() * 0xffffffff);

  const systemWords = ['NULL', 'SIGNAL', 'VECTOR', 'GHOST', 'SHELL', 'DELTA', 'EXIT', 'VOID', 'SYNC', 'BOOT', 'TRACE', 'ROOT'];
  const glyphs = ['+', 'x', '#', '*', ':', '.', '0', '1', '<', '>', '[', ']', '{', '}', '|', '/', '\\', '-', '=', '_'];
  const icons = ['[+]', '[x]', '<+>', '<#>', '/\\', '\\/', '[[]]', '{-}', '<01>', '[::]', '|-|', '<*>', '{+}', '[><]', '<|>'];
  const labels = ['[SYS]', '[ERR]', '[RUN]', '[LOCK]', '<root>', '0x00FF', '101101', '[I/O]', '<bus>', '|:|', '>>>', '<<<'];
  const bayer4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];

  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hexToRgb(hex) { const n = Number.parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  function randomSaturatedColor() {
    return hslToHex(Math.floor(rnd() * 360), 100, 48 + rnd() * 14);
  }
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
    ['scale','threshold','contrast','vignette','grain','imageScale','offsetX','offsetY','scale2','threshold2','contrast2','vignette2','grain2','imageScale2','offsetX2','offsetY2','textSize','density','overlay']
      .forEach((name) => {
        const input = $(name + 'Input');
        const out = $(name + 'Out');
        if (input && out) out.textContent = input.value;
      });
  }

  function floydSteinberg(lum, sw, sh) {
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const i = y * sw + x;
        const old = lum[i];
        const next = old > 128 ? 255 : 0;
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

  function bayerDither(lum, sw, sh) {
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const i = y * sw + x;
        const b = ((bayer4[y % 4][x % 4] + 0.5) / 16 - 0.5) * 110;
        lum[i] = lum[i] > 128 + b ? 255 : 0;
      }
    }
  }

  function getLayerSettings(suffix = '') {
    const valueOf = (base, fallback = 0) => Number($(base + suffix + 'Input')?.value ?? fallback);
    const elOf = (base) => $(base + suffix + 'Input');
    return {
      algorithm: elOf('algorithm').value,
      scale: clamp(valueOf('scale', 3), 3, 12),
      threshold: valueOf('threshold', 0),
      contrast: valueOf('contrast', 0),
      vignette: valueOf('vignette', 0),
      grain: valueOf('grain', 0),
      imageScale: valueOf('imageScale', 100) / 100,
      offsetX: valueOf('offsetX', 0),
      offsetY: valueOf('offsetY', 0),
      dark: suffix ? [0, 0, 0] : hexToRgb($('darkInput').value),
      hot: hexToRgb((suffix ? $('hot2Input') : $('hotInput')).value)
    };
  }

  function buildDitherCanvas(imgSource, settings, width, height, placeholderText, transparentDark = false) {
    const small = document.createElement('canvas');
    const sw = Math.max(1, Math.floor(width / settings.scale));
    const sh = Math.max(1, Math.floor(height / settings.scale));
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext('2d', { willReadFrequently: true });

    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, sw, sh);

    if (imgSource) {
      const [x, y, iw, ih] = fitCover(imgSource, sw, sh);
      const scaledW = iw * settings.imageScale;
      const scaledH = ih * settings.imageScale;
      const drawX = x - (scaledW - iw) / 2 + (settings.offsetX / 100) * sw;
      const drawY = y - (scaledH - ih) / 2 + (settings.offsetY / 100) * sh;
      sctx.drawImage(imgSource, drawX, drawY, scaledW, scaledH);
    } else if (placeholderText) {
      const grad = sctx.createLinearGradient(0, 0, sw, sh);
      grad.addColorStop(0, '#090909'); grad.addColorStop(0.45, '#aaa'); grad.addColorStop(1, '#030303');
      sctx.fillStyle = grad; sctx.fillRect(0, 0, sw, sh);
      sctx.fillStyle = '#ddd'; sctx.font = `900 ${Math.floor(sw / 10)}px ${fontStack()}`; sctx.fillText(placeholderText, sw * 0.08, sh * 0.52);
    }

    const img = sctx.getImageData(0, 0, sw, sh);
    const data = img.data;
    const lum = new Float32Array(sw * sh);
    const cFactor = settings.contrast >= 0 ? 1 + settings.contrast / 28 : 1 + settings.contrast / 100;
    const cx = sw / 2, cy = sh / 2, maxDist = Math.sqrt(cx * cx + cy * cy);

    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const di = (y * sw + x) * 4;
        let l = data[di] * 0.299 + data[di + 1] * 0.587 + data[di + 2] * 0.114;
        l = (l - 128) * cFactor + 128;
        // Threshold is intentionally applied as a strong luminance bias before error diffusion.
        // This makes Floyd–Steinberg visibly change the hot/dark ratio instead of mostly preserving average brightness.
        l -= settings.threshold * 2.0;
        if (settings.vignette > 0) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
          l *= 1 - smoothstep(0.38, 1, dist) * (settings.vignette / 100) * 0.96;
        }
        l += (Math.random() - 0.5) * settings.grain;
        lum[y * sw + x] = clamp(l, 0, 255);
      }
    }

    if (settings.algorithm === 'bayer') bayerDither(lum, sw, sh);
    else floydSteinberg(lum, sw, sh);

    const out = sctx.createImageData(sw, sh);
    for (let p = 0, i = 0; p < lum.length; p += 1, i += 4) {
      const isHot = lum[p] > 0;
      const col = isHot ? settings.hot : settings.dark;
      out.data[i] = col[0];
      out.data[i + 1] = col[1];
      out.data[i + 2] = col[2];
      out.data[i + 3] = transparentDark ? (isHot ? 255 : 0) : 255;
    }
    sctx.putImageData(out, 0, 0);
    return small;
  }

  function drawDither() {
    const w = clamp(Number($('widthInput').value) || 1200, 320, 2600);
    const h = clamp(Number($('heightInput').value) || 1500, 320, 2600);

    canvas.width = w;
    canvas.height = h;
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);

    const baseCanvas = buildDitherCanvas(sourceImage, getLayerSettings(''), w, h, 'DROP IMAGE', false);
    ctx.drawImage(baseCanvas, 0, 0, w, h);

    if ($('enableSecondLayerInput').checked && sourceImage2) {
      const overlayCanvas = buildDitherCanvas(sourceImage2, getLayerSettings('2'), w, h, '', true);
      ctx.drawImage(overlayCanvas, 0, 0, w, h);
    }
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
      const text = r < 0.36 ? icons[Math.floor(rnd() * icons.length)] : r < 0.72 ? labels[Math.floor(rnd() * labels.length)] : glyphs[Math.floor(rnd() * glyphs.length)].repeat(2 + Math.floor(rnd() * 7));
      drawText(text, w * (0.04 + rnd() * 0.92), h * (0.05 + rnd() * 0.9), cell * (0.7 + rnd() * 0.42), glyphColor, rnd() > 0.5 ? 'left' : 'center');
    }
  }

  function shuffledWords(words) {
    const arr = words.map((w) => w.toUpperCase());
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function drawWords(w, h, cell, wordColor, density, words) {
    const baseWords = shuffledWords(words);
    const extraCount = Math.floor(density * Math.max(2, words.length * 1.4));
    const totalCount = Math.max(words.length, baseWords.length + extraCount);

    for (let i = 0; i < totalCount; i += 1) {
      const word = i < baseWords.length
        ? baseWords[i]
        : words[Math.floor(rnd() * words.length)].toUpperCase();
      const sizeJitter = 0.78 + rnd() * 0.72;
      drawText(
        word,
        w * (0.08 + rnd() * 0.84),
        h * (0.1 + rnd() * 0.8),
        cell * sizeJitter,
        wordColor,
        'center',
        700
      );
    }
  }

  function updateSecondLayerUI() {
    const enabled = $('enableSecondLayerInput').checked;
    const ids = ['imageInput2','algorithm2Input','scale2Input','threshold2Input','contrast2Input','vignette2Input','grain2Input','imageScale2Input','offsetX2Input','offsetY2Input','hot2Input'];
    ids.forEach((id) => {
      const el = $(id);
      if (el) el.disabled = !enabled;
    });
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

  function randomizeAllColors() {
    $('darkInput').value = hslToHex(Math.floor(rnd() * 360), 100, 4 + rnd() * 8);
    $('hotInput').value = randomSaturatedColor();
    $('hot2Input').value = randomSaturatedColor();
    $('wordColorInput').value = randomSaturatedColor();
    $('glyphColorInput').value = randomSaturatedColor();
    render();
  }

  function render() { updateOutputs(); updateSecondLayerUI(); drawDither(); drawOverlay(); }

  function loadFile(file, slot) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (slot === 2) sourceImage2 = img; else sourceImage = img;
      URL.revokeObjectURL(url);
      render();
    };
    img.src = url;
  }

  $('imageInput').addEventListener('change', (event) => loadFile(event.target.files[0], 1));
  $('imageInput2').addEventListener('change', (event) => loadFile(event.target.files[0], 2));
  $('randomBtn').addEventListener('click', () => { seed = Math.floor(Math.random() * 0xffffffff); render(); });
  $('randomColorsBtn').addEventListener('click', () => { seed = Math.floor(Math.random() * 0xffffffff); randomizeAllColors(); });
  $('renderBtn').addEventListener('click', render);
  $('downloadBtn').addEventListener('click', () => { const a = document.createElement('a'); a.download = `dither_ascii_${Date.now()}.png`; a.href = canvas.toDataURL('image/png'); a.click(); });

  const dropzone = $('dropzone');
  ['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', (event) => loadFile(event.dataTransfer.files[0], 1));

  [
    'widthInput','heightInput','algorithmInput','scaleInput','thresholdInput','contrastInput','vignetteInput','grainInput','imageScaleInput','offsetXInput','offsetYInput','darkInput','hotInput',
    'enableSecondLayerInput','algorithm2Input','scale2Input','threshold2Input','contrast2Input','vignette2Input','grain2Input','imageScale2Input','offsetX2Input','offsetY2Input','hot2Input',
    'wordsInput','blendModeInput','fontInput','textSizeInput','densityInput','overlayInput','wordColorInput','glyphColorInput'
  ].forEach((id) => { const el = $(id); el.addEventListener('input', render); el.addEventListener('change', render); });

  render();
})();
