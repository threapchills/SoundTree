const canvas = document.getElementById('treeCanvas');
const ctx = canvas.getContext('2d');
const glCanvas = document.getElementById('glCanvas');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 80;
renderer.setSize(window.innerWidth, window.innerHeight);

let starField;
init3D();
animate3D(0);

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

let audioCtx;
let masterGain;

// — from “main” branch: EQ/filter setup —
let eqInput;
let eqFilters = [];
    const num = 1500;
        color: 0x55aa55,
        size: 0.6,
    { freq: 800,  Q: 0.6 },
    { freq: 2500, Q: 0.9 },
    { freq: 8000, Q: 0.8 }
];

const BINAURAL_OFFSET = 4; // Hz difference between hemispheres
let mirrorEnabled = true;

function createEQ() {
    eqFilters = eqSettings.map((b) => {
        const f = audioCtx.createBiquadFilter();
        f.type = 'peaking';
        f.frequency.value = b.freq;
        f.Q.value = b.Q;
        f.gain.value = 0;
        return f;
    });
    // Chain them: 60 → 200 → 800 → 2500 → 8000
    for (let i = 0; i < eqFilters.length - 1; i++) {
        eqFilters[i].connect(eqFilters[i + 1]);
    }
    return eqFilters[0];
}

// Choose a random note from minor pentatonic around A3/A4
function getMusicalFrequency() {
    const base = 220;                     // A3 = 220 Hz
    const scale = [0, 3, 5, 7, 10];       // minor pentatonic intervals
    const octave = Math.random() > 0.5 ? 0 : 1;
    const step = scale[Math.floor(Math.random() * scale.length)];
    return base * Math.pow(2, octave + step / 12);
}

