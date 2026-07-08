(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const FONT_STACK = 'Consolas, "Cascadia Mono", "Lucida Console", "Courier New", monospace';

  let sourceImage = null;
  let seed = Math.floor(Math.random() * 0xffffffff);

  const systemWords = ['NULL', 'SIGNAL', 'VECTOR', 'GHOST', 'SHELL', 'DELTA', 'EXIT', 'VOID', 'SYNC', 'BOOT', 'TRACE', 'ROOT'];
  const labels = ['[SYS]', '[ERR]', '[RUN]', '[LOCK]', '<root>', '0x00FF', '101101', '[I/O]', '<bus>', '|:|', '>>>', '<<<'];
  const icons = ['[+]', '[x]', '<+>', '<#>', '/\\', '\\/', '[[]]', '{-}', '<01>', '[::]', '|-|', '<*>', '{+}', '[><]', '<|>'];
  const bits = ['+', 'x', '#', '*', ':', '.', '0', '1', '<', '>', '[', ']', '{', '}', '|', '/', '\\', '-', '=', '_'];
  const bayer4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];

  function rnd(){ seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function hexToRgb(hex){ const n = Number.parseInt(hex.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }
  function fitCover(img,w,h){ const s=Math.max(w/img.width,h/img.height); const iw=img.width*s; const ih=img.height*s; return [(w-iw)/2,(h-ih)/2,iw,ih]; }
  function smoothstep(a,b,x){ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); }

  function updateOutputs(){
    $('scaleOut').textContent = $('scaleInput').value;
    $('thresholdOut').textContent = $('thresholdInput').value;
    $('contrastOut').textContent = $('contrastInput').value;
    $('vignetteOut').textContent = $('vignetteInput').value;
    $('grainOut').textContent = $('grainInput').value;
    $('overlayOut').textContent = $('overlayInput').value;
    $('textSizeOut').textContent = $('textSizeInput').value;
  }

  function applyPreprocess(targetCtx,w,h,vignettePct,contrastPct){
    const vignette=clamp(vignettePct/100,0,1);
    const c=Number(contrastPct)||0;
    const factor=(259*(c+255))/(255*(259-c));
    const img=targetCtx.getImageData(0,0,w,h);
    const data=img.data;
    const cx=w/2, cy=h/2, maxDist=Math.sqrt(cx*cx+cy*cy);
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        data[i]=clamp(factor*(data[i]-128)+128,0,255);
        data[i+1]=clamp(factor*(data[i+1]-128)+128,0,255);
        data[i+2]=clamp(factor*(data[i+2]-128)+128,0,255);
        if(vignette>0){
          const dx=x-cx, dy=y-cy;
          const edge=smoothstep(0.38,1,Math.sqrt(dx*dx+dy*dy)/maxDist);
          const mult=1-edge*vignette*0.96;
          data[i]*=mult; data[i+1]*=mult; data[i+2]*=mult;
        }
      }
    }
    targetCtx.putImageData(img,0,0);
  }

  function floydSteinberg(lum,sw,sh,threshold){
    for(let y=0;y<sh;y++) for(let x=0;x<sw;x++){
      const i=y*sw+x, old=lum[i], next=old>128+threshold?255:0, err=old-next;
      lum[i]=next;
      if(x+1<sw) lum[i+1]+=err*7/16;
      if(y+1<sh){ if(x>0) lum[i+sw-1]+=err*3/16; lum[i+sw]+=err*5/16; if(x+1<sw) lum[i+sw+1]+=err/16; }
    }
  }
  function bayerDither(lum,sw,sh,threshold){
    for(let y=0;y<sh;y++) for(let x=0;x<sw;x++){
      const m=bayer4[y%4][x%4];
      const bias=((m+0.5)/16-0.5)*96;
      const i=y*sw+x;
      lum[i]=lum[i]>128+threshold+bias?255:0;
    }
  }

  function drawDither(){
    const w=clamp(Number($('widthInput').value)||1200,320,2600);
    const h=clamp(Number($('heightInput').value)||1500,320,2600);
    const pixelScale=clamp(Number($('scaleInput').value)||3,3,12);
    const threshold=Number($('thresholdInput').value)||0;
    const contrast=Number($('contrastInput').value)||0;
    const vignette=Number($('vignetteInput').value)||0;
    const grain=Number($('grainInput').value)||0;
    const dark=hexToRgb($('darkInput').value);
    const hot=hexToRgb($('hotInput').value);
    const algorithm=$('algorithmInput').value;

    canvas.width=w; canvas.height=h;
    const small=document.createElement('canvas');
    const sw=Math.max(1,Math.floor(w/pixelScale));
    const sh=Math.max(1,Math.floor(h/pixelScale));
    small.width=sw; small.height=sh;
    const sctx=small.getContext('2d',{willReadFrequently:true});
    sctx.fillStyle='#000'; sctx.fillRect(0,0,sw,sh);

    if(sourceImage){ const [x,y,iw,ih]=fitCover(sourceImage,sw,sh); sctx.drawImage(sourceImage,x,y,iw,ih); }
    else{
      const grad=sctx.createLinearGradient(0,0,sw,sh);
      grad.addColorStop(0,'#080808'); grad.addColorStop(.45,'#9b9b9b'); grad.addColorStop(1,'#050505');
      sctx.fillStyle=grad; sctx.fillRect(0,0,sw,sh);
      sctx.fillStyle='#ddd'; sctx.font=`900 ${Math.floor(sw/10)}px ${FONT_STACK}`; sctx.fillText('DROP IMAGE',sw*.12,sh*.52);
    }

    applyPreprocess(sctx,sw,sh,vignette,contrast);
    const img=sctx.getImageData(0,0,sw,sh), data=img.data, lum=new Float32Array(sw*sh);
    for(let i=0,p=0;i<data.length;i+=4,p++) lum[p]=data[i]*.299+data[i+1]*.587+data[i+2]*.114+(Math.random()-.5)*grain;
    if(algorithm==='bayer') bayerDither(lum,sw,sh,threshold); else floydSteinberg(lum,sw,sh,threshold);
    const out=sctx.createImageData(sw,sh);
    for(let p=0,i=0;p<lum.length;p++,i+=4){ const col=lum[p]>0?hot:dark; out.data[i]=col[0]; out.data[i+1]=col[1]; out.data[i+2]=col[2]; out.data[i+3]=255; }
    sctx.putImageData(out,0,0);
    ctx.imageSmoothingEnabled=false; ctx.clearRect(0,0,w,h); ctx.drawImage(small,0,0,w,h);
  }

  function drawText(text,x,y,size,alpha,align,color,weight=400){
    ctx.save();
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=clamp(alpha,0,1);
    ctx.fillStyle=color;
    ctx.shadowBlur=0;
    ctx.textAlign=align;
    ctx.textBaseline='alphabetic';
    ctx.font=`${weight} ${Math.max(10,Math.floor(size))}px ${FONT_STACK}`;
    ctx.fillText(text,x,y);
    ctx.restore();
  }
  function pool(){ const w=$('wordsInput').value.split(',').map(s=>s.trim()).filter(Boolean); return w.length?w:systemWords; }
  function lineString(horizontal,len){ const chars=horizontal?['-','=','_','·']:['|',':','¦']; return chars[Math.floor(rnd()*chars.length)].repeat(Math.max(2,len)); }

  function drawRulers(w,h,cell,alpha,color){
    const count=12+Math.floor(rnd()*14);
    for(let i=0;i<count;i++){
      const horizontal=rnd()>.42;
      if(horizontal){
        const len=5+Math.floor(rnd()*30);
        const prefix=rnd()>.65 ? icons[Math.floor(rnd()*icons.length)]+' ' : '';
        drawText(prefix+lineString(true,len),w*(.05+rnd()*.82),h*(.06+rnd()*.88),cell*(.72+rnd()*.35),alpha,'left',color);
      }else{
        const len=3+Math.floor(rnd()*12), x=w*(.05+rnd()*.9), y=h*(.08+rnd()*.78), ch=['|',':','¦'][Math.floor(rnd()*3)];
        for(let j=0;j<len;j++) drawText(ch,x,y+j*cell*.9,cell*(.72+rnd()*.25),alpha,'center',color);
      }
    }
  }
  function drawIcons(w,h,cell,alpha,color){
    const count=Math.floor((w+h)/70);
    for(let i=0;i<count;i++){
      const r=rnd();
      let text = r<.38 ? icons[Math.floor(rnd()*icons.length)] : r<.72 ? labels[Math.floor(rnd()*labels.length)] : bits[Math.floor(rnd()*bits.length)].repeat(2+Math.floor(rnd()*6));
      drawText(text,w*(.04+rnd()*.92),h*(.05+rnd()*.9),cell*(.72+rnd()*.35),alpha,rnd()>.5?'left':'center',color);
    }
  }
  function drawWords(w,h,cell,alpha,color,words){
    const count=4+Math.floor(rnd()*5);
    for(let i=0;i<count;i++) drawText(words[i%words.length].toUpperCase(),w*(.1+rnd()*.8),h*(.12+rnd()*.76),cell*(.95+rnd()*.42),alpha,'center',color,700);
  }
  function drawOverlay(){
    const w=canvas.width,h=canvas.height;
    const alpha=Number($('overlayInput').value)/100;
    const textScale=Number($('textSizeInput').value)/100;
    const glyphColor=$('glyphColorInput').value, wordColor=$('wordColorInput').value;
    const cell=Math.max(12,Math.min(w,h)*.016*textScale);
    ctx.save();
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=1; ctx.shadowBlur=0;
    drawRulers(w,h,cell,alpha,glyphColor);
    drawIcons(w,h,cell,alpha,glyphColor);
    drawWords(w,h,cell,alpha,wordColor,pool());
    ctx.restore();
  }

  function render(){ updateOutputs(); drawDither(); drawOverlay(); }
  function loadFile(file){ if(!file||!file.type.startsWith('image/')) return; const url=URL.createObjectURL(file); const img=new Image(); img.onload=()=>{ sourceImage=img; URL.revokeObjectURL(url); render(); }; img.src=url; }

  $('imageInput').addEventListener('change',e=>loadFile(e.target.files[0]));
  $('randomBtn').addEventListener('click',()=>{ seed=Math.floor(Math.random()*0xffffffff); render(); });
  $('renderBtn').addEventListener('click',render);
  $('downloadBtn').addEventListener('click',()=>{ const a=document.createElement('a'); a.download=`dither_ascii_${Date.now()}.png`; a.href=canvas.toDataURL('image/png'); a.click(); });

  const dropzone=$('dropzone');
  ['dragenter','dragover'].forEach(n=>dropzone.addEventListener(n,e=>{ e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(n=>dropzone.addEventListener(n,e=>{ e.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));

  ['wordsInput','widthInput','heightInput','algorithmInput','scaleInput','thresholdInput','contrastInput','vignetteInput','darkInput','hotInput','glyphColorInput','wordColorInput','grainInput','overlayInput','textSizeInput']
    .forEach(id=>{ const el=$(id); el.addEventListener('input',render); el.addEventListener('change',render); });

  render();
})();
