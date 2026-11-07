/*
 * Interactive self-balancing robot.
 *
 * Plant: wheeled inverted pendulum modelled as a cart-pole
 *   (cart mass M, body mass m, distance to centre of mass l).
 * Controller: LQR full-state feedback u = -K (s - s_ref), saturated at ±U_MAX,
 *   gains computed offline for Q = diag(25, 4, 80, 2), R = 0.2.
 * Push the body with the cursor (or tap it) to inject a disturbance;
 * tap the track to move the position setpoint.
 */
(function () {
    const canvas = document.getElementById('bot-canvas');
    const graph = document.getElementById('bot-graph');
    if (!canvas || !graph || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');
    const gtx = graph.getContext('2d');
    const statusEl = document.getElementById('bot-status');
    const hintEl = document.getElementById('bot-hint');
    const rTheta = document.getElementById('r-theta');
    const rX = document.getElementById('r-x');
    const rU = document.getElementById('r-u');

    // ---- Model & controller ---------------------------------------------
    const M = 0.6, m = 0.9, l = 0.3, g = 9.81, MT = M + m;
    const K = [-11.18, -11.985, -68.956, -12.261];   // state: [x, x', θ, θ']
    const U_MAX = 20;                                 // N, motor saturation
    const FALL = 1.0;                                 // rad (~57°) -> fault
    const X_LIM = 0.7;                               // m, end of track

    const s = { x: 0, xd: 0, th: 0, thd: 0 };
    let x0 = 0, u = 0, wheelAngle = 0;
    let fallen = false, faultTimer = 0;

    function deriv(st, F) {
        const sn = Math.sin(st.th), cs = Math.cos(st.th);
        const tmp = (F + m * l * st.thd * st.thd * sn) / MT;
        const thdd = (g * sn - cs * tmp) / (l * (4 / 3 - m * cs * cs / MT));
        const xdd = tmp - m * l * thdd * cs / MT;
        return { xdd, thdd };
    }

    function control() {
        const e = [s.x - x0, s.xd, s.th, s.thd];
        let f = 0;
        for (let i = 0; i < 4; i++) f -= K[i] * e[i];
        return Math.max(-U_MAX, Math.min(U_MAX, f));
    }

    function physics(dt) {
        if (fallen) {
            faultTimer -= dt;
            // let it lie on the ground, then "reboot" upright
            if (faultTimer <= 0) {
                fallen = false;
                Object.assign(s, { x: x0, xd: 0, th: 0, thd: 0 });
                flashStatus('REBOOT', 1);
            }
            u = 0;
            return;
        }
        const h = 1 / 480;
        let t = 0;
        while (t < dt) {
            const step = Math.min(h, dt - t);
            u = control();
            const d = deriv(s, u);
            s.xd += d.xdd * step;
            s.thd += d.thdd * step;
            s.x += s.xd * step;
            s.th += s.thd * step;
            t += step;
        }
        if (Math.abs(s.x) > X_LIM) {               // end stops
            s.x = Math.sign(s.x) * X_LIM;
            s.xd = 0;
        }
        wheelAngle = s.x / WHEEL_R;
        if (Math.abs(s.th) > FALL) {
            fallen = true;
            faultTimer = 1.4;
            s.th = Math.sign(s.th) * 1.35;
            s.thd = 0; s.xd = 0;
            flashStatus('FAULT · TILT LIMIT', 1.4);
        }
    }

    // ---- Geometry (metres -> pixels) ------------------------------------
    const WHEEL_R = 0.065, BODY_H = 0.52, BODY_W = 0.15, VIEW_W = 1.6;
    let W = 0, H = 0, dpr = 1, ppm = 200, groundY = 0;
    let GW = 0, GH = 0;

    const toPx = (xm) => W / 2 + xm * ppm;
    const toM = (px) => (px - W / 2) / ppm;
    const axle = () => ({ x: toPx(s.x), y: groundY - WHEEL_R * ppm });

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        const r = canvas.getBoundingClientRect();
        W = r.width; H = r.height;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        ppm = W / VIEW_W;
        groundY = H * 0.88;
        const gr = graph.getBoundingClientRect();
        GW = gr.width; GH = gr.height;
        graph.width = Math.round(GW * dpr); graph.height = Math.round(GH * dpr);
    }

    // ---- Theme colours --------------------------------------------------
    let C = {};
    function readColors() {
        const cs = getComputedStyle(document.documentElement);
        const v = (n) => cs.getPropertyValue(n).trim();
        C = {
            accent: v('--accent'), copper: v('--copper'), text: v('--text'), muted: v('--text-muted'),
            faint: v('--text-faint'), border: v('--border'), strong: v('--border-strong'),
            surface: v('--surface-2'), bg: v('--bg-elev'), error: v('--error'), soft: v('--accent-soft')
        };
    }

    // ---- Interaction ----------------------------------------------------
    let pushCooldown = 0, idle = 3.5, arrow = null;   // first demo push after ~2.5 s
    let last = null;
    let hinted = false;

    function bodyLocal(px, py) {
        const a = axle();
        const dx = px - a.x, dy = py - a.y;
        const c = Math.cos(-s.th), sn = Math.sin(-s.th);
        return { x: dx * c - dy * sn, y: dx * sn + dy * c };
    }
    function hitBody(px, py, pad = 10) {
        const p = bodyLocal(px, py);
        const hw = BODY_W * ppm / 2 + pad;
        return Math.abs(p.x) < hw && p.y < pad && p.y > -BODY_H * ppm - pad;
    }

    function push(impulse, atY) {
        if (fallen) return;
        s.thd += impulse;
        s.xd += impulse * 0.04;
        pushCooldown = 0.28;
        idle = 0;
        arrow = { dir: Math.sign(impulse), mag: Math.min(1, Math.abs(impulse) / 3), y: atY, t: 0.6 };
        if (!hinted && hintEl) { hinted = true; hintEl.classList.add('dim'); }
    }

    function pointerPos(e) {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
    }

    canvas.addEventListener('pointermove', (e) => {
        const p = pointerPos(e);
        const over = hitBody(p.x, p.y);
        canvas.style.cursor = over ? 'pointer' : (p.y > groundY - 40 ? 'crosshair' : 'default');
        if (last && over && pushCooldown <= 0 && e.pointerType === 'mouse') {
            const dt = Math.max(8, p.t - last.t) / 1000;
            const vx = (p.x - last.x) / ppm / dt;          // m/s of the cursor
            if (Math.abs(vx) > 0.25) push(Math.max(-2.4, Math.min(2.4, vx * 0.8)), p.y);
        }
        last = p;
    });
    canvas.addEventListener('pointerleave', () => { last = null; });

    canvas.addEventListener('pointerdown', (e) => {
        const p = pointerPos(e);
        if (hitBody(p.x, p.y, 16)) {
            // poke: push away from the side you touched
            const local = bodyLocal(p.x, p.y);
            push(local.x < 0 ? 2 : -2, p.y);
        } else if (p.y > groundY - 50) {
            x0 = Math.max(-0.5, Math.min(0.5, toM(p.x)));
            idle = 0;
            flashStatus('SETPOINT → ' + (x0 * 100).toFixed(0) + ' cm', 1.2);
        }
    });

    // ---- Status ---------------------------------------------------------
    let flash = null;
    function flashStatus(text, t) { flash = { text, t }; }
    function statusText() {
        if (flash && flash.t > 0) return flash.text;
        if (fallen) return 'FAULT';
        const stable = Math.abs(s.th) < 0.025 && Math.abs(s.x - x0) < 0.02;
        return stable ? 'STABLE' : 'RECOVERING';
    }

    // ---- History for the graph ------------------------------------------
    const N = 360, SAMPLE = 1 / 60;   // 6 s window
    const hTh = new Float32Array(N), hX = new Float32Array(N), hU = new Float32Array(N);
    let head = 0, acc = 0;
    function sample(dt) {
        acc += dt;
        while (acc >= SAMPLE) {
            acc -= SAMPLE;
            hTh[head] = s.th * 180 / Math.PI;
            hX[head] = (s.x - x0) * 100;
            hU[head] = u;
            head = (head + 1) % N;
        }
    }

    // ---- Drawing --------------------------------------------------------
    function roundRect(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
    }

    function drawScene() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        // track with 10 cm ticks
        ctx.strokeStyle = C.strong; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(8, groundY); ctx.lineTo(W - 8, groundY); ctx.stroke();
        ctx.strokeStyle = C.border; ctx.lineWidth = 1;
        for (let xm = -0.8; xm <= 0.801; xm += 0.1) {
            const px = toPx(xm), big = Math.abs(Math.round(xm * 10) % 5) === 0;
            ctx.beginPath(); ctx.moveTo(px, groundY + 3); ctx.lineTo(px, groundY + (big ? 10 : 6)); ctx.stroke();
        }

        // setpoint marker
        const sp = toPx(x0);
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = C.copper; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(sp, 18); ctx.lineTo(sp, groundY); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.fillStyle = C.copper;
        ctx.beginPath(); ctx.moveTo(sp, groundY + 4); ctx.lineTo(sp - 6, groundY + 13); ctx.lineTo(sp + 6, groundY + 13); ctx.closePath(); ctx.fill();
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SP', sp, 14);

        const a = axle(), wr = WHEEL_R * ppm, bh = BODY_H * ppm, bw = BODY_W * ppm;
        const tilt = Math.min(1, Math.abs(s.th) / 0.5);

        // shadow
        ctx.fillStyle = C.border;
        ctx.beginPath(); ctx.ellipse(a.x + Math.sin(s.th) * bh * 0.4, groundY + 2, bw * 0.9, 3, 0, 0, Math.PI * 2); ctx.fill();

        // body
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(s.th);
        roundRect(ctx, -bw / 2, -bh, bw, bh, 7);
        ctx.fillStyle = C.surface; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = fallen ? C.error : C.accent; ctx.stroke();

        // battery pack
        roundRect(ctx, -bw / 2 + 6, -bh * 0.42, bw - 12, bh * 0.3, 3);
        ctx.strokeStyle = C.strong; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = C.accent; ctx.globalAlpha = 0.35;
        ctx.fillRect(-bw / 2 + 9, -bh * 0.42 + 3, (bw - 18) * 0.7, bh * 0.3 - 6);
        ctx.globalAlpha = 1;

        // PCB with IMU chip
        ctx.fillStyle = C.soft;
        roundRect(ctx, -bw / 2 + 5, -bh * 0.78, bw - 10, bh * 0.28, 3); ctx.fill();
        ctx.strokeStyle = C.accent; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C.text;
        ctx.fillRect(-6, -bh * 0.68, 12, 9);
        ctx.strokeStyle = C.copper; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-bw / 2 + 8, -bh * 0.56); ctx.lineTo(-8, -bh * 0.56);
        ctx.moveTo(8, -bh * 0.6); ctx.lineTo(bw / 2 - 8, -bh * 0.6);
        ctx.stroke();

        // head display with "eyes" that look towards the lean
        roundRect(ctx, -bw / 2 + 5, -bh + 6, bw - 10, bh * 0.15, 4);
        ctx.fillStyle = C.bg; ctx.fill();
        ctx.strokeStyle = C.strong; ctx.lineWidth = 1; ctx.stroke();
        const look = Math.max(-1, Math.min(1, s.thd / 3)) * 4;
        ctx.fillStyle = fallen ? C.error : (tilt > 0.4 ? C.copper : C.accent);
        const ey = -bh + 6 + bh * 0.075;
        ctx.beginPath(); ctx.arc(-7 + look, ey, 2.6, 0, Math.PI * 2); ctx.arc(7 + look, ey, 2.6, 0, Math.PI * 2); ctx.fill();

        // status LED on top
        ctx.beginPath(); ctx.arc(0, -bh - 4, 3, 0, Math.PI * 2);
        ctx.fillStyle = fallen ? C.error : C.accent; ctx.fill();
        ctx.restore();

        // wheel
        ctx.beginPath(); ctx.arc(a.x, a.y, wr, 0, Math.PI * 2);
        ctx.fillStyle = C.bg; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = C.text; ctx.stroke();
        ctx.lineWidth = 1.5; ctx.strokeStyle = C.muted;
        for (let i = 0; i < 3; i++) {
            const ang = wheelAngle + i * Math.PI / 1.5;
            ctx.beginPath(); ctx.moveTo(a.x, a.y);
            ctx.lineTo(a.x + Math.cos(ang) * (wr - 3), a.y + Math.sin(ang) * (wr - 3)); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill();

        // motor command arrow at the axle
        if (Math.abs(u) > 0.5 && !fallen) {
            const len = (u / U_MAX) * 46;
            arrowLine(a.x, groundY - 4 - wr * 2 - 0, a.x + len, groundY - 4 - wr * 2, C.faint, 1.5);
        }

        // push arrow
        if (arrow && arrow.t > 0) {
            ctx.globalAlpha = Math.min(1, arrow.t / 0.3);
            const sx = a.x - arrow.dir * (bw / 2 + 46), ex = a.x - arrow.dir * (bw / 2 + 10);
            arrowLine(sx, arrow.y, ex, arrow.y, C.copper, 2.5);
            ctx.globalAlpha = 1;
        }
    }

    function arrowLine(x1, y1, x2, y2, color, w) {
        const ang = Math.atan2(y2 - y1, x2 - x1);
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 8 * Math.cos(ang - 0.45), y2 - 8 * Math.sin(ang - 0.45));
        ctx.lineTo(x2 - 8 * Math.cos(ang + 0.45), y2 - 8 * Math.sin(ang + 0.45));
        ctx.closePath(); ctx.fill();
    }

    function drawGraph() {
        gtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        gtx.clearRect(0, 0, GW, GH);
        const padL = 4, padR = 4, padT = 8, padB = 8;
        const w = GW - padL - padR, h = GH - padT - padB, mid = padT + h / 2;

        // grid: 1 s verticals, ±half horizontals
        gtx.strokeStyle = C.border; gtx.lineWidth = 1;
        gtx.beginPath();
        for (let i = 0; i <= 6; i++) { const x = padL + (w * i) / 6; gtx.moveTo(x, padT); gtx.lineTo(x, padT + h); }
        gtx.moveTo(padL, padT + h * 0.25); gtx.lineTo(padL + w, padT + h * 0.25);
        gtx.moveTo(padL, padT + h * 0.75); gtx.lineTo(padL + w, padT + h * 0.75);
        gtx.stroke();
        gtx.strokeStyle = C.strong;
        gtx.beginPath(); gtx.moveTo(padL, mid); gtx.lineTo(padL + w, mid); gtx.stroke();

        const trace = (buf, scale, color, width, dash) => {
            gtx.strokeStyle = color; gtx.lineWidth = width; gtx.setLineDash(dash || []);
            gtx.beginPath();
            for (let i = 0; i < N; i++) {
                const v = buf[(head + i) % N] / scale;
                const y = mid - Math.max(-1, Math.min(1, v)) * (h / 2);
                const x = padL + (w * i) / (N - 1);
                i ? gtx.lineTo(x, y) : gtx.moveTo(x, y);
            }
            gtx.stroke(); gtx.setLineDash([]);
        };
        trace(hU, U_MAX, C.faint, 1, [3, 3]);   // motor command, ±20 N
        trace(hX, 60, C.copper, 1.8);           // position error, ±60 cm
        trace(hTh, 20, C.accent, 2);            // tilt, ±20°
    }

    let readoutT = 0;
    function updateReadouts(dt) {
        readoutT -= dt;
        if (readoutT > 0) return;
        readoutT = 0.1;
        rTheta.textContent = (s.th * 180 / Math.PI).toFixed(1) + '°';
        rX.textContent = ((s.x - x0) * 100).toFixed(1) + ' cm';
        rU.textContent = u.toFixed(1) + ' N';
        statusEl.textContent = statusText();
        statusEl.className = fallen ? 'bad' : (statusEl.textContent === 'STABLE' ? 'ok' : 'warn');
    }

    // ---- Loop -----------------------------------------------------------
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, lastTs = 0, visible = true;

    function frame(ts) {
        const dt = Math.min(0.04, (ts - (lastTs || ts)) / 1000);
        lastTs = ts;

        pushCooldown -= dt;
        if (arrow) arrow.t -= dt;
        if (flash) flash.t -= dt;

        // demo disturbance when nobody is interacting, so the loop is visible
        idle += dt;
        if (!reduceMotion && idle > 6 && !fallen && Math.abs(s.th) < 0.02 && Math.abs(s.x - x0) < 0.03) {
            const a = axle();
            push((Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 0.6), a.y - BODY_H * ppm * 0.75);
            flashStatus('AUTO TEST · DISTURBANCE', 1);
        }

        physics(dt);
        sample(dt);
        drawScene();
        drawGraph();
        updateReadouts(dt);
        raf = requestAnimationFrame(frame);
    }
    const start = () => { if (!raf) { lastTs = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    resize();
    readColors();
    window.addEventListener('resize', () => { resize(); drawScene(); drawGraph(); });
    new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    if ('IntersectionObserver' in window) {
        new IntersectionObserver((en) => { visible = en[0].isIntersecting; visible ? start() : stop(); }).observe(canvas);
    } else start();
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (visible) start(); });

    // first frame immediately (also covers reduced-motion users)
    drawScene(); drawGraph();
    // Fonts load late; redraw labels once they're ready
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawScene(); });
})();
