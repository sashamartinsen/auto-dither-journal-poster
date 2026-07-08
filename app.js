(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let sourceImage = null;
  let seed = Math.floor(Math.random() * 0xffffffff);

  const systemWords = ['NULL', 'SIGNAL', 'VECTOR', 'GHOST', 'SHELL', 'DELTA', 'EXIT', 'VOID', 'SYNC', 'BOOT', 'TRACE', 'ROOT'];
  const asciiChunks = [
    '╔════════╗', '╚════════╝', '▓▒░', '░▒▓', '█▓▒░', '╳╳╳', '/////', '|||||', '>>>', '<<<',
    '[SYS]', '[ERR]', '[RUN]', '<root>', '0x00FF', '101101', 'ΔΔΔ', '◆◇◆', '┌─┐', '└─┘', '╬╬╬', '::::', '— — —'
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

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function updateOutputs() {
    $('scaleOut').textContent = $('scaleInput').value;
    $('thresholdOut').textContent = $('thresholdInput').value;
    $('grainOut').textContent = $('grainInput').value;
    $('overlayOut').textContent = $('overlayInput').value;
    $('textSizeOut').textContent = $('textSizeInput').value;
  }

  function drawDither() {
    const w = clamp(Number($('widthInput').value) || 1200, 320, 2600);
    const h = clamp(Number($('heightInput').value) || 1500, 320, 2600);
    const pixelScale = Number($('scaleInput').value) || 3;
    const threshold = Number($('thresholdInput').value) || 0;
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
    ctx.drawImage(small, 0, 0, w, h);
  }

  function drawOverlay() {
    const w = canvas.width;
    const h = canvas.height;
    const alpha = Number($('overlayInput').value) / 100;
    const textScale = Number($('textSizeInput').value) / 100;
    const words = $('wordsInput').value.split(',').map((s) => s.trim()).filter(Boolean);
    const pool = words.length ? words : systemWords;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = $('asciiInput').value;
    ctx.strokeStyle = $('asciiInput').value;
    ctx.lineWidth = Math.max(1, w * 0.0015);
    ctx.shadowColor = $('asciiInput').value;
    ctx.shadowBlur = 7;

    for (let i = 0; i < 48; i += 1) {
      const size = Math.floor((10 + rnd() * 32) * textScale);
      const x = rnd() * w;
      const y = rnd() * h;
      const chunk = asciiChunks[Math.floor(rnd() * asciiChunks.length)];
      ctx.font = `${size}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.globalAlpha = alpha * (0.18 + rnd() * 0.62);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rnd() - 0.5) * 0.38);
      ctx.fillText(chunk.repeat(1 + Math.floor(rnd() * 3)), 0, 0);
      ctx.restore();
    }

    ctx.globalAlpha = alpha;
    pool.slice(0, 5).forEach((word, i) => {
      const size = Math.floor(w * (i === 0 ? 0.078 : 0.048) * textScale);
      ctx.font = `900 ${size}px ui-monospace, Menlo, Consolas, monospace`;
      const x = w * (0.055 + rnd() * 0.18);
      const y = h * (0.19 + i * 0.14 + rnd() * 0.04);
      const text = word.toUpperCase();
      ctx.fillText(text, x + 3, y);
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillText(text, x - 6, y + 5);
      ctx.globalAlpha = alpha;
    });

    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha * 0.65;
    ctx.strokeRect(w * 0.035, h * 0.035, w * 0.93, h * 0.93);

    ctx.beginPath();
    for (let y = h * 0.08; y < h * 0.94; y += h * 0.075) {
      ctx.moveTo(w * 0.035, y);
      ctx.lineTo(w * 0.965, y + (rnd() - 0.5) * 18);
    }
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.86;
    ctx.font = `${Math.floor(w * 0.017 * textScale)}px ui-monospace, Menlo, Consolas, monospace`;
    for (let i = 0; i < 14; i += 1) {
      const label = `${systemWords[Math.floor(rnd() * systemWords.length)]} // ${Math.floor(rnd() * 9999).toString().padStart(4, '0')}`;
      ctx.fillText(label, w * 0.055, h * (0.055 + i * 0.033));
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
  $('randomBtn').addEventListener('click', () => { seed = Math.floor(Math.random() * 0xffffffff); render(); });
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

  ['wordsInput', 'widthInput', 'heightInput', 'scaleInput', 'thresholdInput', 'darkInput', 'hotInput', 'asciiInput', 'grainInput', 'overlayInput', 'textSizeInput']
    .forEach((id) => $(id).addEventListener('input', render));

  render();
})();
