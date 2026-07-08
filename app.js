(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const FONT_STACK = '"Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';

  let sourceImage = null;
  let seed = Math.floor(Math.random() * 0xffffffff);

  const systemWords = ['NULL', 'SIGNAL', 'VECTOR', 'GHOST', 'SHELL', 'DELTA', 'EXIT', 'VOID', 'SYNC', 'BOOT', 'TRACE', 'ROOT'];
  const asciiBits = ['▓', '▒', '░', '█', '╬', '╫', '┼', '┬', '┴', '╳', '╱', '╲', '│', '─', '═', '║', '¦', ':', '.', '+', '*', '0', '1', '<', '>', '[', ']', '{', '}'];
  const asciiChunks = [
    '[SYS]', '[ERR]', '[RUN]', '[LOCK]', '<root>', '<void>', '0x00FF', '101101', 'ΔΔΔ', '::', '▓▒░', '█▒█', '<<<', '>>>', '||', '++',
    '[[]]', '{::}', '/\\', '\\/', '<-#->', '[=]', '[I/O]', '<:>', '{/}', '[01]', '<bus>', '|:|'
  ];
  const iconSet = ['[+]', '[x]', '<+>', '<#>', '/\\', '\\/', '[[]]', '{-}', '<01>', '[::]', '|-|', '<*>', '{+}', '[><]', '<|>'];
  const boxStyles = [
    { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
    { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
    { tl: '[', tr: ']', bl: '[', br: ']', h: '=', v: '|' },
    { tl: '<', tr: '>', bl: '<', br: '>', h: '-', v: ':' }
  ];
  const bayer4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

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
        const matrixVal = bayer4[y % 4][x % 4];
        const bias = ((matrixVal + 0.5) / 16 - 0.5) * 96;
        lum[i] = lum[i] > 128 + threshold + bias ? 255 : 0;
      }
    }
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
    const algorithm = $('algorithmInput').value;

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
      sctx.font = `900 ${Math.floor(sw / 10)}px ${FONT_STACK}`;
      sctx.fillText('DROP IMAGE', sw * 0.12, sh * 0.52);
    }

    applyVignetteToContext(sctx, sw, sh, vignette);

    const img = sctx.getImageData(0, 0, sw, sh);
    const data = img.data;
    const lum = new Float32Array(sw * sh);

    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      lum[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 + (Math.random() - 0.5) * grain;
    }

    if (algorithm === 'bayer') bayerDither(lum, sw, sh, threshold);
    else floydSteinberg(lum, sw, sh, threshold);

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

  function setCanvasFont(size) {
    ctx.font = `400 ${Math.max(10, Math.floor(size))}px ${FONT_STACK}`;
    ctx.textBaseline = 'alphabetic';
  }

  function drawTextBlock(text, x, y, size, alpha = 1, align = 'left', color = '#fff') {
    ctx.globalAlpha = alpha;
    setCanvasFont(size);
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawAsciiBox(region, cell, alpha, color) {
    const style = boxStyles[Math.floor(rnd() * boxStyles.length)];
    const charWidth = cell * 0.62;
    const cols = Math.max(5, Math.floor(region.w / charWidth) - 2);
    const rows = Math.max(3, Math.floor(region.h / cell) - 1);
    if (cols < 5 || rows < 3) return;

    const top = `${style.tl}${style.h.repeat(cols)}${style.tr}`;
    const bottom = `${style.bl}${style.h.repeat(cols)}${style.br}`;
    drawTextBlock(top, region.x, region.y + cell * 0.85, cell, alpha, 'left', color);
    drawTextBlock(bottom, region.x, region.y + rows * cell, cell, alpha, 'left', color);

    for (let i = 1; i < rows; i += 1) {
      const yy = region.y + i * cell;
      drawTextBlock(style.v, region.x, yy, cell, alpha * 0.95, 'left', color);
      drawTextBlock(style.v, region.x + (cols + 1) * charWidth, yy, cell, alpha * 0.95, 'left', color);
    }

    const internalLabels = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < internalLabels; i += 1) {
      const txt = asciiChunks[Math.floor(rnd() * asciiChunks.length)];
      const tx = region.x + charWidth * (1.2 + rnd() * Math.max(1, cols - 4));
      const ty = region.y + cell * (1.6 + rnd() * Math.max(1, rows - 2));
      drawTextBlock(txt, tx, ty, cell * 0.78, alpha * (0.25 + rnd() * 0.25), 'left', color);
    }
  }

  function chooseRegions(w, h) {
    const mode = Math.floor(rnd() * 6);
    const regions = [];
    const add = (x, y, rw, rh) => regions.push({ x, y, w: rw, h: rh });

    if (mode === 0) {
      add(w * 0.08, h * 0.1, w * 0.34, h * 0.2);
      add(w * 0.48, h * 0.53, w * 0.36, h * 0.22);
      add(w * 0.2, h * 0.72, w * 0.24, h * 0.14);
    } else if (mode === 1) {
      add(w * 0.15, h * 0.18, w * 0.26, h * 0.48);
      add(w * 0.52, h * 0.12, w * 0.26, h * 0.24);
      add(w * 0.45, h * 0.58, w * 0.32, h * 0.2);
    } else if (mode === 2) {
      add(w * 0.12, h * 0.12, w * 0.62, h * 0.18);
      add(w * 0.28, h * 0.42, w * 0.44, h * 0.16);
      add(w * 0.2, h * 0.7, w * 0.56, h * 0.16);
    } else if (mode === 3) {
      add(w * 0.1, h * 0.2, w * 0.28, h * 0.22);
      add(w * 0.47, h * 0.14, w * 0.34, h * 0.34);
      add(w * 0.22, h * 0.6, w * 0.5, h * 0.22);
    } else if (mode === 4) {
      add(w * 0.18, h * 0.1, w * 0.22, h * 0.18);
      add(w * 0.52, h * 0.22, w * 0.24, h * 0.4);
      add(w * 0.16, h * 0.62, w * 0.34, h * 0.18);
    } else {
      add(w * 0.08, h * 0.14, w * 0.3, h * 0.26);
      add(w * 0.4, h * 0.38, w * 0.22, h * 0.3);
      add(w * 0.62, h * 0.16, w * 0.24, h * 0.18);
      add(w * 0.58, h * 0.68, w * 0.22, h * 0.12);
    }

    return regions;
  }

  function scatterWords(pool, w, h, cell, alpha, wordColor) {
    const count = Math.min(7, Math.max(3, pool.length));
    for (let i = 0; i < count; i += 1) {
      const word = pool[i % pool.length].toUpperCase();
      const size = cell * (0.95 + rnd() * 0.55);
      const x = w * (0.12 + rnd() * 0.76);
      const y = h * (0.12 + rnd() * 0.76);
      drawTextBlock(word, x, y, size, alpha * (0.34 + rnd() * 0.46), 'center', wordColor);
    }
  }

  function scatterGlyphs(w, h, cell, alpha, glyphColor) {
    const count = Math.floor((w + h) / 65);
    for (let i = 0; i < count; i += 1) {
      const useChunk = rnd() > 0.58;
      const txt = useChunk
        ? asciiChunks[Math.floor(rnd() * asciiChunks.length)]
        : asciiBits[Math.floor(rnd() * asciiBits.length)].repeat(1 + Math.floor(rnd() * 5));
      const x = w * (0.04 + rnd() * 0.92);
      const y = h * (0.05 + rnd() * 0.9);
      const size = cell * (0.72 + rnd() * 0.6);
      const align = rnd() > 0.5 ? 'left' : 'center';
      drawTextBlock(txt, x, y, size, alpha * (0.08 + rnd() * 0.3), align, glyphColor);
    }
  }

  function drawRegionAnchors(regions, cell, alpha, glyphColor, wordColor, pool) {
    regions.forEach((region, idx) => {
      drawAsciiBox(region, cell * (0.92 + rnd() * 0.2), alpha * (0.16 + rnd() * 0.28), glyphColor);

      const label = pool[idx % pool.length].toUpperCase();
      const x = region.x + region.w * (0.2 + rnd() * 0.6);
      const y = region.y + region.h * (0.28 + rnd() * 0.5);
      drawTextBlock(label, x, y, cell * (0.98 + rnd() * 0.42), alpha * (0.45 + rnd() * 0.3), 'center', wordColor);

      const glyphLine = `${iconSet[Math.floor(rnd() * iconSet.length)]}${asciiBits[Math.floor(rnd() * asciiBits.length)].repeat(2 + Math.floor(rnd() * 6))}${iconSet[Math.floor(rnd() * iconSet.length)]}`;
      drawTextBlock(glyphLine, x, y + cell * (0.8 + rnd() * 0.8), cell * 0.82, alpha * (0.22 + rnd() * 0.22), 'center', glyphColor);
    });
  }

  function drawOverlay() {
    const w = canvas.width;
    const h = canvas.height;
    const alpha = Number($('overlayInput').value) / 100;
    const textScale = Number($('textSizeInput').value) / 100;
    const words = $('wordsInput').value.split(',').map((s) => s.trim()).filter(Boolean);
    const pool = words.length ? words : systemWords;
    const glyphColor = $('glyphColorInput').value;
    const wordColor = $('wordColorInput').value;
    const cell = Math.max(12, Math.min(w, h) * 0.018 * textScale);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowBlur = 7;

    const regions = chooseRegions(w, h);
    drawRegionAnchors(regions, cell, alpha, glyphColor, wordColor, pool);
    scatterWords(pool, w, h, cell, alpha, wordColor);
    scatterGlyphs(w, h, cell, alpha, glyphColor);

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
    'wordsInput', 'widthInput', 'heightInput', 'algorithmInput', 'scaleInput', 'thresholdInput', 'vignetteInput',
    'darkInput', 'hotInput', 'glyphColorInput', 'wordColorInput', 'grainInput', 'overlayInput', 'textSizeInput'
  ].forEach((id) => $(id).addEventListener('input', render));

  render();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(render).catch(() => {});
  }
})();
