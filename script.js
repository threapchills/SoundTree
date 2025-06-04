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
