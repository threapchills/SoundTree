const canvas = document.getElementById('treeCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

let audioCtx;
let masterGain;

// — from “main” branch: EQ/filter setup —
let eqInput;
let eqFilters = [];
const eqSettings = [
    { freq: 60,   Q: 0.7 },
    { freq: 200,  Q: 0.8 },
    { freq: 800,  Q: 0.6 },
    { freq: 2500, Q: 0.9 },
    { freq: 8000, Q: 0.8 }
];

const BINAURAL_OFFSET = 4; // Hz difference between hemispheres

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

// — end of EQ/filter setup —


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

        // Generate subtle noise blended into each node
        const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuf;
        noise.loop = true;

        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 1000;

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.value = 0.02;  // very subtle noise

        noise.connect(noiseFilter).connect(noiseGain);

        // Each node has its ownGain
        this.gainNode = audioCtx.createGain();
        this.gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);

        // Stereo panner per node (binaural effect)
        this.panner = audioCtx.createStereoPanner();
        this.panner.pan.setValueAtTime(this.pan, audioCtx.currentTime);

        // — LFO #1: gentle frequency modulation (0.1–0.4 Hz sine)
        const lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = Math.random() * 0.3 + 0.1; // between 0.1 and 0.4 Hz
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 5; // ±5 Hz depth
        lfo.connect(lfoGain).connect(this.osc.frequency);
        lfo.start();

        // — LFO #2: subtle amplitude modulation (0.05–0.25 Hz sine)
        const ampLfo = audioCtx.createOscillator();
        ampLfo.type = 'sine';
        ampLfo.frequency.value = Math.random() * 0.2 + 0.05; // 0.05–0.25 Hz
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

const nodes = [];
let dragNode = null;
let dragging = false;

// From “main” branch: compute quadratic control point
function computeControlPoint(startNode, endPos) {
    const dx = endPos.x - startNode.x;
    const dy = endPos.y - startNode.y;
    const offset = 0.3;
    return {
        x: startNode.x + dx / 2 - dy * offset,
        y: startNode.y + dy / 2 + dx * offset
    };
}

// — DRAW LOOP (merges drawing logic from both branches) —
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;

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

    // If we’re in the middle of dragging a node to create a new one, draw that preview line
    if (dragging && dragNode && dragNode.temp) {
        ctx.strokeStyle = dragNode.color;
        ctx.beginPath();
        ctx.moveTo(dragNode.x, dragNode.y);

        // dragNode.temp.cp was computed in mousemove
        ctx.quadraticCurveTo(
            dragNode.temp.cp.x,
            dragNode.temp.cp.y,
            dragNode.temp.x,
            dragNode.temp.y
        );
        ctx.stroke();
    }

    requestAnimationFrame(draw);
}

draw();

function findNode(x, y) {
    return nodes.find(n => Math.hypot(n.x - x, n.y - y) < n.radius + 2);
}

// — MOUSE EVENTS FOR NODE‐GROWTH —

// Start dragging if user mouses down on a node
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

// While dragging: compute a temporary control point & pointer position
canvas.addEventListener('mousemove', (e) => {
    if (dragging) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cp = computeControlPoint(dragNode, { x, y });
        dragNode.temp = { x, y, cp };
    }
});

// On mouseup: commit the new node + its mirror and hook up edges
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
        const newNode = new Node(x, y, { freq, pan });
        nodes.push(newNode);
        dragNode.children.push({ node: newNode, cp });

        // Create the mirrored twin on the opposite side (binaural offset)
        const mirrorParent = dragNode.mirror || dragNode;
        const mirrorX = 2 * mid - x;
        const cpMirror = computeControlPoint(mirrorParent, { x: mirrorX, y });
        const mirrorPan = mirrorX < mid ? -1 : 1;

        const mirrorNode = new Node(mirrorX, y, {
            freq: freq + BINAURAL_OFFSET,
            pan: mirrorPan,
            mirror: newNode
        });
        newNode.mirror = mirrorNode;
        nodes.push(mirrorNode);
        mirrorParent.children.push({ node: mirrorNode, cp: cpMirror });

        delete dragNode.temp;
        dragNode = null;
        dragging = false;
    }
});

// — START BUTTON & EQ SLIDERS — 
const startBtn = document.getElementById('startBtn');
const eqControls = document.getElementById('eqControls');
const sliders = [];

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
        const rootNode = new Node(canvas.width / 2, canvas.height / 2, { radius: 20, pan: 0 });
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