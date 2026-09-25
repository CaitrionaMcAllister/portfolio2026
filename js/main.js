  // ---------- Dark / light mode toggle ----------
  (function(){
    const STORAGE_KEY = 'theme';
    const toggles = document.querySelectorAll('.theme-toggle');
    if(!toggles.length) return;

    function apply(theme){
      if(theme === 'dark'){
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      toggles.forEach(btn => {
        btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      });
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if(saved === 'dark') apply('dark');

    toggles.forEach(btn => {
      btn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const next = isDark ? 'light' : 'dark';
        apply(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch(e){ /* ignore (private mode, etc.) */ }
      });
    });
  })();

  // ---------- Landing text swipe (scroll-matched) + Work grid reveal ----------
  // The landing page stays pinned via position:sticky while the work
  // cover panel rises over it. Rather than animate the text on a fixed
  // timer, we compute exactly how far the cover has risen (0 = not
  // started, 1 = fully covering) and drive the text's vertical
  // position/opacity directly from that number every frame — so it
  // always matches scroll position 1:1, at any speed, either direction.
  (function(){
    const heroContent = document.querySelector('.hero-content');
    const landingNav = document.querySelector('.landing-nav');
    const workCover = document.querySelector('.work-cover');
    const grid = document.querySelector('.grid3x3');
    const workSection = document.getElementById('work');
    if(!workCover) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let ticking = false;

    function update(){
      const vh = window.innerHeight;
      const coverRect = workCover.getBoundingClientRect();

      // Progress of the cover's rise: 0 while it's still below the
      // viewport, 1 once its top has reached the top of the screen
      let progress = 1 - (coverRect.top / vh);
      progress = Math.max(0, Math.min(1, progress));

      const ease = progress * progress * (3 - 2 * progress); // smoothstep

      if(!reduceMotion){
        if(heroContent){
          heroContent.style.transform = `translate(-50%, calc(-50% - ${ease * 90}px))`;
          heroContent.style.opacity = String(1 - ease);
        }
        if(landingNav){
          landingNav.style.transform = `translateY(${ease * 90}px)`;
          landingNav.style.opacity = String(1 - ease);
        }
      }

      if(workSection && grid){
        const workRect = workSection.getBoundingClientRect();
        grid.classList.toggle('is-visible', workRect.top < vh * 0.75);
      }

      ticking = false;
    }

    function onScroll(){
      if(!ticking){
        requestAnimationFrame(update);
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update(); // set initial state
  })();

  // ---------- Pixel grid reveal: cursor lights up blocks in the footer area ----------
  (function(){
   try {
    const canvas = document.getElementById('pixelGridCanvas');
    const section = document.querySelector('.monogram-section');
    if(!canvas || !section) return;
    const ctx = canvas.getContext('2d');
    if(!ctx) return;

    const CELL = 42;       // grid cell size in px
    const CELL_LIFE = 900;  // ms a lit cell stays visible before fading
    let dpr = 1;
    let cells = []; // { x, y, t }
    let logicalWidth = 0, logicalHeight = 0; // cached so render() never forces a layout read

    function resize(){
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const rect = section.getBoundingClientRect();
      logicalWidth = rect.width;
      logicalHeight = rect.height;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    // The section's height can change after init (e.g. once the monogram
    // text's font-size is set following font load) — a plain resize
    // listener won't catch that, so watch the section itself directly.
    if(window.ResizeObserver){
      new ResizeObserver(resize).observe(section);
    }
    resize();

    function snapToCell(v){ return Math.floor(v / CELL) * CELL; }

    function lightCell(clientX, clientY){
      const rect = section.getBoundingClientRect();
      const x = snapToCell(clientX - rect.left);
      const y = snapToCell(clientY - rect.top);
      // avoid stacking duplicate entries for the same cell
      const existing = cells.find(c => c.x === x && c.y === y);
      if(existing){ existing.t = performance.now(); }
      else{
        cells.push({ x, y, t: performance.now() });
        if(cells.length > 300) cells.shift();
      }
    }

    section.addEventListener('mousemove', (e) => lightCell(e.clientX, e.clientY), { passive: true });
    section.addEventListener('touchmove', (e) => {
      if(e.touches[0]) lightCell(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    let rafId = null;
    function render(){
      const now = performance.now();
      ctx.clearRect(0, 0, logicalWidth, logicalHeight);

      cells = cells.filter(c => now - c.t < CELL_LIFE);
      cells.forEach(c => {
        const age = (now - c.t) / CELL_LIFE;
        const alpha = (1 - age) * 0.5;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(c.x, c.y, CELL - 2, CELL - 2);
      });
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(render);
    }

    // Only keep this canvas repainting every frame while its section is
    // actually on screen — otherwise it was clearing/redrawing 60x a
    // second for nothing, competing with everything else (including the
    // ticker marquee) for main-thread time and making other animations
    // on the page feel choppy.
    if(window.IntersectionObserver){
      new IntersectionObserver((entries) => {
        const visible = entries[0]?.isIntersecting;
        if(visible && rafId === null){
          rafId = requestAnimationFrame(render);
        } else if(!visible && rafId !== null){
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      }, { threshold: 0 }).observe(section);
    } else {
      rafId = requestAnimationFrame(render);
    }
   } catch(err){
     console.warn('Pixel grid effect failed to start:', err);
   }
  })();

  // ---------- Monogram: fills page width, reveals letter by letter as scrolled ----------
  (function(){
    const wrap = document.querySelector('.monogram-wrap');
    const text = document.getElementById('monogramText');
    const section = document.querySelector('.monogram-section');
    if(!wrap || !text || !section) return;
    const chars = Array.from(text.querySelectorAll('.mchar'));

    // Fit the text to the available width by computing the exact font-size
    // needed (rather than transform:scale, which was causing rendering
    // artifacts on this decorative pixel-styled font at large scale factors)
    const BASE_FONT_SIZE = 200;
    function fitWidth(){
      text.style.fontSize = BASE_FONT_SIZE + 'px';
      void text.offsetWidth; // force reflow before measuring
      const available = wrap.clientWidth * 0.97; // safety margin so any measurement
      const natural = text.getBoundingClientRect().width; // drift doesn't clip a letter
      const ratio = natural > 0 ? available / natural : 1;
      text.style.fontSize = (BASE_FONT_SIZE * ratio) + 'px';
    }

    let ticking = false;
    function update(){
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      // Progress across the section's entry into view (0 -> 1)
      let progress = (vh * 0.85 - rect.top) / (vh * 0.6);
      progress = Math.max(0, Math.min(1, progress));

      chars.forEach((el, i) => {
        const start = i / chars.length;
        const end = start + (1 / chars.length);
        let local = (progress - start) / (end - start);
        local = Math.max(0, Math.min(1, local));
        el.classList.toggle('is-visible', local > 0.5);
      });

      ticking = false;
    }

    function onScroll(){
      if(!ticking){
        requestAnimationFrame(update);
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { fitWidth(); onScroll(); });

    // Fonts can finish loading at slightly different times across browsers —
    // re-fit every time there's a plausible signal the font swapped in,
    // plus a couple of brute-force safety-net retries after page load.
    if(document.fonts){
      document.fonts.load(`${BASE_FONT_SIZE}px 'Jacquard 24'`).then(fitWidth).catch(fitWidth);
      if(document.fonts.ready) document.fonts.ready.then(fitWidth);
    }
    window.addEventListener('load', fitWidth);
    setTimeout(fitWidth, 300);
    setTimeout(fitWidth, 1000);
    fitWidth();
    update();
  })();

  // ---------- Continuous animated gradient background (WebGL) ----------
  (function(){
   try {
    const canvas = document.getElementById('bgCanvas');
    // No preserveDrawingBuffer: it forces the browser to copy the whole
    // drawing buffer every frame instead of an efficient swap, which was
    // showing up as constant "GPU stall due to ReadPixels" warnings and
    // stealing frame time from everything else on the page (including
    // the ticker's CSS animation). The category-row hover peek below
    // reads this canvas synchronously right after each draw instead, via
    // a 'bgframe' event, so it still gets a live frame without needing
    // the buffer preserved.
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if(!gl){ return; } // no WebGL: the body's static --grad-base color still shows

    const vertSrc = `
      attribute vec2 aPos;
      void main(){
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    const MAX_RIPPLES = 8;
    const MAX_STREAM = 24;
    const fragSrc = `
      precision highp float;
      uniform vec2 uResolution;
      uniform float uTime;
      uniform int uRippleCount;
      uniform vec2 uRipplePos[${MAX_RIPPLES}];   // click position in aspect-corrected UV space
      uniform float uRippleTime[${MAX_RIPPLES}]; // uTime at moment of click
      uniform int uStreamCount;
      uniform vec2 uStreamPos[${MAX_STREAM}];      // recent fast-cursor positions, aspect-corrected UV
      uniform float uStreamTime[${MAX_STREAM}];    // uTime each point was recorded
      uniform float uStreamStrength[${MAX_STREAM}]; // 0..1, scaled by how fast the cursor was moving

      // Ashima-style 2D simplex noise
      vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
      vec2 mod289(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
      vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }
      float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                            -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      float fbm(vec2 p){
        float v = 0.0;
        float amp = 0.5;
        for(int i = 0; i < 5; i++){
          v += amp * snoise(p);
          p *= 2.0;
          amp *= 0.5;
        }
        return v;
      }

      void main(){
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        float aspect = uResolution.x / uResolution.y;
        vec2 p = vec2(uv.x * aspect, uv.y);

        float t = uTime * 0.02;

        // Click ripples: a quiet, physical disturbance in the flow field —
        // no visible ring or glow, just a smooth displacement pulse that
        // pushes the noise-sampling coordinates outward from the click as
        // it travels, so the existing gradient pattern itself visibly
        // bends and eddies around it. Subtle enough to feel like something
        // you notice rather than something drawn on top.
        vec2 rippleOffset = vec2(0.0);
        const float RIPPLE_DURATION = 3.6;
        const float RIPPLE_SPEED = 0.3;
        for(int i = 0; i < ${MAX_RIPPLES}; i++){
          if(i >= uRippleCount) break;
          float age = uTime - uRippleTime[i];
          if(age < 0.0 || age > RIPPLE_DURATION) continue;

          float radius = age * RIPPLE_SPEED;
          vec2 toPixel = p - uRipplePos[i];
          float d = length(toPixel);
          vec2 dir = d > 0.0001 ? toPixel / d : vec2(0.0);
          float diff = d - radius;

          // A single soft, wide pulse that spreads and relaxes as it
          // travels outward — no oscillation, so it reads as a
          // disturbance in the fluid rather than a decorative ring.
          // Eased in over the first moment so it can't pop in abruptly.
          float envelope = exp(-diff * diff * (4.0 / (1.0 + radius * 2.0)));
          float decay = exp(-age * 0.6);
          float easeIn = smoothstep(0.0, 0.35, age);

          rippleOffset += dir * envelope * decay * easeIn * 0.09;
        }

        // Fast-cursor stream: a short-lived trail of small, quickly-fading
        // disturbances left behind a fast-moving cursor. Each point decays
        // in well under a second, so at rest or moving slowly it leaves
        // nothing — it only shows up as a faint streak when you move fast.
        vec2 streamOffset = vec2(0.0);
        const float STREAM_LIFE = 0.5;
        for(int i = 0; i < ${MAX_STREAM}; i++){
          if(i >= uStreamCount) break;
          float age = uTime - uStreamTime[i];
          if(age < 0.0 || age > STREAM_LIFE) continue;

          vec2 toPixel = p - uStreamPos[i];
          float d = length(toPixel);
          vec2 dir = d > 0.0001 ? toPixel / d : vec2(0.0);

          float envelope = exp(-d * d * 90.0);       // tight, localised
          float decay = exp(-age * 7.0);              // fades fast
          streamOffset += dir * envelope * decay * uStreamStrength[i] * 0.045;
        }

        // Ripple offset feeds into the domain warp itself (not just the
        // final sample), so the disturbance propagates through the whole
        // flow computation rather than being a local nudge
        vec2 pd = p + rippleOffset + streamOffset;

        // Domain-warped fbm for a flowing, organic look
        vec2 warp = vec2(fbm(pd * 1.1 + t), fbm(pd * 1.1 - t));
        float n = fbm(pd * 1.4 + warp * 0.8 + t * 0.5);
        n = n * 0.5 + 0.5; // 0..1

        // Bias so pink sits near the top, indigo/dark toward the bottom —
        // matching the reference image's vertical composition
        n = mix(n, 1.0 - uv.y, 0.45);

        vec3 cBase   = vec3(0.090, 0.059, 0.125);
        vec3 cIndigo = vec3(0.420, 0.247, 0.627);
        vec3 cViolet = vec3(0.298, 0.686, 0.490);
        vec3 cOrchid = vec3(0.910, 0.510, 0.247);
        vec3 cPink   = vec3(1.000, 0.710, 0.439);

        vec3 col = cBase;
        col = mix(col, cIndigo, smoothstep(0.15, 0.42, n));
        col = mix(col, cViolet, smoothstep(0.38, 0.62, n));
        col = mix(col, cOrchid, smoothstep(0.58, 0.8, n));
        col = mix(col, cPink,   smoothstep(0.78, 0.98, n));

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function compile(type, src){
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
        console.warn('Shader compile error:', gl.getShaderInfoLog(s));
      }
      return s;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Fullscreen triangle
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1,  3,-1,  -1,3
    ]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(prog, 'uResolution');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uRippleCount = gl.getUniformLocation(prog, 'uRippleCount');
    const uRipplePos = gl.getUniformLocation(prog, 'uRipplePos');
    const uRippleTime = gl.getUniformLocation(prog, 'uRippleTime');
    const uStreamCount = gl.getUniformLocation(prog, 'uStreamCount');
    const uStreamPos = gl.getUniformLocation(prog, 'uStreamPos');
    const uStreamTime = gl.getUniformLocation(prog, 'uStreamTime');
    const uStreamStrength = gl.getUniformLocation(prog, 'uStreamStrength');

    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Click ripples: track recent clicks as {u, v, t} — position in the
    // same aspect-corrected UV space the shader itself uses, plus the
    // shader-clock time they happened at (not wall-clock time)
    const ripples = [];
    function addRipple(clientX, clientY){
      const aspect = canvas.width / canvas.height;
      const u = (clientX / window.innerWidth) * aspect;
      const v = 1.0 - (clientY / window.innerHeight);
      const t = (performance.now() - startTime) / 1000;
      ripples.push({ u, v, t });
      if(ripples.length > MAX_RIPPLES) ripples.shift();
    }
    window.addEventListener('click', (e) => addRipple(e.clientX, e.clientY));
    window.addEventListener('touchstart', (e) => {
      if(e.touches[0]) addRipple(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    // Fast-cursor stream: only records a point when the cursor is moving
    // quickly, and scales its strength with speed — slow/idle movement
    // adds nothing, so the effect only appears when you move fast
    const streamPoints = [];
    let lastMoveX = null, lastMoveY = null, lastMoveT = null;
    const STREAM_SPEED_MIN = 1800;  // px/sec before it starts registering
    const STREAM_SPEED_MAX = 4500;  // px/sec at which strength maxes out

    function trackStream(clientX, clientY){
      const now = performance.now();
      if(lastMoveX !== null){
        const dt = (now - lastMoveT) / 1000;
        if(dt > 0){
          const dist = Math.hypot(clientX - lastMoveX, clientY - lastMoveY);
          const speed = dist / dt; // px/sec
          if(speed > STREAM_SPEED_MIN){
            const strength = Math.min(1, (speed - STREAM_SPEED_MIN) / (STREAM_SPEED_MAX - STREAM_SPEED_MIN));
            const aspect = canvas.width / canvas.height;
            const u = (clientX / window.innerWidth) * aspect;
            const v = 1.0 - (clientY / window.innerHeight);
            const t = (now - startTime) / 1000;
            streamPoints.push({ u, v, t, strength });
            if(streamPoints.length > MAX_STREAM) streamPoints.shift();
          }
        }
      }
      lastMoveX = clientX; lastMoveY = clientY; lastMoveT = now;
    }
    window.addEventListener('mousemove', (e) => trackStream(e.clientX, e.clientY), { passive: true });
    window.addEventListener('touchmove', (e) => {
      if(e.touches[0]) trackStream(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    function resize(){
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // cap for performance
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize);
    resize();

    let startTime = performance.now();
    function frame(now){
      const t = (now - startTime) / 1000;
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduceMotionQuery.matches ? 0.0 : t);

      // Drop ripples once they're fully faded (matches RIPPLE_DURATION in the shader)
      while(ripples.length && t - ripples[0].t > 3.6) ripples.shift();
      const posArray = new Float32Array(MAX_RIPPLES * 2);
      const timeArray = new Float32Array(MAX_RIPPLES);
      ripples.forEach((r, i) => {
        posArray[i * 2] = r.u;
        posArray[i * 2 + 1] = r.v;
        timeArray[i] = r.t;
      });
      gl.uniform1i(uRippleCount, ripples.length);
      gl.uniform2fv(uRipplePos, posArray);
      gl.uniform1fv(uRippleTime, timeArray);

      // Drop stream points once they're fully faded (matches STREAM_LIFE in the shader)
      while(streamPoints.length && t - streamPoints[0].t > 0.5) streamPoints.shift();
      const streamPosArray = new Float32Array(MAX_STREAM * 2);
      const streamTimeArray = new Float32Array(MAX_STREAM);
      const streamStrengthArray = new Float32Array(MAX_STREAM);
      streamPoints.forEach((s, i) => {
        streamPosArray[i * 2] = s.u;
        streamPosArray[i * 2 + 1] = s.v;
        streamTimeArray[i] = s.t;
        streamStrengthArray[i] = s.strength;
      });
      gl.uniform1i(uStreamCount, streamPoints.length);
      gl.uniform2fv(uStreamPos, streamPosArray);
      gl.uniform1fv(uStreamTime, streamTimeArray);
      gl.uniform1fv(uStreamStrength, streamStrengthArray);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Let the category-row hover peek (elsewhere) grab a synchronous
      // copy of this frame right now, while the buffer still has it —
      // see the preserveDrawingBuffer note above.
      canvas.dispatchEvent(new Event('bgframe'));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
   } catch(err){
     console.warn('WebGL background failed to start:', err);
   }
  })();

  // ---------- Cursor trail + click ripples (pixel-block style) ----------
  (function(){
   try {
    const canvas = document.getElementById('fxCanvas');
    const ctx = canvas.getContext('2d');
    if(!ctx) return;

    const PIXEL = 8; // grid size — keeps everything blocky/retro rather than smooth
    const TRAIL_LIFE = 550;   // ms a trail point stays visible
    const RIPPLE_LIFE = 900;  // ms a click ripple takes to fully expand/fade
    const RIPPLE_MAX_RADIUS = 140;

    const glowColors = ['#eec7ef', '#a97fe0', '#6a4fd6', '#ffffff'];

    let trail = [];   // {x, y, t}
    let ripples = []; // {x, y, t}
    let dpr = 1;

    function resize(){
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    function snap(v){ return Math.round(v / PIXEL) * PIXEL; }

    function addTrailPoint(x, y){
      trail.push({ x: snap(x), y: snap(y), t: performance.now() });
      if(trail.length > 60) trail.shift(); // safety cap
    }

    function addRipple(x, y){
      ripples.push({ x, y, t: performance.now() });
      if(ripples.length > 12) ripples.shift();
    }

    window.addEventListener('mousemove', (e) => addTrailPoint(e.clientX, e.clientY), { passive: true });
    window.addEventListener('touchmove', (e) => {
      if(e.touches[0]) addTrailPoint(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('click', (e) => addRipple(e.clientX, e.clientY));
    window.addEventListener('touchstart', (e) => {
      if(e.touches[0]) addRipple(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    // Cached instead of read fresh in isOverLightSection() — that's
    // called up to twice per trail point/ripple, every single frame,
    // which was forcing a synchronous layout read that many times a
    // frame or more and jamming up everything else on the page
    // (including the ticker's animation) while the cursor was moving.
    let lightSectionRects = [];
    function updateLightSectionRects(){
      lightSectionRects = [document.getElementById('work'), document.getElementById('about')]
        .filter(Boolean)
        .map(el => el.getBoundingClientRect());
    }
    updateLightSectionRects();
    window.addEventListener('resize', updateLightSectionRects);
    let rectTicking = false;
    window.addEventListener('scroll', () => {
      if(!rectTicking){
        requestAnimationFrame(() => { updateLightSectionRects(); rectTicking = false; });
        rectTicking = true;
      }
    }, { passive: true });

    function isOverLightSection(y){
      for(const r of lightSectionRects){
        if(y >= r.top && y <= r.bottom) return true;
      }
      return false;
    }

    function drawPixel(x, y, size, color, alpha){
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(x - size/2, y - size/2, size, size);
    }

    function render(){
      const now = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Trail: fading, shrinking pixel blocks with a soft glow. Over the
      // colourful gradient it keeps its original palette + additive glow;
      // over a white section it switches to plain solid black so it stays
      // visible against the light background instead of washing out.
      trail = trail.filter(p => now - p.t < TRAIL_LIFE);
      trail.forEach((p, i) => {
        const age = (now - p.t) / TRAIL_LIFE; // 0 = new, 1 = fully faded
        const alpha = (1 - age) * 0.7;
        const size = PIXEL * (1.6 - age * 1.1);
        const onLight = isOverLightSection(p.y);

        if(onLight){
          ctx.globalCompositeOperation = 'source-over';
          ctx.shadowBlur = 0;
          drawPixel(p.x, p.y, size, '#000000', alpha);
        } else {
          const color = glowColors[i % glowColors.length];
          ctx.globalCompositeOperation = 'lighter';
          ctx.shadowBlur = 12;
          ctx.shadowColor = color;
          drawPixel(p.x, p.y, size, color, alpha);
        }
      });
      ctx.shadowBlur = 0;

      // Click ripples: expanding ring made of pixel blocks, fading out
      ripples = ripples.filter(r => now - r.t < RIPPLE_LIFE);
      ripples.forEach(r => {
        const age = (now - r.t) / RIPPLE_LIFE; // 0..1
        const radius = age * RIPPLE_MAX_RADIUS;
        const alpha = (1 - age) * 0.8;
        const segments = 20;
        const onLight = isOverLightSection(r.y);

        if(onLight){
          ctx.globalCompositeOperation = 'source-over';
          ctx.shadowBlur = 0;
        } else {
          ctx.globalCompositeOperation = 'lighter';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#eec7ef';
        }

        for(let i = 0; i < segments; i++){
          const angle = (i / segments) * Math.PI * 2;
          const x = snap(r.x + Math.cos(angle) * radius);
          const y = snap(r.y + Math.sin(angle) * radius);
          drawPixel(x, y, PIXEL, onLight ? '#000000' : '#ffffff', alpha);
        }
        ctx.shadowBlur = 0;
      });

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
   } catch(err){
     console.warn('Cursor fx failed to start:', err);
   }
  })();

  // ---------- Tagline hover-swap: size to fit the wider of the two phrases ----------
  (function(){
    const wrap = document.getElementById('taglineSwap');
    if(!wrap) return;
    const a = wrap.querySelector('.tagline-text--a');
    const b = wrap.querySelector('.tagline-text--b');
    if(!a || !b) return;

    function fit(){
      wrap.style.width = 'auto';
      const widthA = a.getBoundingClientRect().width;
      const widthB = b.getBoundingClientRect().width;
      wrap.style.width = Math.ceil(Math.max(widthA, widthB)) + 'px';
    }
    fit();
    window.addEventListener('resize', fit);
  })();

  // ---------- Mobile nav toggle ----------
  (function(){
    const toggle = document.getElementById('navToggle');
    const nav = document.getElementById('primaryNav');
    if(!toggle || !nav) return;

    function closeNav(){
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-open');
    }
    function openNav(){
      nav.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('nav-open');
    }

    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      if(isOpen) closeNav(); else openNav();
    });

    // Close after picking a link, and if the viewport grows past mobile
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeNav));
    window.addEventListener('resize', () => {
      if(window.innerWidth > 760) closeNav();
    });
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape') closeNav();
    });
  })();

  // ---------- Decrypt / scramble hover effect ----------
  const GLYPHS = "!<>-_\\/[]{}—=+*^?#";
  function decryptEffect(el){
    const target = el.getAttribute('data-decrypt') || el.textContent;
    let frame = 0;
    let running = false;
    let interval = null;

    function scramble(){
      let out = "";
      for(let i=0;i<target.length;i++){
        if(target[i] === " "){ out += " "; continue; }
        if(i < frame){ out += target[i]; }
        else{ out += GLYPHS[Math.floor(Math.random()*GLYPHS.length)]; }
      }
      el.textContent = out;
      frame += target.length / 24;
      if(frame >= target.length){
        el.textContent = target;
        clearInterval(interval);
        running = false;
      }
    }

    el.addEventListener('mouseenter', () => {
      if(running) return;
      running = true;
      frame = 0;
      interval = setInterval(scramble, 55);
    });
  }
  document.querySelectorAll('[data-decrypt]').forEach(decryptEffect);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduceMotion){
    document.querySelectorAll('[data-decrypt]').forEach(el => {
      el.textContent = el.getAttribute('data-decrypt');
    });
  }

  // ---------- Glass/blur reveal: fades+sharpens elements in as they scroll
  // into view, and blurs back out if you scroll back past them ----------
  function initBlurReveal(elements){
    if(!elements.length) return;
    elements.forEach(el => el.classList.add('pre-reveal'));

    if(!window.IntersectionObserver){
      elements.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        entry.target.classList.toggle('is-visible', entry.isIntersecting);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
    elements.forEach(el => observer.observe(el));
  }
  initBlurReveal(document.querySelectorAll('.category-row'));
  initBlurReveal(document.querySelectorAll('.about-grid .bio, .contact-block, .reel-btn'));

  // ---------- Category row hover: live crop of the WebGL background ----------
  // Rather than a flat black hover state, this copies a live, continuously
  // updating window into the same #bgCanvas fluid shader and positions it
  // behind whichever row is hovered — a real view into the background,
  // not a separate/duplicated animation.
  (function(){
   try {
    const bgCanvas = document.getElementById('bgCanvas');
    const wrap = document.querySelector('.project-categories');
    const hoverCanvas = document.getElementById('categoryHoverCanvas');
    const rows = document.querySelectorAll('.category-row');
    if(!bgCanvas || !wrap || !hoverCanvas || !rows.length) return;
    const ctx = hoverCanvas.getContext('2d');
    if(!ctx) return;

    let activeRow = null;

    function updateFrame(){
      if(!activeRow) return;
      const wrapRect = wrap.getBoundingClientRect();
      const rowRect = activeRow.getBoundingClientRect();

      // Position/size the preview canvas to exactly cover the row,
      // relative to the categories container
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const left = rowRect.left - wrapRect.left;
      const top = rowRect.top - wrapRect.top;
      hoverCanvas.style.left = left + 'px';
      hoverCanvas.style.top = top + 'px';
      hoverCanvas.style.width = rowRect.width + 'px';
      hoverCanvas.style.height = rowRect.height + 'px';
      hoverCanvas.width = Math.max(1, Math.round(rowRect.width * dpr));
      hoverCanvas.height = Math.max(1, Math.round(rowRect.height * dpr));

      // Map the row's viewport position to the matching region of the
      // background canvas's own pixel buffer, and copy that live frame
      const scaleX = bgCanvas.width / window.innerWidth;
      const scaleY = bgCanvas.height / window.innerHeight;
      const sx = rowRect.left * scaleX;
      const sy = rowRect.top * scaleY;
      const sw = rowRect.width * scaleX;
      const sh = rowRect.height * scaleY;

      try {
        ctx.drawImage(bgCanvas, sx, sy, sw, sh, 0, 0, hoverCanvas.width, hoverCanvas.height);
      } catch(e){ /* ignore transient read errors */ }
    }

    // Driven by the WebGL canvas's own 'bgframe' event rather than a
    // separate requestAnimationFrame loop, so the read always lands
    // right after that frame draws instead of racing it on some other
    // tick — see the preserveDrawingBuffer note where bgframe fires.
    bgCanvas.addEventListener('bgframe', updateFrame);

    rows.forEach(row => {
      row.addEventListener('mouseenter', () => {
        activeRow = row;
        hoverCanvas.classList.add('is-active');
      });
      row.addEventListener('focus', () => {
        activeRow = row;
        hoverCanvas.classList.add('is-active');
      });
      row.addEventListener('mouseleave', () => {
        if(activeRow === row){
          activeRow = null;
          hoverCanvas.classList.remove('is-active');
        }
      });
      row.addEventListener('blur', () => {
        if(activeRow === row){
          activeRow = null;
          hoverCanvas.classList.remove('is-active');
        }
      });
    });
   } catch(err){
     console.warn('Category hover preview failed to start:', err);
   }
  })();

  // ---------- Ticker content: client logos ----------
  const CLIENT_LOGOS = [
    { src: 'images/logos/logo-mark-1.png', alt: 'Client logo' },
    { src: 'images/logos/logo-mark-2.png', alt: 'Client logo' },
    { src: 'images/logos/bloomberg-media.png', alt: 'Bloomberg Media' },
    { src: 'images/logos/dewars.png', alt: "Dewar's" },
    { src: 'images/logos/samsung.png', alt: 'Samsung' },
    { src: 'images/logos/logo-mark-3.png', alt: 'Client logo' },
    { src: 'images/logos/itv.png', alt: 'ITV' },
    { src: 'images/logos/callebaut.png', alt: 'Callebaut' },
    { src: 'images/logos/natwest.png', alt: 'NatWest' },
    { src: 'images/logos/ual.png', alt: 'University of the Arts London' },
    { src: 'images/logos/london-design-festival.png', alt: 'London Design Festival' },
    { src: 'images/logos/cas.png', alt: 'CAS' },
    { src: 'images/logos/bcs.png', alt: 'BCS, The Chartered Institute for IT' },
    { src: 'images/logos/eva-london.png', alt: 'EVA London Conference' },
  ];

  function fillTicker(trackEl){
    if(!trackEl || !CLIENT_LOGOS.length) return;
    const list = [...CLIENT_LOGOS, ...CLIENT_LOGOS]; // duplicate for seamless loop
    list.forEach(logo => {
      const wrap = document.createElement('span');
      wrap.className = 'ticker-logo' + (logo.needsLightBg ? ' ticker-logo--onlight' : '');
      const img = document.createElement('img');
      img.src = logo.src;
      img.alt = logo.alt;
      img.loading = 'lazy';
      wrap.appendChild(img);
      trackEl.appendChild(wrap);
    });
  }
  fillTicker(document.getElementById('tickerTrack'));

  // ---------- Project modal ----------
  const modal = document.getElementById('projectModal');
  const modalClose = document.getElementById('modalClose');
  const modalTitle = document.getElementById('modalTitle');
  const modalDescription = document.getElementById('modalDescription');
  const modalLocation = document.getElementById('modalLocation');
  let lastFocused = null;

  function openModal(card){
    const brand = card.querySelector('.brand');
    const loc = card.querySelector('.loc');
    modalTitle.textContent = brand ? brand.textContent : '[Brand: Project Title]';
    modalLocation.textContent = loc ? loc.textContent : '[City, Country]';
    modalDescription.textContent = card.getAttribute('data-description') ||
      '[Project description goes here: a couple of sentences on the brief, approach, and outcome.]';

    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    modalClose.focus();
  }

  function closeModal(){
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    if(lastFocused && typeof lastFocused.focus === 'function'){
      lastFocused.focus();
    }
  }

  document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(card);
    });
  });

  modalClose.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if(e.target === modal) closeModal(); // click on the backdrop, not the modal box
  });

  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && !modal.hidden) closeModal();
  });

  // ---------- Video reel modal ----------
  // The button is a real link to the Google Drive file (works even
  // without JS, or if someone wants it open in a new tab); JS intercepts
  // the click to instead show it embedded in a popup on the page.
  (function(){
    const btn = document.getElementById('reelBtn');
    const reelModal = document.getElementById('reelModal');
    const reelClose = document.getElementById('reelModalClose');
    const videoWrap = document.getElementById('reelVideoWrap');
    if(!btn || !reelModal || !reelClose || !videoWrap) return;

    const DRIVE_FILE_ID = '1qHEE79CKK0oUeVShU4VXoa4_WIAE5lTu';
    const EMBED_SRC = `https://drive.google.com/file/d/${DRIVE_FILE_ID}/preview`;
    let lastFocused = null;

    function openReel(){
      videoWrap.innerHTML = `<iframe src="${EMBED_SRC}" allow="autoplay" allowfullscreen title="Video reel"></iframe>`;
      lastFocused = document.activeElement;
      reelModal.hidden = false;
      document.body.classList.add('modal-open');
      reelClose.focus();
    }
    function closeReel(){
      reelModal.hidden = true;
      document.body.classList.remove('modal-open');
      videoWrap.innerHTML = ''; // stop playback
      if(lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openReel();
    });
    reelClose.addEventListener('click', closeReel);
    reelModal.addEventListener('click', (e) => {
      if(e.target === reelModal) closeReel();
    });
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && !reelModal.hidden) closeReel();
    });
  })();

  // ---------- Glass nav: fades in once you've scrolled past the hero,
  // then stays pinned as a centered glass pill for the rest of the page ----------
  (function(){
    const glassNav = document.getElementById('glassNav');
    if(!glassNav) return;
    const threshold = () => window.innerHeight * 0.8;
    let ticking = false;

    function update(){
      glassNav.classList.toggle('is-visible', window.scrollY > threshold());
      ticking = false;
    }
    function onScroll(){
      if(!ticking){
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
  })();
