const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');
let width, height;

// --- AUDIO ENGINE CLASS ---
// --- AUDIO ENGINE CLASS ---
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.masterAnalyser = null; // New Mono/Mix Analyser
        this.analyserL = null; // Left Channel
        this.analyserR = null; // Right Channel
        this.voices = {};
        this.droneVoice = null;
        this.polyphonyLimit = 16;
    }

    init() {
        if (this.ctx) return;
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtor();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.4;

        // New: Master Analyser (Mix)
        this.masterAnalyser = this.ctx.createAnalyser();
        this.masterAnalyser.fftSize = 2048;

        this.analyserL = this.ctx.createAnalyser();
        this.analyserR = this.ctx.createAnalyser();
        this.analyserL.fftSize = 2048;
        this.analyserR.fftSize = 2048;

        // Routing: MasterGain -> MasterAnalyser -> Splitter -> (L/R Analysers)
        const splitter = this.ctx.createChannelSplitter(2);

        this.masterGain.connect(this.masterAnalyser);
        this.masterAnalyser.connect(splitter);

        splitter.connect(this.analyserL, 0);
        splitter.connect(this.analyserR, 1);

        // Output to speakers
        this.masterGain.connect(this.ctx.destination);
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // --- CONTINUOUS DRONE (Separate from Transient Notes) ---
    playDrone(freq, type = 'sine') {
        this.init();
        this.resume();

        // If drone exists, just update it
        if (this.droneVoice) {
            this.droneVoice.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
            this.droneVoice.osc.type = type;
            // Ensure gain is up (in case it was ramping down)
            this.droneVoice.env.gain.cancelScheduledValues(this.ctx.currentTime);
            this.droneVoice.env.gain.setTargetAtTime(1, this.ctx.currentTime, 0.1);
            return;
        }

        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        // Drone envelope: Attack -> Sustain at 1.0 (No decay)
        const now = this.ctx.currentTime;
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(1, now + 0.5); // Slow attack for smooth drone

        osc.connect(env);
        env.connect(this.masterGain);
        osc.start();

        this.droneVoice = { osc, env };
        console.log('[Audio] Drone Started');
    }

    stopDrone() {
        if (this.droneVoice) {
            const { osc, env } = this.droneVoice;
            const now = this.ctx.currentTime;

            env.gain.cancelScheduledValues(now);
            env.gain.setTargetAtTime(0, now, 0.2); // Smooth release
            osc.stop(now + 0.5);

            this.droneVoice = null;
            console.log('[Audio] Drone Stopped');
        }
    }

    // --- TRANSIENT NOTES (Keyboard) ---
    playNote(freq, type = 'sine', pan = 0, explicitKey = null) {
        this.init();
        this.resume();

        const key = explicitKey || `${freq}_${pan}`;
        this.stopNote(key);

        if (Object.keys(this.voices).length >= this.polyphonyLimit) return;

        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        const panner = this.ctx.createStereoPanner();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        const now = this.ctx.currentTime;
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(1, now + 0.05);
        env.gain.exponentialRampToValueAtTime(0.7, now + 0.2);

        panner.pan.value = pan;

        osc.connect(env);
        env.connect(panner);
        panner.connect(this.masterGain);

        osc.start();

        this.voices[key] = { osc, env, panner };
    }

    stopNote(key) {
        if (this.voices[key]) {
            const { osc, env } = this.voices[key];
            const now = this.ctx.currentTime;

            env.gain.cancelScheduledValues(now);
            env.gain.setValueAtTime(env.gain.value, now);
            env.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

            osc.stop(now + 0.1);
            delete this.voices[key];
        }
    }

    // --- LEGACY MAPPINGS ---
    playTone(freq, type) {
        this.playDrone(freq, type);
    }

    stopTone() {
        this.stopDrone();
    }

    // Theory Mode: Dual Drones (Uses Voices Map for Polyphony)
    updateTheoryTones(freqBase, freqHarm) {
        // ... (Keep existing Theory logic or refactor? Let's keep existing for now as it worked)
        // Wait, if I change playNote logic, does updateTheoryTones break?
        // updateTheoryTones uses playNote('theoryL').
        // playNote uses ADSR (Decay to 0.7).
        // This is fine for theory drones too, they will sustain at 0.7.
        // But we should ensure they don't die.

        this.init();
        this.resume();

        // Left Channel: Base ('theoryL')
        if (!this.voices['theoryL']) {
            this.playNote(freqBase, oscType, -1, 'theoryL');
        } else {
            this.voices['theoryL'].osc.frequency.setTargetAtTime(freqBase, this.ctx.currentTime, 0.05);
            this.voices['theoryL'].osc.type = oscType;
        }

        // Right Channel: Harmony ('theoryR')
        if (!this.voices['theoryR']) {
            this.playNote(freqHarm, oscType, 1, 'theoryR');
        } else {
            this.voices['theoryR'].osc.frequency.setTargetAtTime(freqHarm, this.ctx.currentTime, 0.05);
            this.voices['theoryR'].osc.type = oscType;
        }
    }

    stopTheoryTones() {
        this.stopNote('theoryL');
        this.stopNote('theoryR');
    }
}