// — 3D starfield setup (p300h3) —
function init3D() {
    const geometry = new THREE.BufferGeometry();
    const num = 2000;
    const positions = new Float32Array(num * 3);
    for (let i = 0; i < num; i++) {
        const r = Math.random() * 40 + 10;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0x88ff88,
        size: 0.8,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    starField = new THREE.Points(geometry, material);
    scene.add(starField);
}

function animate3D(time) {
    requestAnimationFrame(animate3D);
    const t = time * 0.0002;
    if (starField) {
        starField.rotation.x = t * 0.5;
        starField.rotation.y = t * 0.3;
        starField.material.color.setHSL(t % 1, 0.7, 0.5);
    }
    renderer.render(scene, camera);
}


// — Node class combining both branches —
class Node {
    constructor(x, y, opts = {}) {
        this.x = x;
        this.y = y;
        this.radius = opts.radius || 8;
        this.children = [];     // will hold { node: Node, cp: {x, y} }

        // Random colour (from codex branch)
        this.color = `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;

        // From main: each node has its own pitch & pan
        this.freq = opts.freq || getMusicalFrequency();
        this.pan = opts.pan || 0;
        this.mirror = opts.mirror || null;
        this.parent = opts.parent || null;

        this.osc = null;
        this.gainNode = null;
        this.panner = null;

        if (audioCtx) {
            this.createOscillator();
        }
    }

    createOscillator() {
        this.osc = audioCtx.createOscillator();
        this.osc.type = 'sawtooth';
        this.osc.frequency.setValueAtTime(this.freq, audioCtx.currentTime);

        // A lowpass filter per node
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, audioCtx.currentTime);

        // Subtle noise source blended into each node
        const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuf;
        noise.loop = true;

        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 1000;

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.value = 0.02;

        noise.connect(noiseFilter).connect(noiseGain);

        // Each node has its own gain
        this.gainNode = audioCtx.createGain();
        this.gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);

        // Stereo panner per node (binaural effect)
        this.panner = audioCtx.createStereoPanner();
        this.panner.pan.setValueAtTime(this.pan, audioCtx.currentTime);

        // LFO for gentle frequency modulation
        const lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = Math.random() * 0.3 + 0.1; // 0.1-0.4 Hz
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 5; // Hz depth
        lfo.connect(lfoGain).connect(this.osc.frequency);
        lfo.start();

        // LFO for subtle amplitude modulation
        const ampLfo = audioCtx.createOscillator();
        ampLfo.type = 'sine';
        ampLfo.frequency.value = Math.random() * 0.2 + 0.05; // 0.05-0.25 Hz
        const ampLfoGain = audioCtx.createGain();
        ampLfoGain.gain.value = 0.02;
        ampLfo.connect(ampLfoGain).connect(this.gainNode.gain);
        ampLfo.start();

        // Routing chain:
        // osc → filter → gainNode
        // noiseGain → gainNode
        // gainNode → panner → eqInput → … → masterGain
        this.osc
            .connect(filter)
            .connect(this.gainNode);
        noiseGain.connect(this.gainNode);
        this.gainNode
            .connect(this.panner)
            .connect(eqInput);

        this.osc.start();
        noise.start();
    }
}


// — Particle effects (p300h3) —
class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 1.5;
        this.vy = (Math.random() - 0.5) * 1.5;
        this.alpha = 1;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha *= 0.96;
    }
    draw(ctx) {
        ctx.fillStyle = `rgba(160,255,160,${this.alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

const particles = [];

function spawnParticles(x, y) {
    for (let i = 0; i < 20; i++) particles.push(new Particle(x, y));
}


// — Utility: compute quadratic control point (main) —
function computeControlPoint(startNode, endPos) {
    const dx = endPos.x - startNode.x;
    const dy = endPos.y - startNode.y;
    const offset = 0.3;
    return {
        x: startNode.x + dx / 2 - dy * offset,
        y: startNode.y + dy / 2 + dx * offset
    };
}


// — DRAW LOOP (merged) —
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#88ff88';
    ctx.shadowBlur = 15;

    // Update & draw particles (p300h3)
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw(ctx);
        if (particles[i].alpha < 0.05) particles.splice(i, 1);
    }

    // Draw edges (quadratic curves) for each node’s children
    for (const n of nodes) {
        for (const edge of n.children) {
            ctx.strokeStyle = n.color;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);

            // If a custom control point exists, use it; otherwise midpoint
            const cp = edge.cp || { x: (n.x + edge.node.x) / 2, y: (n.y + edge.node.y) / 2 };
            ctx.quadraticCurveTo(cp.x, cp.y, edge.node.x, edge.node.y);
            ctx.stroke();
        }
    }

    // Draw each node as a filled circle
    for (const n of nodes) {
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // If dragging, draw preview curve
    if (dragging && dragNode && dragNode.temp) {
        ctx.strokeStyle = dragNode.color;
        ctx.beginPath();
        ctx.moveTo(dragNode.x, dragNode.y);
        ctx.quadraticCurveTo(
            dragNode.temp.cp.x,
            dragNode.temp.cp.y,
            dragNode.temp.x,
            dragNode.temp.y
        );
        ctx.stroke();
    }

    ctx.shadowBlur = 0;
    requestAnimationFrame(draw);
}

draw();


function findNode(x, y) {
    return nodes.find(n => Math.hypot(n.x - x, n.y - y) < n.radius + 2);
}


// — Remove a node and its mirror (p300h3) —
function removeNode(node, skipMirror = false) {
    if (!node || node === nodes[0]) return;
    node.children.slice().forEach(edge => removeNode(edge.node));
    if (node.osc) node.osc.stop();
    if (node.gainNode) node.gainNode.disconnect();
    if (node.parent) {
        node.parent.children = node.parent.children.filter(e => e.node !== node);
    }
    nodes.splice(nodes.indexOf(node), 1);
    if (!skipMirror && node.mirror && node.mirror !== node) {
        const m = node.mirror;
        node.mirror = null;
        m.mirror = null;
        removeNode(m, true);
    }
}


// — MOUSE EVENTS FOR NODE‐GROWTH — 

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const node = findNode(x, y);
    if (node) {
        dragNode = node;
        dragging = true;
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (dragging) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cp = computeControlPoint(dragNode, { x, y });
        dragNode.temp = { x, y, cp };
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (dragging && dragNode) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cp = computeControlPoint(dragNode, { x, y });

        // Determine pan based on left/right of screen
        const mid = canvas.width / 2;
        const pan = x < mid ? -1 : 1;
        const freq = getMusicalFrequency();

        // Create the new child node
        const newNode = new Node(x, y, { freq, pan, parent: dragNode });
        nodes.push(newNode);
        dragNode.children.push({ node: newNode, cp });
        spawnParticles(x, y);

        if (mirrorEnabled) {
            const mirrorParent = dragNode.mirror || dragNode;
            const mirrorX = 2 * mid - x;
            const cpMirror = computeControlPoint(mirrorParent, { x: mirrorX, y });
            const mirrorPan = mirrorX < mid ? -1 : 1;
            const mirrorNode = new Node(mirrorX, y, {
                freq: freq + BINAURAL_OFFSET,
                pan: mirrorPan,
                mirror: newNode,
                parent: mirrorParent
            });
            newNode.mirror = mirrorNode;
            nodes.push(mirrorNode);
            mirrorParent.children.push({ node: mirrorNode, cp: cpMirror });
            spawnParticles(mirrorX, y);
        }

        delete dragNode.temp;
        dragNode = null;
        dragging = false;
    }
});

// Right-click to remove a node
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const node = findNode(x, y);
    removeNode(node);
});


// — START BUTTON & CONTROLS — 

const startBtn = document.getElementById('startBtn');
const mirrorBtn = document.getElementById('mirrorBtn');
const eqControls = document.getElementById('eqControls');
const sliders = [];

mirrorBtn.addEventListener('click', () => {
    mirrorEnabled = !mirrorEnabled;
    mirrorBtn.textContent = mirrorEnabled ? 'Mirror On' : 'Mirror Off';
});

startBtn.addEventListener('click', () => {
    if (!audioCtx) {
        // Initialize AudioContext & master gain
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
        masterGain.gain.setValueAtTime(0.3, audioCtx.currentTime);

        // Create EQ chain and route its last filter into masterGain
        eqInput = createEQ();
        eqFilters[eqFilters.length - 1].connect(masterGain);

        // Create root node in center of screen, pan = 0 (center)
        const rootNode = new Node(canvas.width / 2, canvas.height / 2, { radius: 20, pan: 0, parent: null });
        rootNode.mirror = rootNode; // self‐mirror for the root
        nodes.push(rootNode);

        startBtn.style.display = 'none';
        eqControls.style.display = 'flex'; // reveal the sliders

        // Hook up each slider’s “input” to its corresponding filter’s gain
        const ids = ['darkSlider', 'brownSlider', 'pinkSlider', 'greenSlider', 'whiteSlider'];
        ids.forEach((id, i) => {
            const el = document.getElementById(id);
            sliders[i] = el;
            el.addEventListener('input', () => {
                const val = parseFloat(el.value);
                eqFilters[i].gain.setValueAtTime(val, audioCtx.currentTime);
            });
        });
    }
});
