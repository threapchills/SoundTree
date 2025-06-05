const canvas = document.getElementById('treeCanvas');
const ctx = canvas.getContext('2d');
const bgCanvas = document.getElementById('glCanvas');
const bgCtx = bgCanvas.getContext('2d');
bgCanvas.width = window.innerWidth;
bgCanvas.height = window.innerHeight;

const stars = [];
for (let i = 0; i < 1500; i++) {
    stars.push({
        x: (Math.random() * 2 - 1) * 50,
        y: (Math.random() * 2 - 1) * 50,
        z: Math.random() * 40 + 10
    });
}
animateStars(0);
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
});

let audioCtx;
let masterGain;
let eqInput;
let eqFilters = [];
const eqSettings = [
    { freq: 60, Q: 0.7 },
    { freq: 200, Q: 0.8 },
    { freq: 800, Q: 0.6 },
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
    for (let i = 0; i < eqFilters.length - 1; i++) {
        eqFilters[i].connect(eqFilters[i + 1]);
    }
    return eqFilters[0];
}

function animateStars(time) {
    requestAnimationFrame(animateStars);
    const t = time * 0.0002;
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    for (const s of stars) {
        const rx = s.x * Math.cos(t * 0.5) - s.z * Math.sin(t * 0.5);
        const rz = s.x * Math.sin(t * 0.5) + s.z * Math.cos(t * 0.5);
        const ry = s.y * Math.cos(t * 0.3) - rz * Math.sin(t * 0.3);
        const z2 = ry * Math.sin(t * 0.3) + rz * Math.cos(t * 0.3);
        const fov = 200;
        const scale = fov / (fov + z2);
        const x2 = rx * scale + bgCanvas.width / 2;
        const y2 = ry * scale + bgCanvas.height / 2;
        const alpha = 0.6 * scale;
        bgCtx.fillStyle = `rgba(80,255,80,${alpha})`;
        bgCtx.fillRect(x2, y2, scale * 2, scale * 2);
    }
}



function getMusicalFrequency() {
    // minor pentatonic around A3/A4
    const base = 220;
    const scale = [0, 3, 5, 7, 10];
    const octave = Math.random() > 0.5 ? 0 : 1;
    const step = scale[Math.floor(Math.random() * scale.length)];
    return base * Math.pow(2, octave) * Math.pow(2, step / 12);
}

class Node {
    constructor(x, y, opts = {}) {
        this.x = x;
        this.y = y;
        this.radius = opts.radius || 8;
        this.children = []; // { node, cp }
        this.osc = null;
        this.gainNode = null;
        this.panner = null;
        this.freq = opts.freq || getMusicalFrequency();
        this.pan = opts.pan || 0;
        this.mirror = opts.mirror || null;
        this.parent = opts.parent || null;
        if (audioCtx) this.createOscillator();
    }

    createOscillator() {
        this.osc = audioCtx.createOscillator();
        this.osc.type = 'sawtooth';
        this.osc.frequency.setValueAtTime(this.freq, audioCtx.currentTime);

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, audioCtx.currentTime);

        // subtle noise source blended into each node
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

        this.gainNode = audioCtx.createGain();
        this.gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);

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

const nodes = [];
let dragNode = null;
let dragging = false;

function computeControlPoint(startNode, endPos) {
    const dx = endPos.x - startNode.x;
    const dy = endPos.y - startNode.y;
    const offset = 0.3;
    return {
        x: startNode.x + dx / 2 - dy * offset,
        y: startNode.y + dy / 2 + dx * offset
    };
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#88ff88';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#88ff88';
    ctx.shadowBlur = 15;

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw(ctx);
        if (particles[i].alpha < 0.05) particles.splice(i, 1);
    }

    for (const n of nodes) {
        for (const edge of n.children) {
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            const cp = edge.cp || { x: (n.x + edge.node.x) / 2, y: (n.y + edge.node.y) / 2 };
            ctx.quadraticCurveTo(cp.x, cp.y, edge.node.x, edge.node.y);
            ctx.stroke();
        }
    }

    for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    if (dragging && dragNode && dragNode.temp) {
        ctx.beginPath();
        ctx.moveTo(dragNode.x, dragNode.y);
        ctx.quadraticCurveTo(dragNode.temp.cp.x, dragNode.temp.cp.y, dragNode.temp.x, dragNode.temp.y);
        ctx.stroke();
    }
    ctx.shadowBlur = 0;

    requestAnimationFrame(draw);
}

draw();

function findNode(x, y) {
    return nodes.find(n => Math.hypot(n.x - x, n.y - y) < n.radius + 2);
}

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
        const mid = canvas.width / 2;
        const pan = x < mid ? -1 : 1;
        const freq = getMusicalFrequency();
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

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const node = findNode(x, y);
    removeNode(node);
});

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
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
        masterGain.gain.setValueAtTime(0.3, audioCtx.currentTime);

        // create EQ and connect to output
        eqInput = createEQ();
        eqFilters[eqFilters.length - 1].connect(masterGain);

        // ––– From main (with the new radius option):
        const rootNode = new Node(canvas.width / 2, canvas.height / 2, { radius: 20, pan: 0, parent: null });
        rootNode.mirror = rootNode;
        nodes.push(rootNode);
        startBtn.style.display = 'none';
        eqControls.style.display = 'flex';

        // hook sliders to EQ bands
        const ids = ['darkSlider','brownSlider','pinkSlider','greenSlider','whiteSlider'];
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
