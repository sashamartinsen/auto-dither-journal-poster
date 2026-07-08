(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const FONT_STACK = 'Consolas, "Cascadia Mono", "Lucida Console", "Courier New", monospace';

  let sourceImage = null;
  let seed = Math.floor(Math.random() * 0xffffffff);

  const systemWords = ['NULL', 'SIGNAL', 'VECTOR', 'GHOST', 'SHELL', 'DELTA', 'EXIT', 'VOID', 'SYNC', 'BOOT', 'TRACE', 'ROOT'];
  const asciiChunks = ['[SYS]', '[ERR]', '[RUN]', '[LOCK]', '<root>', '0x00FF', '101101', 'ΔΔΔ', '::', '▓▒░', '█▒█', '<<<', '>>>', '||', '++', '[[]]', '{::}', '/\\', '\\/', '<-#->', '[=]', '[I/O]', '<:>', '{/}', '[01]', '<bus>', '|:|'];
  const asciiBits = ['▓', '▒', '░', '█', '╬', '┼', '┬', '┴', '╳', '╱', '╲', '│', '─', '═', '║', ':', '.', '+', '*', '0', '1', '<', '>', '[', ']', '{', '}'];
  const iconSet = ['[+]', '[x]', '<+>', '<#>', '/\\', '\\/', '[[]]', '{-}', '<01>', '[::]', '|-|', '<*>', '{+}', '[><]', '<|>'];
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

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
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

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function updateOutputs() {
    $('scaleOut').textContent = $('scaleInput').value;
    $('thresholdOut').textContent = $('thresholdInput').value;
    $('vignetteOut').textContent = $('vignetteInput').value;
    $('grainOut').textContent = $('grainInput').value;
    $('overlayOut').textContent = $('overlayInput').value;
    $('textSizeOut').textContent = $('textSizeInput').value;
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
        const mult = 1 - edge * strength * 0.96;
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

  function setCanvasFont(size, weight = 400) {
    ctx.font = `${weight} ${Math.max(10, Math.floor(size))}px ${FONT_STACK}`;
    ctx.textBaseline = 'alphabetic';
  }

  function drawText(text, x, y, size, alpha, align, color, weight = 400) {
    ctx.globalAlpha = alpha;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    setCanvasFont(size, weight);
    ctx.fillText(text, x, y);
  }

  function pickWords() {
    const words = $('wordsInput').value.split(',').map((s) => s.trim()).filter(Boolean);
    return words.length ? words : systemWords;
  }

  function chooseRegions(w, h) {
    const regions = [];
    const count = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < count; i += 1) {
      const rw = w * (0.18 + rnd() * 0.28);
      const rh = h * (0.1 + rnd() * 0.22);
      const x = w * (0.06 + rnd() * 0.7);
      const y = h * (0.08 + rnd() * 0.76);
      regions.push({ x, y, w: rw, h: rh });
    }
    return regions;
  }

  function drawAsciiBox(region, cell, alpha, color) {
    const charW = cell * 0.62;
    const cols = Math.max(6, Math.floor(region.w / charW) - 2);
    const rows = Math.max(4, Math.floor(region.h / cell) - 1);
    if (cols < 6 || rows < 4) return;

    const styles = [
      { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
      { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
      { tl: '[', tr: ']', bl: '[', br: ']', h: '=', v: '|' },
      { tl: '<', tr: '>', bl: '<', br: '>', h: '-', v: ':' }
    ];
    const s = styles[Math.floor(rnd() * styles.length)];

    drawText(`${s.tl}${s.h.repeat(cols)}${s.tr}`, region.x, region.y + cell * 0.9, cell, alpha, 'left', color);
    drawText(`${s.bl}${s.h.repeat(cols)}${s.br}`, region.x, region.y + rows * cell, cell, alpha, 'left', color);

    for (let i = 1; i < rows; i += 1) {
      const yy = region.y + i * cell;
      drawText(s.v, region.x, yy, cell, alpha * 0.9, 'left', color);
      drawText(s.v, region.x + (cols + 1) * charW, yy, cell, alpha * 0.9, 'left', color);
    }
  }

  function drawOverlay() {
    const w = canvas.width;
    const h = canvas.height;
    const alpha = Number($('overlayInput').value) / 100;
    const textScale = Number($('textSizeInput').value) / 100;
    const glyphColor = $('glyphColorInput').value;
    const wordColor = $('wordColorInput').value;
    const pool = pickWords();
    const cell = Math.max(12, Math.min(w, h) * 0.016 * textScale);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const regions = chooseRegions(w, h);
    regions.forEach((region, idx) => {
      drawAsciiBox(region, cell * (0.9 + rnd() * 0.18), alpha * (0.18 + rnd() * 0.22), glyphColor);
      const word = pool[idx % pool.length].toUpperCase();
      const cx = region.x + region.w * (0.3 + rnd() * 0.4);
      const cy = region.y + region.h * (0.45 + rnd() * 0.2);
      drawText(word, cx, cy, cell * (0.95 + rnd() * 0.3), alpha * (0.42 + rnd() * 0.3), 'center', wordColor, 700);

      const label = `${iconSet[Math.floor(rnd() * iconSet.length)]} ${asciiChunks[Math.floor(rnd() * asciiChunks.length)]} ${iconSet[Math.floor(rnd() * iconSet.length)]}`;
      drawText(label, cx, cy + cell * (0.85 + rnd() * 0.6), cell * 0.82, alpha * (0.22 + rnd() * 0.22), 'center', glyphColor);
    });

    const scatteredWords = Math.min(6, Math.max(3, pool.length));
    for (let i = 0; i < scatteredWords; i += 1) {
      const word = pool[i % pool.length].toUpperCase();
      drawText(word, w * (0.12 + rnd() * 0.76), h * (0.12 + rnd() * 0.76), cell * (0.9 + rnd() * 0.35), alpha * (0.28 + rnd() * 0.22), 'center', wordColor, 700);
    }

    const glyphCount = Math.floor((w + h) / 55);
    for (let i = 0; i < glyphCount; i += 1) {
      const useChunk = rnd() > 0.5;
      const text = useChunk
        ? asciiChunks[Math.floor(rnd() * asciiChunks.length)]
        : asciiBits[Math.floor(rnd() * asciiBits.length)].repeat(1 + Math.floor(rnd() * 5));
      drawText(text, w * (0.04 + rnd() * 0.92), h * (0.05 + rnd() * 0.9), cell * (0.72 + rnd() * 0.35), alpha * (0.08 + rnd() * 0.18), rnd() > 0.5 ? 'left' : 'center', glyphColor);
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

  const bindIds = [
    'wordsInput', 'widthInput', 'heightInput', 'algorithmInput', 'scaleInput', 'thresholdInput', 'vignetteInput',
    'darkInput', 'hotInput', 'glyphColorInput', 'wordColorInput', 'grainInput', 'overlayInput', 'textSizeInput'
  ];
  bindIds.forEach((id) => {
    const el = $(id);
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  render();
})();
