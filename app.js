const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');
let width, height;

// --- AUDIO ENGINE CLASS ---
// --- CHORD ANALYZER ---
class ChordAnalyzer {
    constructor() {
        this.intervals = {
            3: 'Minor Third',
            4: 'Major Third',
            5: 'Perfect Fourth',
            7: 'Perfect Fifth',
            12: 'Octave'
        };
        this.chords = {
            '0-4-7': 'Major Triad',
            '0-3-7': 'Minor Triad',
            '0-4-7-11': 'Major 7th',
            '0-3-7-10': 'Minor 7th',
            '0-4-7-10': 'Dominant 7th',
            '0-3-6': 'Diminished',
            '0-4-8': 'Augmented'
        };
    }

    identify(activeNotes) {
        if (activeNotes.length < 2) return null;

        // Sort frequencies low to high
        const sorted = activeNotes.sort((a, b) => a.freq - b.freq);
        const root = sorted[0];

        // Calculate semitone intervals from root
        const semitones = sorted.map(note => {
            const ratio = note.freq / root.freq;
            // f2 = f1 * 2^(st/12) => st = 12 * log2(ratio)
            return Math.round(12 * Math.log2(ratio));
        });

        // Key String for Check (remove duplicates)
        const uniqueSemitones = [...new Set(semitones)];
        const key = uniqueSemitones.join('-');

        // Match Chord
        let chordName = this.chords[key];

        // If 2 notes, check intervals
        if (!chordName && uniqueSemitones.length === 2) {
            const interval = uniqueSemitones[1]; // [0, 7] -> 7
            chordName = this.intervals[interval] || 'Interval';
        }

        // Calculate Ratios for Math foundation
        const ratios = sorted.map(note => {
            const r = note.freq / root.freq;
            return r.toFixed(2);
        });

        // Determine Stability (Consonance)
        // Simple heuristic: Perfect 5th (3:2) and Maj 3rd (5:4) are consonant. 
        // Tritone (6 semitones) is dissonant.
        // Seconds (1, 2) and Sevenths (10, 11) are dissonant.
        let stability = 'Consonant';
        if (uniqueSemitones.some(s => [1, 2, 6, 10, 11].includes(s % 12))) {
            stability = 'Dissonant';
        }

        return {
            root: root.note,
            chordName: chordName || 'Unknown',
            semitones: uniqueSemitones,
            ratios: ratios,
            stability: stability
        };
    }
}

const analyzer = new ChordAnalyzer();
const analysisPanel = document.getElementById('analysis-panel'); // We need to add this to HTML