const engine = new AudioEngine();

// --- VIRTUAL KEYBOARD STATE ---
const pianoKeys = [
    { note: 'C3', freq: 130.81, key: 'a', color: 'white' },
    { note: 'C#3', freq: 138.59, key: 'w', color: 'black' },
    { note: 'D3', freq: 146.83, key: 's', color: 'white' },
    { note: 'D#3', freq: 155.56, key: 'e', color: 'black' },
    { note: 'E3', freq: 164.81, key: 'd', color: 'white' },
    { note: 'F3', freq: 174.61, key: 'f', color: 'white' },
    { note: 'F#3', freq: 185.00, key: 't', color: 'black' },
    { note: 'G3', freq: 196.00, key: 'g', color: 'white' },
    { note: 'G#3', freq: 207.65, key: 'y', color: 'black' },
    { note: 'A3', freq: 220.00, key: 'h', color: 'white' },
    { note: 'A#3', freq: 233.08, key: 'u', color: 'black' },
    { note: 'B3', freq: 246.94, key: 'j', color: 'white' },
    { note: 'C4', freq: 261.63, key: 'k', color: 'white' },
    { note: 'C#4', freq: 277.18, key: 'o', color: 'black' },
    { note: 'D4', freq: 293.66, key: 'l', color: 'white' }
];

// --- UI & GLOBALS ---
let currentMode = 'oscilloscope';
let theoryEnabled = false;
let oscType = 'sine';
let harmonyRatio = 1;
let frequency = 440;
let detuneCents = 0; // New

const selectMode = document.getElementById('viz-mode');
const toggleTheory = document.getElementById('toggle-theory');
const selectType = document.getElementById('osc-type');
const rangeFreq = document.getElementById('freq-control');
const spanFreq = document.getElementById('freq-val');

// Theory UI
const harmonyGroup = document.getElementById('harmony-group');
const circleGroup = document.getElementById('circle-group');
const radioRatios = document.querySelectorAll('input[name="ratio"]');

// Detune UI
const rangeDetune = document.getElementById('detune-control');
const spanDetune = document.getElementById('detune-val');

// Resize
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
}
window.addEventListener('resize', resize);
resize();

// --- EVENT LISTENERS ---
const btnToggle = document.getElementById('toggle-audio');
let isAudioActive = false;

// Audio Toggle
btnToggle.addEventListener('click', () => {
    engine.init();
    console.log('[UI] Toggle Clicked. isAudioActive:', isAudioActive);
    if (isAudioActive) {
        engine.stopTone();
        engine.stopTheoryTones();
        btnToggle.textContent = 'Start Audio';
        isAudioActive = false;
    } else {
        btnToggle.textContent = 'Stop Audio';
        isAudioActive = true;
        updateAudioState();
        console.log('[UI] State updated. Active:', isAudioActive);
    }
});

// Helper to update audio based on ALL params
function updateAudioState() {
    if (!isAudioActive) return;

    // Calculate harmony freq with detune
    // Freq * Ratio * 2^(cents/1200)
    const detuneMultiplier = Math.pow(2, detuneCents / 1200);
    const harmonyFreq = frequency * harmonyRatio * detuneMultiplier;

    if (theoryEnabled) {
        engine.updateTheoryTones(frequency, harmonyFreq);
    } else {
        engine.playTone(frequency, oscType);
    }
}

