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
let eqInput;
let eqFilters = [];
const eqSettings = [
    { freq: 60, Q: 0.7 },
    { freq: 200, Q: 0.8 },
    { freq: 800, Q: 0.6 },
    { freq: 2500, Q: 0.9 },
    { freq: 8000, Q: 0.8 }
];

const particles = [];

function spawnParticles(x, y) {
    for (let i = 0; i < 20; i++) {
        particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            alpha: 1,
            r: 2 + Math.random() * 3
        });
    }
    particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        alpha: 0.6,
        r: 10
    });
}



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
        if (audioCtx) this.createOscillator();
    }

    createOscillator() {
        this.osc = audioCtx.createOscillator();
        this.osc.type = 'sawtooth';
        this.osc.frequency.setValueAtTime(this.freq, audioCtx.currentTime);

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, audioCtx.currentTime);

        this.gainNode = audioCtx.createGain();
        this.gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);

        this.panner = audioCtx.createStereoPanner();
        this.panner.pan.setValueAtTime(this.pan, audioCtx.currentTime);

        this.osc
            .connect(filter)
            .connect(this.gainNode)
            .connect(this.panner)
            .connect(eqInput);

        this.osc.start();
    }
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

    // particle effects
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.02;
        if (p.alpha <= 0) {
            particles.splice(i, 1);
            continue;
        }
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = '#66ff66';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ff66';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    if (dragging && dragNode && dragNode.temp) {
        ctx.beginPath();
        ctx.moveTo(dragNode.x, dragNode.y);
        ctx.quadraticCurveTo(dragNode.temp.cp.x, dragNode.temp.cp.y, dragNode.temp.x, dragNode.temp.y);
        ctx.stroke();
    }

    requestAnimationFrame(draw);
}

draw();

function findNode(x, y) {
    return nodes.find(n => Math.hypot(n.x - x, n.y - y) < n.radius + 2);
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
        const newNode = new Node(x, y, { freq, pan });
        nodes.push(newNode);
        dragNode.children.push({ node: newNode, cp });
        spawnParticles(x, y);

        delete dragNode.temp;
        dragNode = null;
        dragging = false;
    }
});

const startBtn = document.getElementById('startBtn');
const eqControls = document.getElementById('eqControls');
const sliders = [];
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
        const rootNode = new Node(canvas.width / 2, canvas.height / 2, { radius: 20, pan: 0 });
        nodes.push(rootNode);
        spawnParticles(rootNode.x, rootNode.y);
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