// --- AUDIO ENGINE CLASS ---
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.masterAnalyser = null; // New Mono/Mix Analyser
        this.analyserL = null; // Left Channel
        this.analyserR = null; // Right Channel
        this.voices = {};
        this.droneVoice = null; // Separate drone
        this.polyphonyLimit = 16;
    }

    getActiveNotes() {
        const notes = [];

        // 1. Drone
        if (this.droneVoice && this.droneVoice.osc) {
            notes.push({ freq: this.droneVoice.osc.frequency.value, note: 'Drone' });
        }

        // 2. Transients (Keys + MIDI)
        // Every voice in `this.voices` is now included
        Object.keys(this.voices).forEach(key => {
            const v = this.voices[key];
            const f = v.osc.frequency.value;
            // Provide a note label for the analyzer if we have it
            notes.push({ freq: f, note: key.includes('_') ? key.split('_')[0] : 'Note' });
        });

        return notes;
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

// --- SMART KEYBOARD GENERATOR ---
function generateKeyboard(startOctave, endOctave) {
    const keys = [];
    // Use Common/Jazz convention (Flats for 3, 6, 7 degrees typically, but here purely generic mixed)
    // Matches Ear Trainer: C# (Db), Eb (D#), F# (Gb), Ab (G#), Bb (A#)
    const notes = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

    // MIDI Note 69 = A4 = 440Hz
    // C4 = 60
    const startMidi = (startOctave + 1) * 12;
    const endMidi = (endOctave + 1) * 12;

    for (let m = startMidi; m <= endMidi; m++) {
        const noteIndex = m % 12;
        const octave = Math.floor(m / 12) - 1;
        const noteName = notes[noteIndex];

        // Frequency Formula
        const freq = 440 * Math.pow(2, (m - 69) / 12);

        // Color (Black if not in C Major scale natural notes)
        const isBlack = !['C', 'D', 'E', 'F', 'G', 'A', 'B'].includes(noteName);

        // Keyboard mapping
        let keyChar = '';

        // Octave 3 (C3-B3) - Home Row (Standard)
        if (octave === 3) {
            const map = {
                'C': 'a', 'C#': 'w', 'D': 's', 'Eb': 'e', 'E': 'd',
                'F': 'f', 'F#': 't', 'G': 'g', 'Ab': 'y', 'A': 'h',
                'Bb': 'u', 'B': 'j'
            };
            keyChar = map[noteName] || '';
        }

        // Octave 4 (C4-B4) - Upper Home Row & Top Row parts
        // Continuing from J: K, O, L, P, ;, '
        if (octave === 4) {
            const map = {
                'C': 'k', 'C#': 'o', 'D': 'l', 'Eb': 'p', 'E': ';',
                'F': '\'', 'F#': ']', 'G': '7', 'Ab': '8', 'A': '9',
                'Bb': '0', 'B': '-'
            };
            keyChar = map[noteName] || '';
        }

        // Octave 2 (C2-B2) - Bottom Row (White keys only for now to avoid conflict)
        if (octave === 2) {
            // Z X C V B N M , . /
            if (noteName === 'C') keyChar = 'z';
            if (noteName === 'D') keyChar = 'x';
            if (noteName === 'E') keyChar = 'c';
            if (noteName === 'F') keyChar = 'v';
            if (noteName === 'G') keyChar = 'b';
            if (noteName === 'A') keyChar = 'n';
            if (noteName === 'B') keyChar = 'm';
        }

        keys.push({
            note: `${noteName}${octave}`,
            freq: freq,
            key: keyChar,
            color: isBlack ? 'black' : 'white',
            midi: m
        });
    }
    return keys;
}

// Generate C3 to C5 (2 Octaves) - Matches standard 25-key controller
const pianoKeys = generateKeyboard(3, 5);

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

// =============================================================================
// SONIC GEOMETRY 2.0 - MODE SYSTEM & THEORY INTEGRATION
// =============================================================================

// --- MODE SYSTEM ---
const MODES = {
    THEORY: 'theory',
    PRACTICE: 'practice',
    PRODUCTION: 'production'
};
let currentAppMode = MODES.THEORY;

// Theory Engine Instance
const theoryEngine = new MusicTheoryEngine();

// Current Key/Scale State
let currentKeyRoot = 'A';
let currentScaleType = 'naturalMinor';

// --- UI ELEMENTS ---
const modeButtons = document.querySelectorAll('.mode-btn');
const keyRootSelect = document.getElementById('key-root');
const scaleTypeSelect = document.getElementById('scale-type');
const scaleNotesDisplay = document.getElementById('scale-notes');
const diatonicChordsContainer = document.getElementById('diatonic-chords');
const keyDetectionPanel = document.getElementById('key-detection-panel');
const detectedKeyDisplay = document.getElementById('detected-key');
const diatonicPanel = document.getElementById('diatonic-panel');

// --- MODE SWITCHING ---
function setMode(mode) {
    currentAppMode = mode;

    // Update button states
    modeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Show/hide mode-specific panels
    if (keyDetectionPanel) {
        keyDetectionPanel.classList.toggle('hidden', mode !== MODES.PRODUCTION);
    }

    // Update UI based on mode
    updateKeyDisplay();
    updateDiatonicChords();
    updateKeyboardOverlay();

    console.log(`[Mode] Switched to ${mode}`);
}

// Mode button click handlers
modeButtons.forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

// --- KEY/SCALE SELECTION ---
function updateKeyDisplay() {
    const scale = theoryEngine.getScaleNotes(currentKeyRoot, currentScaleType);
    if (scale && scaleNotesDisplay) {
        scaleNotesDisplay.textContent = scale.notes.join(' ');
    }
}

function updateDiatonicChords() {
    if (!diatonicChordsContainer) return;

    const diatonic = theoryEngine.getDiatonicChords(currentKeyRoot, currentScaleType);
    if (!diatonic) {
        diatonicChordsContainer.innerHTML = '<small>Not available for this scale</small>';
        return;
    }

    diatonicChordsContainer.innerHTML = '';
    diatonic.forEach(item => {
        const chip = document.createElement('div');
        chip.className = 'chord-chip';
        chip.innerHTML = `
            <span class="numeral">${item.numeral}</span>
            <span class="name">${item.chord.name}</span>
        `;

        // Detailed tooltip with chord info
        const notes = item.chord.notes.join(' - ');
        const formula = item.chord.formula || '';
        chip.title = `${item.chord.fullName}\nNotes: ${notes}\nFormula: ${formula}\nClick to play`;

        // Highlight keyboard keys on hover
        chip.addEventListener('mouseenter', () => {
            highlightChordKeys(item.chord.notes, true);
            chip.classList.add('active');
        });

        chip.addEventListener('mouseleave', () => {
            highlightChordKeys(item.chord.notes, false);
            chip.classList.remove('active');
        });

        // Click to play chord AND keep keys highlighted briefly
        chip.addEventListener('click', () => {
            playDiatonicChord(item);
            highlightChordKeys(item.chord.notes, true);
            setTimeout(() => highlightChordKeys(item.chord.notes, false), 1000);
        });

        diatonicChordsContainer.appendChild(chip);
    });
}

// Helper to highlight/unhighlight keyboard keys for a chord
function highlightChordKeys(noteNames, highlight) {
    const keys = document.querySelectorAll('.key');
    keys.forEach(key => {
        const keyNote = key.dataset.note;
        if (!keyNote) return;

        // Extract note name without octave (e.g., "C3" -> "C")
        const noteOnly = keyNote.replace(/\d+/g, '');

        if (noteNames.includes(noteOnly)) {
            if (highlight) {
                key.classList.add('chord-highlight');
            } else {
                key.classList.remove('chord-highlight');
            }
        }
    });
}

function playDiatonicChord(item) {
    if (!engine || !engine.ctx) {
        engine.init();
        isAudioActive = true;
        btnToggle.textContent = 'Stop Audio';
        btnToggle.classList.add('active');
    }

    // Play each note of the chord
    item.chord.frequencies.forEach((f, i) => {
        setTimeout(() => {
            engine.playNote(f.frequency, oscType, 0, `chord_${item.root}_${i}`);
        }, i * 50); // Slight arpeggio effect
    });

    // Stop after 1 second
    setTimeout(() => {
        item.chord.frequencies.forEach((f, i) => {
            engine.stopNote(`chord_${item.root}_${i}`);
        });
    }, 1000);
}

function updateKeyboardOverlay() {
    const scale = theoryEngine.getScaleNotes(currentKeyRoot, currentScaleType);
    if (!scale) return;

    const keys = document.querySelectorAll('.key');
    keys.forEach(key => {
        const noteName = key.dataset.note;
        if (!noteName) return;

        // Extract just the note without octave (e.g., "C3" -> "C")
        const noteOnly = noteName.replace(/\d+/g, '');

        // Check if note is in scale
        const inScale = scale.notes.includes(noteOnly);
        const isRoot = noteOnly === currentKeyRoot;

        // Apply CSS classes
        key.classList.toggle('in-scale', inScale);
        key.classList.toggle('out-of-scale', !inScale);
        key.classList.toggle('scale-root', isRoot);
    });
}

// Key/Scale change handlers
if (keyRootSelect) {
    keyRootSelect.addEventListener('change', (e) => {
        currentKeyRoot = e.target.value;
        updateKeyDisplay();
        updateDiatonicChords();
        updateKeyboardOverlay();
    });
}

if (scaleTypeSelect) {
    scaleTypeSelect.addEventListener('change', (e) => {
        currentScaleType = e.target.value;
        updateKeyDisplay();
        updateDiatonicChords();
        updateKeyboardOverlay();
    });
}

// --- KEY DETECTION (Production Mode) ---
let recentlyPlayedNotes = [];
const KEY_DETECTION_WINDOW = 5000; // 5 seconds

function addNoteForKeyDetection(note) {
    recentlyPlayedNotes.push({ note, time: Date.now() });

    // Remove old notes
    const cutoff = Date.now() - KEY_DETECTION_WINDOW;
    recentlyPlayedNotes = recentlyPlayedNotes.filter(n => n.time > cutoff);

    // Only run detection in production mode
    if (currentAppMode === MODES.PRODUCTION && recentlyPlayedNotes.length >= 3) {
        const notes = recentlyPlayedNotes.map(n => n.note);
        const detected = theoryEngine.detectKey(notes);

        if (detected.length > 0 && detectedKeyDisplay) {
            detectedKeyDisplay.textContent = detected[0].key;
            detectedKeyDisplay.title = `Confidence: ${Math.round(detected[0].score * 100)}%`;
        }
    }
}

// --- INITIALIZE ON LOAD ---
function initTheoryUI() {
    updateKeyDisplay();
    updateDiatonicChords();

    // Apply scale overlay after keyboard is rendered
    setTimeout(updateKeyboardOverlay, 100);

    console.log('[Theory] UI Initialized');
}

// Call after keyboard is ready (will be called from startApp)

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
        btnToggle.classList.remove('active');
        isAudioActive = false;
    } else {
        btnToggle.textContent = 'Stop Audio';
        btnToggle.classList.add('active');
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

// Theory Toggle (Legacy - now handled by mode system)
if (toggleTheory) {
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
}

selectType.addEventListener('change', (e) => {
    oscType = e.target.value;
    if (isAudioActive) updateAudioState();
});

rangeFreq.addEventListener('input', (e) => {
    frequency = parseInt(e.target.value);
    spanFreq.textContent = frequency;
    if (isAudioActive) updateAudioState();
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
// --- KEYBOARD LOGIC (Refactored) ---
function initKeyboard() {
    console.log('[Init] Initializing Virtual Keyboard...');
    const kbContainer = document.getElementById('keyboard-container');
    if (!kbContainer) {
        console.error('[Init] Keyboard container not found!');
        return;
    }

    // Clear previous keys
    kbContainer.innerHTML = '';

    pianoKeys.forEach(k => {
        const keyEl = document.createElement('div');
        keyEl.classList.add('key', k.color);
        keyEl.dataset.note = k.note;

        // Label
        const label = document.createElement('span');
        const keyCharDisplay = k.key ? `\n(${k.key.toUpperCase()})` : '';
        label.innerText = k.note + keyCharDisplay;
        keyEl.appendChild(label);

        // Individual Key Logic (Mouse/Touch)
        const startKey = () => {
            // Auto-init audio on first key press
            if (!isAudioActive) {
                engine.init();
                isAudioActive = true;
                btnToggle.textContent = 'Stop Audio';
                btnToggle.classList.add('active');
            }
            // Resume Audio if suspended
            if (engine.ctx && engine.ctx.state === 'suspended') engine.ctx.resume();

            if (theoryEnabled) {
                const detuneMultiplier = Math.pow(2, detuneCents / 1200);
                engine.playNote(k.freq, oscType, -0.5, `${k.note}_base`);
                engine.playNote(k.freq * harmonyRatio * detuneMultiplier, oscType, 0.5, `${k.note}_harm`);
            } else {
                engine.playNote(k.freq, oscType, 0, `${k.note}_base`);
            }
            keyEl.classList.add('active');
        };
        const stopKey = () => {
            engine.stopNote(`${k.note}_base`);
            if (theoryEnabled) engine.stopNote(`${k.note}_harm`);
            keyEl.classList.remove('active');
        };

        keyEl.addEventListener('mousedown', (e) => { e.preventDefault(); startKey(); });
        keyEl.addEventListener('mouseup', stopKey);
        keyEl.addEventListener('mouseleave', stopKey);
        keyEl.addEventListener('touchstart', (e) => { e.preventDefault(); startKey(); });
        keyEl.addEventListener('touchend', (e) => { e.preventDefault(); stopKey(); });

        kbContainer.appendChild(keyEl);
    });

    console.log('[Init] Keyboard keys rendered.');
}

// BIND GLOBAL KEYS (Run Once)
// We rely on 'keydown' / 'keyup' only being bound HERE to avoid duplicates if initKeyboard runs again.
document.addEventListener('keydown', (e) => {
    if (e.repeat) return;

    const map = pianoKeys.find(k => k.key === e.key.toLowerCase());
    if (map) {
        // Auto-init audio on first key press
        if (!isAudioActive) {
            engine.init();
            isAudioActive = true;
            btnToggle.textContent = 'Stop Audio';
            btnToggle.classList.add('active');
        }
        if (engine && engine.ctx && engine.ctx.state === 'suspended') engine.ctx.resume();

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

document.addEventListener('keyup', (e) => {
    const map = pianoKeys.find(k => k.key === e.key.toLowerCase());
    if (map) {
        engine.stopNote(`${map.note}_base`);
        engine.stopNote(`${map.note}_harm`);
        const el = document.querySelector(`.key[data-note="${map.note}"]`);
        if (el) el.classList.remove('active');
    }
});

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
let isVisualizerFrozen = false;
let animationFrameId = null;

function freezeVisualizer() {
    isVisualizerFrozen = true;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
}

function resumeVisualizer() {
    if (!isVisualizerFrozen) return; // Already running, don't start duplicate loop
    isVisualizerFrozen = false;
    draw();
}

let lastAnalysisTime = 0;

function draw(timestamp) {
    if (!isVisualizerFrozen) {
        animationFrameId = requestAnimationFrame(draw);
    }

    // --- HARMONY ANALYSIS (Throttled to ~10fps) ---
    if (timestamp - lastAnalysisTime > 100) {
        lastAnalysisTime = timestamp;

        const activeNotes = engine.getActiveNotes();

        const panel = document.getElementById('analysis-panel');
        const nameEl = document.getElementById('chord-name');
        const ratioEl = document.getElementById('chord-ratios');
        const stabEl = document.getElementById('chord-stability');

        if (panel && nameEl && ratioEl && stabEl) {
            if (activeNotes.length >= 2) {
                const result = analyzer.identify(activeNotes);
                console.log('[Chord] Detected:', result ? result.chordName : 'null', 'Notes:', activeNotes.length);
                if (result) {
                    panel.style.display = 'block';
                    nameEl.textContent = result.chordName;
                    const ratioStr = result.ratios.join(' : ');
                    ratioEl.textContent = ratioStr;
                    stabEl.textContent = result.stability;
                    stabEl.className = result.stability === 'Consonant' ? 'tag-consonant' : 'tag-dissonant';
                }
            } else {
                panel.style.display = 'none';
            }
        } else {
            console.warn('[Chord] Panel elements not found:', !!panel, !!nameEl, !!ratioEl, !!stabEl);
        }
    }

    // Always clear/fill background
    ctx.fillStyle = 'rgba(5, 5, 5, 0.2)';
    ctx.fillRect(0, 0, width, height);

    // Safety: If engine not ready, show STATUS TEXT
    if (!engine || !engine.ctx || !engine.masterAnalyser) {
        ctx.fillStyle = 'white';
        ctx.font = '20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText("Click 'START AUDIO' to begin", width / 2, height / 2);
        return;
    }

    // Debug Logging Removed (Clean V53)

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

// --- EAR TRAINER COACH ---
class EarTrainer {
    constructor() {
        this.currentLevel = 0;
        this.score = 0;
        this.currentQuestion = null;
        this.isRevealing = false;

        // UI Refs
        this.overlay = document.getElementById('ear-trainer');
        this.levelMenu = document.getElementById('ear-levels');
        this.gameArea = document.getElementById('ear-game');
        this.optionsGrid = document.getElementById('ear-options');
        this.feedback = document.getElementById('ear-feedback');
        this.scoreEl = document.getElementById('ear-score');
        this.levelTitle = document.getElementById('level-title');
    }

    init() {
        if (!this.overlay) return;
        // Bind UI
        const btnGym = document.getElementById('btn-ear-gym');
        if (btnGym) btnGym.addEventListener('click', () => this.open());

        const close = document.getElementById('close-ear');
        if (close) close.addEventListener('click', () => this.close());

        const btnListen = document.getElementById('btn-listen');
        if (btnListen) btnListen.addEventListener('click', () => this.playQuestion());

        const btnNext = document.getElementById('btn-next-question');
        if (btnNext) btnNext.addEventListener('click', () => this.nextQuestion());
    }

    open() {
        this.overlay.classList.remove('hidden');
        this.showMenu();
    }

    close() {
        this.overlay.classList.add('hidden');
        this.isRevealing = false;
        if (engine) {
            engine.stopNote('ear_1');
            engine.stopNote('ear_2');
        }
        resumeVisualizer(); // FIX: Ensure animation restarts when gym closes
    }

    showMenu() {
        this.levelMenu.classList.remove('hidden');
        this.gameArea.classList.add('hidden');
    }

    startLevel(level) {
        this.currentLevel = level;
        this.score = 0;
        this.scoreEl.textContent = `Score: 0`;
        this.levelMenu.classList.add('hidden');
        this.gameArea.classList.remove('hidden');

        const titles = { 1: 'Stability', 2: 'Intervals', 3: 'Perfect Pitch' };
        this.levelTitle.textContent = `Level ${level}: ${titles[level]}`;

        this.nextQuestion();
    }

    getNoteName(midi) {
        const notes = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        const octave = Math.floor(midi / 12) - 1;
        const note = notes[midi % 12];
        return `${note}${octave}`;
    }

    nextQuestion() {
        this.isRevealing = false;
        resumeVisualizer();
        this.overlay.style.backdropFilter = 'blur(25px)'; // Restore blur
        this.overlay.style.webkitBackdropFilter = 'blur(25px)';

        this.overlay.style.background = 'rgba(0, 0, 0, 0.95)'; // Deep dark
        this.feedback.classList.add('hidden');

        // Restore Modal Size
        const box = this.overlay.querySelector('.ear-box');
        if (box) box.classList.remove('minimized');

        // Hide CTA
        const cta = document.getElementById('ear-cta');
        if (cta) cta.classList.add('hidden');

        // Generate Question
        const rootMidi = 48 + Math.floor(Math.random() * 12); // C3 to B3
        const rootFreq = 440 * Math.pow(2, (rootMidi - 69) / 12);

        let interval = 0;
        let note2Freq = null;
        let correctAnswer, options, explanation;
        let playedNotesText = "";

        // --- LEVEL 1: STABILITY ---
        if (this.currentLevel === 1) {
            const isStable = Math.random() > 0.5;
            const stableIntervals = [7, 4, 12, 0, 5]; // 5th, 3rd, Oct, Unison, 4th
            const tenseIntervals = [1, 2, 6, 11];     // m2, M2, Triton, M7

            // Pick random interval from selected pool
            interval = isStable
                ? stableIntervals[Math.floor(Math.random() * stableIntervals.length)]
                : tenseIntervals[Math.floor(Math.random() * tenseIntervals.length)];

            correctAnswer = isStable ? 'Consonant (Stable)' : 'Dissonant (Tense)';
            options = ['Consonant (Stable)', 'Dissonant (Tense)'];
            explanation = isStable
                ? "Stable intervals blend smoothly. Notice how the waves seem to lock together without 'beating'."
                : "Dissonant intervals clash. You can hear a 'wobble' or beating sound due to the complex frequency ratio.";

            const n1 = this.getNoteName(rootMidi);
            const n2 = this.getNoteName(rootMidi + interval);
            playedNotesText = `${n1} and ${n2}`;
        }
        // --- LEVEL 2: INTERVALS ---
        else if (this.currentLevel === 2) {
            // Define pool of intervals with Etymology/Theory
            const intervalPool = [
                {
                    semitones: 4,
                    name: "Major Third",
                    hint: "Ratio 5:4. Why? The higher note vibrates 5 times for every 4 times the lower note vibrates. This '5-limit' harmony feels sweet and bright."
                },
                {
                    semitones: 7,
                    name: "Perfect Fifth",
                    hint: "Ratio 3:2. Why? It's the simplest ratio after the octave. The waves lock together every 2 cycles of the low note. This physics makes it universally stable."
                },
                {
                    semitones: 12,
                    name: "Octave",
                    hint: "Ratio 2:1. Why? Doubling the frequency creates a wave that aligns perfectly every 1 cycle. To our brain, it registers as the 'same' note, just higher."
                },
                {
                    semitones: 5,
                    name: "Perfect Fourth",
                    hint: "Ratio 4:3. Why? It reverses the Fifth (3:4 inverted). It is mathematically simple but in harmony it creates a slight tension that wants to resolve."
                },
                {
                    semitones: 3,
                    name: "Minor Third",
                    hint: "Ratio 6:5. Why? It aligns every 6 vibrations (vs 5 for Major). This slightly more complex ratio creates the darker, 'sadder' quality of minor chords."
                }
            ];

            // Pick Target
            const target = intervalPool[Math.floor(Math.random() * intervalPool.length)];
            interval = target.semitones;
            correctAnswer = target.name;
            explanation = target.hint;

            // Generate Options (Correct + Random Distractors)
            // Shuffle pool and pick 4
            const shuffled = intervalPool.sort(() => 0.5 - Math.random());
            // Ensure correct answer is in options
            let opts = shuffled.slice(0, 3).map(i => i.name);
            if (!opts.includes(correctAnswer)) opts[0] = correctAnswer;
            opts = opts.sort(); // Consistent order or randomize? Randomize.
            options = opts.sort(() => 0.5 - Math.random());

            const n1 = this.getNoteName(rootMidi);
            const n2 = this.getNoteName(rootMidi + interval);
            playedNotesText = `${n1} and ${n2}`;
        }
        // --- LEVEL 3: PERFECT PITCH ---
        else {
            // Single Note Identification
            const notes = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
            const startNoteIndex = rootMidi % 12; // 0-11
            const noteName = notes[startNoteIndex]; // e.g. "C"

            // Educational Hints for Note Characteristics (Subjective associations)
            const noteHints = {
                'C': "The grounded center. Often feels stable, plain, or 'white'.",
                'C#': "Sharp and piercing. Often associated with brightness or tension.",
                'D': "Warm and resonant. A common key for folk music and violins.",
                'Eb': "Heroic and bold. Often used in brass fanfares (Beethoven's Eroica).",
                'E': "Bright and brilliant. A very common key for guitar music.",
                'F': "Pastoral and calm. Often associated with nature or green fields.",
                'F#': "The Triton! Dividing the octave in half. Tense and electric.",
                'G': "The Dominant. Powerful, solid, and bright.",
                'Ab': "Warm, dark, and velvety. Often used for romance or tragedy.",
                'A': "The Standard (440Hz). Bright and optimistic.",
                'Bb': "The 'Blues' key. Soulful, rich, and commonly used in jazz.",
                'B': "Sharp, piercing, and leading. It wants to resolve up to C."
            };

            interval = 0;
            correctAnswer = noteName;
            explanation = `This is a ${noteName}. ${noteHints[noteName] || "Listen to its unique color."}`;
            playedNotesText = `${noteName} (${this.getNoteName(rootMidi)})`;

            // Options: random note names
            const allOptions = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'F#', 'Bb'];
            // Ensure correct is there
            let opts = [correctAnswer];
            while (opts.length < 4) {
                const r = allOptions[Math.floor(Math.random() * allOptions.length)];
                if (!opts.includes(r)) opts.push(r);
            }
            options = opts.sort();
        }

        note2Freq = rootFreq * Math.pow(2, interval / 12);
        this.currentQuestion = { rootFreq, note2Freq, correctAnswer, options, level: this.currentLevel, explanation, playedNotesText };
        this.renderOptions(options);
        this.playQuestion();
    }

    renderOptions(options) {
        this.optionsGrid.innerHTML = '';
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn-secondary';
            btn.textContent = opt;
            btn.onclick = () => this.checkAnswer(opt, btn);
            this.optionsGrid.appendChild(btn);
        });
    }

    playQuestion() {
        if (!this.currentQuestion) return;
        const { rootFreq, note2Freq, level } = this.currentQuestion;
        engine.init();

        // Stop previous
        engine.stopNote('ear_1');
        engine.stopNote('ear_2');

        // Level 3: Perfect Pitch -> Single Note
        if (level === 3) {
            engine.playNote(rootFreq, 'sine', 0.5, 'ear_1');
        } else {
            // Levels 1 & 2: Intervals -> Two Notes
            engine.playNote(rootFreq, 'sine', -0.5, 'ear_1');
            engine.playNote(note2Freq, 'sine', 0.5, 'ear_2');
        }
    }

    checkAnswer(guess, btn) {
        if (this.isRevealing) return;
        if (guess === this.currentQuestion.correctAnswer) {
            this.score += 10;
            this.scoreEl.textContent = `Score: ${this.score}`;
            btn.style.background = '#4cd137';
            this.feedback.querySelector('h3').textContent = "Correct!";
            this.feedback.querySelector('p').textContent = `That was a ${this.currentQuestion.correctAnswer}.`;
            // Set explanation
            const expEl = document.getElementById('ear-explanation');
            if (expEl && this.currentQuestion.explanation) {
                expEl.textContent = this.currentQuestion.explanation;
            }
            // Set details
            const notesEl = document.getElementById('ear-notes');
            if (notesEl && this.currentQuestion.playedNotesText) {
                notesEl.textContent = `Notes: ${this.currentQuestion.playedNotesText}`;
            }
            this.reveal();
        } else {
            btn.style.background = '#e84118';
        }
    }

    reveal() {
        this.isRevealing = true;
        this.feedback.classList.remove('hidden');
        // Fade out overlay background
        this.overlay.style.background = 'rgba(0, 0, 0, 0.1)';

        // Minimize Modal to show visualization
        const box = this.overlay.querySelector('.ear-box');
        if (box) box.classList.add('minimized');

        // EDUCATIONAL MOMENT: Force Visualization Mode
        // If we are talking about Ratios (Level 2), show the Interference Pattern!
        if (this.currentLevel === 2) {
            if (currentMode !== 'interference') {
                currentMode = 'interference';
                // Update Dropdown UI if it exists
                const modeSelect = document.getElementById('mode-selector');
                if (modeSelect) modeSelect.value = 'interference';
            }
            // Add CTA if not present
            let cta = document.getElementById('ear-cta');
            if (!cta) {
                cta = document.createElement('div');
                cta.id = 'ear-cta';
                cta.style.position = 'absolute';
                cta.style.top = '15%';
                cta.style.width = '100%';
                cta.style.textAlign = 'center';
                cta.style.color = '#00ff88';
                cta.style.fontSize = '1.2rem';
                cta.style.fontWeight = 'bold';
                cta.style.textShadow = '0 2px 4px rgba(0,0,0,0.8)';
                cta.style.pointerEvents = 'none';
                cta.innerHTML = "👁️ Look at the interference pattern in the background!<br><span style='font-size:0.9rem; color: #fff; opacity: 0.8'>The waves lock together based on the ratio.</span>";
                this.overlay.appendChild(cta);
            }
            cta.classList.remove('hidden');
        }

        this.playQuestion();

        // FREEZE FRAME SNAPSHOT
        // Remove Blur for clarity
        this.overlay.style.backdropFilter = 'none';
        this.overlay.style.webkitBackdropFilter = 'none';

        // Wait 500ms for wave to stabilize, then freeze
        setTimeout(() => {
            if (this.isRevealing) freezeVisualizer();
        }, 500);
    }
}

const earTrainer = new EarTrainer();


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

// --- MIDI HANDLER ---
class MIDIHandler {
    constructor() {
        this.midiAccess = null;
        this.isConnected = false;
        this.statusEl = document.getElementById('midi-status');
    }

    init() {
        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then(
                (access) => this.onSuccess(access),
                () => console.warn('MIDI Access Failed')
            );
        }
    }

    onSuccess(midiAccess) {
        this.midiAccess = midiAccess;
        console.log('[MIDI] Access Granted');

        // Listen for new/removed devices
        midiAccess.onstatechange = (e) => {
            console.log(`[MIDI] State Change: ${e.port.name} is ${e.port.state}`);
            this.updateStatus(e);
        };

        // Bind existing devices
        this.bindAllInputs();

        // Initial check for connected devices
        if (midiAccess.inputs.size > 0) {
            this.setConnected(true);
        }
    }

    bindAllInputs() {
        if (!this.midiAccess) return;
        for (let input of this.midiAccess.inputs.values()) {
            input.onmidimessage = (msg) => this.handleMessage(msg);
        }
    }

    updateStatus(e) {
        // Check if any inputs are active
        const hasInputs = Array.from(this.midiAccess.inputs.values()).some(i => i.state === 'connected');
        this.setConnected(hasInputs);
        if (hasInputs) this.bindAllInputs();
    }

    setConnected(connected) {
        this.isConnected = connected;
        if (this.statusEl) {
            if (connected) {
                this.statusEl.classList.remove('hidden');
                this.statusEl.style.display = 'block'; // Ensure visibility
                this.statusEl.style.color = '#00ff88';
                this.statusEl.style.opacity = '1';
                this.statusEl.textContent = '🎹 MIDI Ready';
            } else {
                this.statusEl.classList.add('hidden');
                this.statusEl.style.display = 'none';
            }
        }
    }

    handleMessage(msg) {
        const command = msg.data[0] & 0xF0;
        const note = msg.data[1];
        const velocity = msg.data[2];
        const volume = velocity / 127;

        if (command === 144 && velocity > 0) {
            this.playMidiNote(note, volume);
            this.flashStatus();
        } else if (command === 128 || (command === 144 && velocity === 0)) {
            this.stopMidiNote(note);
        }
    }

    flashStatus() {
        if (this.statusEl) {
            this.statusEl.style.textShadow = "0 0 15px #00ff88";
            this.statusEl.style.transform = "scale(1.1)";
            setTimeout(() => {
                this.statusEl.style.textShadow = "none";
                this.statusEl.style.transform = "scale(1)";
            }, 100);
        }
    }

    playMidiNote(note, volume) {
        const freq = 440 * Math.pow(2, (note - 69) / 12);
        const noteName = this.getNoteName(note);

        if (engine && engine.ctx && engine.ctx.state === 'suspended') {
            engine.ctx.resume();
        }

        if (engine) engine.playNote(freq, oscType, (volume - 0.5) * 0.4, `${noteName}_midi`);
        this.highlightKey(noteName, true);
    }

    stopMidiNote(note) {
        const noteName = this.getNoteName(note);
        if (engine) engine.stopNote(`${noteName}_midi`);
        this.highlightKey(noteName, false);
    }

    getNoteName(midiNote) {
        // MUST match pianoKeys naming (mixed sharps/flats)
        const notes = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        const octave = Math.floor(midiNote / 12) - 1;
        const note = notes[midiNote % 12];
        return `${note}${octave}`;
    }

    highlightKey(noteName, isActive) {
        // Search virtual keys
        const el = document.querySelector(`.key[data-note="${noteName}"]`);
        if (el) {
            if (isActive) el.classList.add('active');
            else el.classList.remove('active');
        }
    }
}

const midiHandler = new MIDIHandler();

let isAppStarted = false;
function startApp() {
    if (isAppStarted) return;
    isAppStarted = true;
    console.log('[Init] Starting App...');
    initKeyboard();
    requestAnimationFrame(draw); // Use rAF to start properly with timestamp
    if (lessonManager && !lessonManager.overlay) lessonManager.init();
    if (earTrainer) earTrainer.init();
    if (midiHandler) midiHandler.init();

    // Initialize Theory UI (Sonic Geometry 2.0)
    initTheoryUI();
}

// Fallback if already loaded
if (document.readyState === 'complete') {
    startApp();
} else {
    window.addEventListener('load', startApp);
}

// Direct Attempt (in case load already fired or is weird)
setTimeout(() => {
    const container = document.getElementById('keyboard-container');
    if (container && container.children.length === 0) {
        console.log('[Init] Force Init');
        initKeyboard();
    }
}, 500);

// GLOBAL AUDIO RESUME UNLOCK
document.addEventListener('click', () => {
    if (engine && engine.ctx && engine.ctx.state === 'suspended') {
        engine.ctx.resume().then(() => {
            console.log('[Audio] Context Resumed by User Interaction');
            engine.isAudioActive = true;
        });
    }
}, { once: false }); // Check on every click just in case
