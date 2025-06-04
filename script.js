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
let rootFrequency = 55;
const scaleSteps = [0, 3, 5, 7, 10]; // minor pentatonic

class Node {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.children = [];
        this.osc = null;
        this.gainNode = null;
        this.color = `hsl(${Math.floor(Math.random() * 360)},70%,60%)`;
        if (audioCtx) this.createOscillator();
    }

    createOscillator() {
        this.osc = audioCtx.createOscillator();
        this.gainNode = audioCtx.createGain();
        const step = scaleSteps[Math.floor(Math.random() * scaleSteps.length)];
        const octave = Math.floor(Math.random() * 3);
        const freq = rootFrequency * Math.pow(2, octave + step / 12);
        this.osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        this.osc.type = 'sine';
        this.gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);

        // subtle LFO for organic motion
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.frequency.setValueAtTime(Math.random() * 0.5 + 0.1, audioCtx.currentTime);
        lfoGain.gain.setValueAtTime(10, audioCtx.currentTime);
        lfo.connect(lfoGain).connect(this.osc.frequency);
        lfo.start();

        this.osc.connect(this.gainNode).connect(masterGain);
        this.osc.start();
    }
}

const nodes = [];
let dragNode = null;
let dragging = false;

function reseed() {
    rootFrequency = 40 + Math.random() * 80;
    nodes.forEach(n => {
        if (n.osc) {
            const step = scaleSteps[Math.floor(Math.random() * scaleSteps.length)];
            const octave = Math.floor(Math.random() * 3);
            const freq = rootFrequency * Math.pow(2, octave + step / 12);
            n.osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        }
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;

    for (const n of nodes) {
        for (const child of n.children) {
            ctx.strokeStyle = n.color;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(child.x, child.y);
            ctx.stroke();
        }
    }

    for (const n of nodes) {
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
        ctx.fill();
    }

    if (dragging && dragNode && dragNode.temp) {
        ctx.strokeStyle = dragNode.color;
        ctx.beginPath();
        ctx.moveTo(dragNode.x, dragNode.y);
        ctx.lineTo(dragNode.temp.x, dragNode.temp.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(dragNode.temp.x, dragNode.temp.y, 6, 0, Math.PI * 2);
        ctx.stroke();
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
startBtn.addEventListener('click', () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
        masterGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        const rootNode = new Node(canvas.width / 2, canvas.height / 2);
        nodes.push(rootNode);
        startBtn.style.display = 'none';
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 's') {
        reseed();
    }
});