// Mode Selector
selectMode.addEventListener('change', (e) => {
    currentMode = e.target.value;
    const detuneGroup = document.getElementById('detune-group');
    if (detuneGroup) detuneGroup.style.display = (currentMode === 'lissajous') ? 'block' : 'none';
});

// Theory Toggle
toggleTheory.addEventListener('change', (e) => {
    theoryEnabled = e.target.checked;
    if (harmonyGroup) harmonyGroup.style.display = theoryEnabled ? 'block' : 'none';
    if (circleGroup) circleGroup.style.display = theoryEnabled ? 'block' : 'none';

    // Stop/Restart to switch modes cleanly
    if (isAudioActive) {
        engine.stopTone();
        engine.stopTheoryTones();
        updateAudioState();
    }
});

selectType.addEventListener('change', (e) => {
    oscType = e.target.value;
    updateAudioState();
});

rangeFreq.addEventListener('input', (e) => {
    frequency = parseInt(e.target.value);
    spanFreq.textContent = frequency;
    updateAudioState();
});

// Detune Listener
if (rangeDetune) {
    rangeDetune.addEventListener('input', (e) => {
        detuneCents = parseInt(e.target.value);
        if (spanDetune) spanDetune.textContent = detuneCents;
        updateAudioState();
    });
}

// Harmony/Theory Handlers
radioRatios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        harmonyRatio = parseFloat(e.target.value);
        updateAudioState();
    });
});


// --- LESSON MANAGER ---
class LessonManager {
    constructor() {
        this.currentLesson = 0;
        this.step = 0;
        this.lessons = [
            {
                title: "Lesson 1: The Physics of Sound",
                steps: [
                    {
                        text: "Welcome to the Lab! Sound is just vibration. Let's see it.",
                        action: () => {
                            console.log('[Lesson] L1 Step 0 Action');
                            currentMode = 'oscilloscope';
                            oscType = 'sine';
                            // Update UI selectors to match
                            selectMode.value = 'oscilloscope';
                            selectType.value = 'sine';

                            if (engine.ctx) engine.playTone(220, 'sine');
                        }
                    },
                    {
                        text: "This is a Sine Wave. It's the purest sound. Notice the smooth curve.",
                        action: () => { console.log('[Lesson] L1 Step 1 Action'); }
                    },
                    {
                        text: "Drag the Frequency slider. Low pitch = Long waves. High pitch = Short waves.",
                        action: () => { console.log('[Lesson] L1 Step 2 Action'); }
                    }
                ]
            },
            {
                title: "Lesson 2: Harmonics",
                steps: [
                    {
                        text: "Most sounds aren't pure. They are complex. Switch to 'Sawtooth' wave.",
                        action: () => {
                            console.log('[Lesson] L2 Step 0 Action');
                            oscType = 'sawtooth';
                            selectType.value = 'sawtooth';
                            if (engine.ctx) engine.playTone(220, 'sawtooth');
                        }
                    },
                    {
                        text: "Look at the sharp edges! That complexity gives it a 'buzzy' sound.",
                        action: () => { console.log('[Lesson] L2 Step 1 Action'); }
                    },
                    {
                        text: "Now let's see the Spectrum (Frequency) view.",
                        action: () => {
                            console.log('[Lesson] L2 Step 2 Action');
                            currentMode = 'spectrum';
                            selectMode.value = 'spectrum';
                        }
                    },
                    {
                        text: "See those extra bars? Those are Harmonics! Multiples of the base frequency.",
                        action: () => { console.log('[Lesson] L2 Step 3 Action'); }
                    }
                ]
            }
        ];

        this.overlay = null;
    }

