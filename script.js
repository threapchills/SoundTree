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
let noiseSource;
let eqFilters = [];
const eqSettings = [
    { freq: 60, Q: 0.7 },
    { freq: 200, Q: 0.8 },
    { freq: 800, Q: 0.6 },
    { freq: 2500, Q: 0.9 },
    { freq: 8000, Q: 0.8 }
];

const presets = {
    dark:  [8, 4, 0, 0, 0],
    brown: [4, 6, 2, -2, -4],
    pink:  [2, 3, 1, -1, -3],
    green: [0, 0, 4, 3, 0],
    white: [0, 0, 0, 0, 0]
};

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

function createNoise() {
    const bufferSize = 2 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
}

function applyPreset(name) {
    const gains = presets[name] || presets.white;
    eqFilters.forEach((f, i) => {
        f.gain.setValueAtTime(gains[i], audioCtx.currentTime);
    });
}

class Node {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.children = [];
        this.osc = null;
        this.gainNode = null;
        if (audioCtx) this.createOscillator();
    }

    createOscillator() {
        this.osc = audioCtx.createOscillator();
        this.gainNode = audioCtx.createGain();
        const freq = 110 + Math.random() * 220;
        this.osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        this.osc.type = 'sine';
        this.gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        this.osc.connect(this.gainNode).connect(masterGain);
        this.osc.start();
    }
}

const nodes = [];
let dragNode = null;
let dragging = false;

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#88ff88';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#ffffff';

    for (const n of nodes) {
        for (const child of n.children) {
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(child.x, child.y);
            ctx.stroke();
        }
    }

    for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
        ctx.fill();
    }

    requestAnimationFrame(draw);
}

draw();

function findNode(x, y) {
    return nodes.find(n => Math.hypot(n.x - x, n.y - y) < 10);
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
        if (!dragNode.temp) {
            dragNode.temp = { x: x, y: y };
        } else {
            dragNode.temp.x = x;
            dragNode.temp.y = y;
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (dragging && dragNode) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const newNode = new Node(x, y);
        nodes.push(newNode);
        dragNode.children.push(newNode);
        delete dragNode.temp;
        dragNode = null;
        dragging = false;
    }
});

const startBtn = document.getElementById('startBtn');
const colorSelect = document.getElementById('colorSelect');
startBtn.addEventListener('click', () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
        masterGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        const eqInput = createEQ();
        noiseSource = createNoise();
        noiseSource.connect(eqInput).connect(masterGain);
        noiseSource.start();
        const rootNode = new Node(canvas.width / 2, canvas.height / 2);
        nodes.push(rootNode);
        startBtn.style.display = 'none';
        colorSelect.style.display = 'inline-block';
        applyPreset('white');
    }
});

colorSelect.addEventListener('change', (e) => {
    if (audioCtx) {
        applyPreset(e.target.value);
    }
});