    init() {
        if (document.getElementById('lesson-overlay')) return; // Already exists
        this.createOverlay();
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'lesson-overlay';
        this.overlay.className = 'lesson-overlay hidden';
        this.overlay.innerHTML = `
            <div class="lesson-box">
                <h2 id="lesson-title">Lesson Title</h2>
                <p id="lesson-text">Lesson text goes here...</p>
                <div class="lesson-controls">
                    <button id="btn-lesson-prev" class="btn-secondary">Back</button>
                    <button id="btn-lesson-next" class="btn-primary">Next</button>
                    <button id="btn-lesson-close" class="btn-text">Exit Lesson</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);

        // Use e.stopPropagation to prevent bubbling issues
        document.getElementById('btn-lesson-next').addEventListener('click', (e) => { e.stopPropagation(); this.nextStep(); });
        document.getElementById('btn-lesson-prev').addEventListener('click', (e) => { e.stopPropagation(); this.prevStep(); });
        document.getElementById('btn-lesson-close').addEventListener('click', (e) => { e.stopPropagation(); this.stopLesson(); });
    }

    startLesson(index) {
        console.log('[Lesson] Start Lesson:', index);
        this.currentLesson = index;
        this.step = 0;
        this.overlay.classList.remove('hidden');
        this.updateUI();
    }

    stopLesson() {
        console.log('[Lesson] Stop');
        this.overlay.classList.add('hidden');
        if (engine) engine.stopTone();
    }

    nextStep() {
        console.log('[Lesson] Next Step Clicked. Current:', this.currentLesson, this.step);
        if (this.step < this.lessons[this.currentLesson].steps.length - 1) {
            this.step++;
            this.updateUI();
        } else {
            this.stopLesson();
            alert("Lesson Complete!");
        }
    }

    prevStep() {
        if (this.step > 0) {
            this.step--;
            this.updateUI();
        }
    }

    updateUI() {
        console.log('[Lesson] Update UI:', this.currentLesson, this.step);
        const lesson = this.lessons[this.currentLesson];
        const stepData = lesson.steps[this.step];

        if (!lesson || !stepData) {
            console.error('Invalid lesson state', this.currentLesson, this.step);
            return;
        }

        document.getElementById('lesson-title').innerText = lesson.title;
        document.getElementById('lesson-text').innerText = stepData.text;

        // Execute action
        if (stepData.action) stepData.action();
    }
}

const lessonManager = new LessonManager();
// Delay init until DOM ready
setTimeout(() => lessonManager.init(), 600);

// --- KEYBOARD LOGIC (New) ---
// Will be called by index.html init script or we can inject it here
// We need to render the keys first.

// --- KEYBOARD LOGIC (Fix) ---
// --- KEYBOARD LOGIC (Fix) ---
function initKeyboard() {
    console.log('[Init] Initializing Virtual Keyboard...');
    const kbContainer = document.getElementById('keyboard-container');
    if (!kbContainer) {
        console.error('[Init] Keyboard container not found!');
        return;
    }

    kbContainer.innerHTML = '';

    pianoKeys.forEach(k => {
        const keyEl = document.createElement('div');
        keyEl.classList.add('key', k.color);
        keyEl.dataset.note = k.note;

        // Label
        const label = document.createElement('span');
        label.innerText = k.note + `\n(${k.key.toUpperCase()})`;
        keyEl.appendChild(label);

        // Helpers
        const startKey = () => {
            if (theoryEnabled) {
                const detuneMultiplier = Math.pow(2, detuneCents / 1200);
                // Use UNIQUE ID per key so we don't steal voices from other keys
                engine.playNote(k.freq, oscType, -0.5, `${k.note}_base`);
                engine.playNote(k.freq * harmonyRatio * detuneMultiplier, oscType, 0.5, `${k.note}_harm`);
            } else {
                engine.playNote(k.freq, oscType, 0, `${k.note}_base`); // Standard
            }
            keyEl.classList.add('active');
        };
        const stopKey = () => {
            engine.stopNote(`${k.note}_base`);
            if (theoryEnabled) {
                engine.stopNote(`${k.note}_harm`);
            }
            keyEl.classList.remove('active');
        };

        // Mouse Events
        keyEl.addEventListener('mousedown', (e) => { e.preventDefault(); startKey(); }); // Prevent drag selection
        keyEl.addEventListener('mouseup', stopKey);
        keyEl.addEventListener('mouseleave', stopKey);

        // Touch Events for mobile support
        keyEl.addEventListener('touchstart', (e) => { e.preventDefault(); startKey(); });
        keyEl.addEventListener('touchend', (e) => { e.preventDefault(); stopKey(); });

        kbContainer.appendChild(keyEl);
    });

    console.log('[Init] Keyboard keys rendered.');

    // Keyboard Bindings (Global)
    window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const map = pianoKeys.find(k => k.key === e.key.toLowerCase());
        if (map) {
            if (theoryEnabled) {
                const detuneMultiplier = Math.pow(2, detuneCents / 1200);
                engine.playNote(map.freq, oscType, -0.5, `${map.note}_base`);
                engine.playNote(map.freq * harmonyRatio * detuneMultiplier, oscType, 0.5, `${map.note}_harm`);
            } else {
                engine.playNote(map.freq, oscType, 0, `${map.note}_base`);
            }
            const el = document.querySelector(`.key[data-note="${map.note}"]`);
            if (el) el.classList.add('active');
        }
    });

    window.addEventListener('keyup', (e) => {
        const map = pianoKeys.find(k => k.key === e.key.toLowerCase());
        if (map) {
            engine.stopNote(`${map.note}_base`);
            // Always try to stop harmony just in case mode switched, or check if theoryEnabled
            // Safer to just stop if it exists
            engine.stopNote(`${map.note}_harm`);

            const el = document.querySelector(`.key[data-note="${map.note}"]`);
            if (el) el.classList.remove('active');
        }
    });
}

// --- CIRCLE OF FIFTHS LOGIC (Restored) ---
// --- CIRCLE OF FIFTHS LOGIC (Restored) ---
const btnNextFifth = document.getElementById('btn-next-fifth');
const btnPrevFifth = document.getElementById('btn-prev-fifth'); // New
const btnResetCircle = document.getElementById('btn-reset-circle');
let circleSteps = 0;

// Helper to update circle frequency
function updateCircleFreq(newFreq) {
    frequency = newFreq;
    // Clamp visual range for slider but allow internal freq to go wherever? 
    // Actually, let's keep it within audible bounds loosely
    // frequency = Math.min(Math.max(frequency, 55), 880); 

    rangeFreq.value = Math.min(Math.max(frequency, 55), 880);
    spanFreq.textContent = Math.round(frequency);

    if (isAudioActive) {
        if (theoryEnabled) engine.updateTheoryTones(frequency, frequency * 1.5);
        else engine.playTone(frequency, oscType);
    }
}

if (btnNextFifth) {
    btnNextFifth.addEventListener('click', () => {
        circleSteps++;
        updateCircleFreq(frequency * 1.5);
    });
}

if (btnPrevFifth) {
    btnPrevFifth.addEventListener('click', () => {
        circleSteps--;
        updateCircleFreq(frequency / 1.5);
    });
}

if (btnResetCircle) {
    btnResetCircle.addEventListener('click', () => {
        circleSteps = 0;
        updateCircleFreq(261.63); // Middle C
    });
}

// ...

// Draw the Circle of Fifths Clock
function drawCircleOfFifths() {
    const cx = width - 150;
    const cy = 150;
    const radius = 80;

    // Background
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 20, 30, 0.8)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Notes of the Circle
    // C, G, D, A, E, B, F#, Db, Ab, Eb, Bb, F
    const notes = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 12px Outfit';

    notes.forEach((note, i) => {
        // -90deg offset so C is at Top
        const angle = (i * (360 / 12) - 90) * (Math.PI / 180);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;

        // Highlight logic (based on circleSteps % 12)
        // Correct modulo for negative numbers: ((n % m) + m) % m
        const currentIndex = ((circleSteps % 12) + 12) % 12;

        if (i === currentIndex) {
            ctx.fillStyle = '#00ff88';
            ctx.font = 'bold 16px Outfit';

            // Draw connector line to center
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(x, y);
            ctx.strokeStyle = 'rgba(0,255,136, 0.5)';
            ctx.stroke();

        } else {
            ctx.fillStyle = '#888';
            ctx.font = 'bold 12px Outfit';
        }

        ctx.fillText(note, x, y);
    });

    // Label
    ctx.fillStyle = '#fff';
    ctx.fillText("Circle of Fifths", cx, cy + radius + 35);
}


// --- VISUALIZATION LOOP ---
function draw() {
    requestAnimationFrame(draw);
    ctx.fillStyle = 'rgba(5, 5, 5, 0.2)';
    ctx.fillRect(0, 0, width, height);

    if (!engine.ctx) return;

    if (currentMode === 'oscilloscope') drawOscilloscope();
    if (currentMode === 'spectrum') drawSpectrum();
    if (currentMode === 'lissajous') drawLissajous();
    if (currentMode === 'interference') drawTheory();

    // Overlay Circle if Theory enabled (on ANY visualization)
    if (theoryEnabled) {
        drawCircleOfFifths();
    }
}

function drawOscilloscope() {
    const bufferLength = engine.masterAnalyser.fftSize; // USe Master
    const data = new Uint8Array(bufferLength);
    engine.masterAnalyser.getByteTimeDomainData(data);

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00ff88';
    ctx.beginPath();
    const sliceWidth = width * 1.0 / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
        const v = data[i] / 128.0;
        const y = v * height / 2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        x += sliceWidth;
    }
    ctx.lineTo(width, height / 2);
    ctx.stroke();
}

function drawSpectrum() {
    const bufferLength = engine.masterAnalyser.frequencyBinCount; // Use Master
    const data = new Uint8Array(bufferLength);
    engine.masterAnalyser.getByteFrequencyData(data);

    const barWidth = (width / bufferLength) * 2.5;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
        const barHeight = data[i];
        const scaled = (barHeight / 255) * height;
        ctx.fillStyle = `hsl(${i / bufferLength * 360}, 100%, 50%)`;
        ctx.fillRect(x, height - scaled, barWidth, scaled);
        x += barWidth + 1;
    }
}

function drawLissajous() {
    // Basic implementation for now
    const buffer = engine.analyserL.fftSize;
    const left = new Uint8Array(buffer);
    const right = new Uint8Array(buffer);
    engine.analyserL.getByteTimeDomainData(left);
    engine.analyserR.getByteTimeDomainData(right);

    ctx.strokeStyle = '#00ccff';
    ctx.beginPath();
    for (let i = 0; i < buffer; i++) {
        const x = (width / 2) + ((left[i] - 128) / 128.0 * width * 0.4);
        const y = (height / 2) + ((right[i] - 128) / 128.0 * height * 0.4);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function drawTheory() {
    const bufferLength = engine.analyserL.fftSize;
    const leftData = new Uint8Array(bufferLength);
    const rightData = new Uint8Array(bufferLength);

    engine.analyserL.getByteTimeDomainData(leftData);
    engine.analyserR.getByteTimeDomainData(rightData);

    ctx.lineWidth = 2;
    const sliceWidth = width * 1.0 / bufferLength;
    let x = 0;

    // Draw Left (Base) in Green
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.4)';
    x = 0;
    for (let i = 0; i < bufferLength; i++) {
        const v = leftData[i] / 128.0;
        const y = v * height / 2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        x += sliceWidth;
    }
    ctx.stroke();

    // Draw Right (Harmony) in Blue
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 204, 255, 0.4)';
    x = 0;
    for (let i = 0; i < bufferLength; i++) {
        const v = rightData[i] / 128.0;
        const y = v * height / 2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        x += sliceWidth;
    }
    ctx.stroke();

    // Draw Interference (Sum) in White
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    x = 0;
    for (let i = 0; i < bufferLength; i++) {
        const vL = (leftData[i] - 128) / 128.0;
        const vR = (rightData[i] - 128) / 128.0;
        const sum = (vL + vR) / 2; // Average
        const y = (sum * height / 2) + height / 2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        x += sliceWidth;
    }
    ctx.stroke();

    // Info
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '16px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText(`Ratio 1:${harmonyRatio} | Interference Pattern`, width / 2, height - 80);
}

// --- EDUCATION / TOOLTIP SYSTEM ---
const eduData = {
    // Waveforms
    'sine': {
        title: "Sine Wave (Pure Tone)",
        desc: "The fundamental building block of sound. Smooth, clean, and flute-like. It contains only a single frequency with no overtones.",
        math: "Math: y = sin(x)"
    },
    'square': {
        title: "Square Wave",
        desc: "Hollow and woody, like a clarinet or old video game sounds. It contains only ODD harmonics (1, 3, 5...).",
        math: "Math: sgn(sin(x)) · decays as 1/n"
    },
    'sawtooth': {
        title: "Sawtooth Wave",
        desc: "Bright, buzzy, and brassy. It contains ALL integer harmonics (1, 2, 3, 4...) and is great for subtractive synthesis.",
        math: "Math: (x/π) - floor((x/π) + 0.5)"
    },
    'triangle': {
        title: "Triangle Wave",
        desc: "Mellow and soft, like a muted flute. Like square, it has only ODD harmonics, but they fade away much faster.",
        math: "Math: Decays as 1/n² (very smooth)"
    },

    // Intervals (Ratios)
    '1': {
        title: "Unison (1:1)",
        desc: "The exact same note played twice. Perfect blending. Zero 'beating' or interference.",
        math: "Ratio: 1/1 (Frequency f)"
    },
    '2': {
        title: "Octave (2:1)",
        desc: "The same musical pitch class, but higher. Doubling the frequency sounds 'the same' to human ears.",
        math: "Ratio: 2/1 (Frequency 2f)"
    },
    '1.5': {
        title: "Perfect Fifth (3:2)",
        desc: "The most stable harmony after the octave. The basis of the Circle of Fifths and Western tuning.",
        math: "Ratio: 3/2 (Frequency 1.5f)"
    },
    '1.25': {
        title: "Major Third (5:4)",
        desc: "Happy, bright, and consonant. A key part of major chords.",
        math: "Ratio: 5/4 (Frequency 1.25f)"
    },
    '1.0666': {
        title: "Dissonance (Minor Second-ish)",
        desc: "When waves don't line up neatly, they create 'beating' or roughness. This creates tension in music (16:15 ratio).",
        math: "Ratio: 16/15 (Frequency ~1.06f)"
    }
};

const eduPanel = document.getElementById('edu-panel');
const eduTitle = document.getElementById('edu-title');
const eduDesc = document.getElementById('edu-desc');
const eduMath = document.getElementById('edu-math');

function showEdu(key) {
    const data = eduData[key];
    if (!data) return;

    if (eduTitle && eduDesc && eduMath && eduPanel) {
        eduTitle.textContent = data.title;
        eduDesc.textContent = data.desc;
        eduMath.textContent = data.math;

        eduPanel.classList.remove('hidden');
        eduPanel.style.display = 'block';
    }
}

// Bind Events
if (selectType) {
    selectType.addEventListener('change', (e) => showEdu(e.target.value));
    if (selectType.value) showEdu(selectType.value);
}

// Radio Buttons (Intervals) logic
const allRadios = document.querySelectorAll('input[name="ratio"]');
const radioGroup = document.querySelector('.radio-group');

// 1. Hover Handler
allRadios.forEach(r => {
    r.parentElement.addEventListener('mouseenter', () => {
        showEdu(r.value);
    });
    r.addEventListener('click', () => {
        showEdu(r.value);
    });
});

// 2. Revert Handler
if (radioGroup) {
    radioGroup.addEventListener('mouseleave', () => {
        const checked = document.querySelector('input[name="ratio"]:checked');
        if (checked) {
            showEdu(checked.value);
        }
    });
}

// 3. Ensure 'Change' events also update
allRadios.forEach(r => {
    r.addEventListener('change', (e) => {
        if (e.target.checked) showEdu(e.target.value);
    });
});

draw();

// Fallback if already loaded
if (document.readyState === 'complete') {
    initKeyboard();
} else {
    window.addEventListener('load', () => {
        console.log('[Init] Window Loaded');
        initKeyboard();
        if (lessonManager && !lessonManager.overlay) lessonManager.init();
    });
}

// Direct Attempt (in case load already fired or is weird)
setTimeout(() => {
    if (document.getElementById('keyboard-container').children.length === 0) {
        console.log('[Init] Force Init');
        initKeyboard();
    }
}, 500);
