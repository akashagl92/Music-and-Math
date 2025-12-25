/**
 * SONIC GEOMETRY - MUSIC THEORY ENGINE
 * 
 * A comprehensive music theory library providing:
 * - Scale and chord data with mathematical foundations
 * - Key detection algorithms
 * - Modulation helpers
 * - Interval calculations with frequency ratios
 */

// =============================================================================
// CONSTANTS: NOTE NAMES & FREQUENCIES
// =============================================================================

/**
 * The 12 chromatic notes (using sharps for consistency)
 * Enharmonic equivalents: C# = Db, D# = Eb, F# = Gb, G# = Ab, A# = Bb
 */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Alternative note names (flats) for display purposes
 */
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * A4 = 440 Hz (concert pitch standard)
 * 
 * MATH: In equal temperament, each semitone = frequency * 2^(1/12)
 * This means 12 semitones = 2x frequency (octave)
 * 
 * Formula: f(n) = 440 * 2^((n - 69) / 12)
 * Where n = MIDI note number (A4 = 69)
 */
const A4_FREQUENCY = 440;
const A4_MIDI_NUMBER = 69;

// =============================================================================
// INTERVALS: The Building Blocks
// =============================================================================

/**
 * Musical intervals with their semitone counts and frequency ratios
 * 
 * MATH EXPLANATION:
 * - In Just Intonation, intervals are simple ratios (perfect consonance)
 * - In Equal Temperament, we use 2^(n/12) for n semitones
 * - The "justRatio" is the pure mathematical ratio (Pythagorean/Just)
 * - The "equalRatio" is the tempered approximation used in modern instruments
 */
const INTERVALS = {
    unison: { semitones: 0, justRatio: '1:1', equalRatio: 1.000, name: 'Unison', abbrev: 'P1', quality: 'perfect' },
    minorSecond: { semitones: 1, justRatio: '16:15', equalRatio: 1.059, name: 'Minor 2nd', abbrev: 'm2', quality: 'dissonant' },
    majorSecond: { semitones: 2, justRatio: '9:8', equalRatio: 1.122, name: 'Major 2nd', abbrev: 'M2', quality: 'dissonant' },
    minorThird: { semitones: 3, justRatio: '6:5', equalRatio: 1.189, name: 'Minor 3rd', abbrev: 'm3', quality: 'consonant' },
    majorThird: { semitones: 4, justRatio: '5:4', equalRatio: 1.260, name: 'Major 3rd', abbrev: 'M3', quality: 'consonant' },
    perfectFourth: { semitones: 5, justRatio: '4:3', equalRatio: 1.335, name: 'Perfect 4th', abbrev: 'P4', quality: 'perfect' },
    tritone: { semitones: 6, justRatio: '45:32', equalRatio: 1.414, name: 'Tritone', abbrev: 'TT', quality: 'dissonant' },
    perfectFifth: { semitones: 7, justRatio: '3:2', equalRatio: 1.498, name: 'Perfect 5th', abbrev: 'P5', quality: 'perfect' },
    minorSixth: { semitones: 8, justRatio: '8:5', equalRatio: 1.587, name: 'Minor 6th', abbrev: 'm6', quality: 'consonant' },
    majorSixth: { semitones: 9, justRatio: '5:3', equalRatio: 1.682, name: 'Major 6th', abbrev: 'M6', quality: 'consonant' },
    minorSeventh: { semitones: 10, justRatio: '9:5', equalRatio: 1.782, name: 'Minor 7th', abbrev: 'm7', quality: 'dissonant' },
    majorSeventh: { semitones: 11, justRatio: '15:8', equalRatio: 1.888, name: 'Major 7th', abbrev: 'M7', quality: 'dissonant' },
    octave: { semitones: 12, justRatio: '2:1', equalRatio: 2.000, name: 'Octave', abbrev: 'P8', quality: 'perfect' }
};

// =============================================================================
// SCALES: Patterns of Intervals
// =============================================================================

/**
 * Scale definitions as arrays of semitones from the root
 * 
 * NAMING RATIONALE:
 * - "Major" = bright, happy sound (from Latin "major" = greater)
 * - "Minor" = darker, sadder sound (from Latin "minor" = lesser)
 * - "Dorian", "Phrygian", etc. = Named after ancient Greek modes
 * - "Pentatonic" = 5 notes (Greek "pente" = five)
 * - "Blues" = American origin, includes "blue notes" (flattened 3rd, 5th, 7th)
 */
const SCALES = {
    // Major and Minor
    major: {
        intervals: [0, 2, 4, 5, 7, 9, 11], name: 'Major (Ionian)',
        description: 'The "happy" scale. W-W-H-W-W-W-H pattern.'
    },
    naturalMinor: {
        intervals: [0, 2, 3, 5, 7, 8, 10], name: 'Natural Minor (Aeolian)',
        description: 'The "sad" scale. Relative minor of major.'
    },
    harmonicMinor: {
        intervals: [0, 2, 3, 5, 7, 8, 11], name: 'Harmonic Minor',
        description: 'Minor with raised 7th. Creates V7 chord.'
    },
    melodicMinor: {
        intervals: [0, 2, 3, 5, 7, 9, 11], name: 'Melodic Minor',
        description: 'Minor with raised 6th and 7th (ascending).'
    },

    // Modes (all derived from Major scale starting on different degrees)
    ionian: {
        intervals: [0, 2, 4, 5, 7, 9, 11], name: 'Ionian',
        description: 'Mode I. Same as Major scale.'
    },
    dorian: {
        intervals: [0, 2, 3, 5, 7, 9, 10], name: 'Dorian',
        description: 'Mode II. Minor with raised 6th. Jazz/funk favorite.'
    },
    phrygian: {
        intervals: [0, 1, 3, 5, 7, 8, 10], name: 'Phrygian',
        description: 'Mode III. Spanish/flamenco sound. Flat 2nd.'
    },
    lydian: {
        intervals: [0, 2, 4, 6, 7, 9, 11], name: 'Lydian',
        description: 'Mode IV. Dreamy, ethereal. Raised 4th (#4).'
    },
    mixolydian: {
        intervals: [0, 2, 4, 5, 7, 9, 10], name: 'Mixolydian',
        description: 'Mode V. Dominant sound. Major with flat 7th.'
    },
    aeolian: {
        intervals: [0, 2, 3, 5, 7, 8, 10], name: 'Aeolian',
        description: 'Mode VI. Same as Natural Minor.'
    },
    locrian: {
        intervals: [0, 1, 3, 5, 6, 8, 10], name: 'Locrian',
        description: 'Mode VII. Diminished feel. Rarely used.'
    },

    // Pentatonic (5-note scales)
    majorPentatonic: {
        intervals: [0, 2, 4, 7, 9], name: 'Major Pentatonic',
        description: 'Major without 4th and 7th. Universal "safe" scale.'
    },
    minorPentatonic: {
        intervals: [0, 3, 5, 7, 10], name: 'Minor Pentatonic',
        description: 'Minor without 2nd and 6th. Blues/rock foundation.'
    },

    // Blues
    blues: {
        intervals: [0, 3, 5, 6, 7, 10], name: 'Blues Scale',
        description: 'Minor pentatonic + blue note (flat 5th).'
    },
    majorBlues: {
        intervals: [0, 2, 3, 4, 7, 9], name: 'Major Blues',
        description: 'Major pentatonic + blue note (flat 3rd).'
    },

    // Other useful scales
    chromatic: {
        intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], name: 'Chromatic',
        description: 'All 12 semitones. No "wrong" notes, no "right" ones.'
    },
    wholeNote: {
        intervals: [0, 2, 4, 6, 8, 10], name: 'Whole Tone',
        description: 'All whole steps. Dreamy, ambiguous sound.'
    },
    diminished: {
        intervals: [0, 2, 3, 5, 6, 8, 9, 11], name: 'Diminished (Half-Whole)',
        description: 'Alternating H-W pattern. Tension and mystery.'
    }
};

// =============================================================================
// CHORDS: Stacked Intervals
// =============================================================================

/**
 * Chord definitions as arrays of semitones from root
 * 
 * NAMING RATIONALE:
 * - "Triad" = 3 notes (Greek "trias")
 * - "7th" = adds the 7th scale degree
 * - "sus" = "suspended" - 3rd replaced by 2nd or 4th
 * - "dim" = "diminished" - flattened intervals
 * - "aug" = "augmented" - raised 5th
 * - "add" = added note without replacing another
 */
const CHORD_TYPES = {
    // Triads (3 notes)
    major: {
        intervals: [0, 4, 7], symbol: '', name: 'Major',
        formula: 'R-M3-P5', quality: 'consonant'
    },
    minor: {
        intervals: [0, 3, 7], symbol: 'm', name: 'Minor',
        formula: 'R-m3-P5', quality: 'consonant'
    },
    diminished: {
        intervals: [0, 3, 6], symbol: 'dim', name: 'Diminished',
        formula: 'R-m3-d5', quality: 'dissonant'
    },
    augmented: {
        intervals: [0, 4, 8], symbol: 'aug', name: 'Augmented',
        formula: 'R-M3-A5', quality: 'dissonant'
    },
    sus2: {
        intervals: [0, 2, 7], symbol: 'sus2', name: 'Suspended 2nd',
        formula: 'R-M2-P5', quality: 'open'
    },
    sus4: {
        intervals: [0, 5, 7], symbol: 'sus4', name: 'Suspended 4th',
        formula: 'R-P4-P5', quality: 'open'
    },

    // Seventh Chords (4 notes)
    major7: {
        intervals: [0, 4, 7, 11], symbol: 'maj7', name: 'Major 7th',
        formula: 'R-M3-P5-M7', quality: 'jazzy'
    },
    minor7: {
        intervals: [0, 3, 7, 10], symbol: 'm7', name: 'Minor 7th',
        formula: 'R-m3-P5-m7', quality: 'jazzy'
    },
    dominant7: {
        intervals: [0, 4, 7, 10], symbol: '7', name: 'Dominant 7th',
        formula: 'R-M3-P5-m7', quality: 'tension'
    },
    diminished7: {
        intervals: [0, 3, 6, 9], symbol: 'dim7', name: 'Diminished 7th',
        formula: 'R-m3-d5-d7', quality: 'tension'
    },
    halfDiminished: {
        intervals: [0, 3, 6, 10], symbol: 'm7b5', name: 'Half-Diminished',
        formula: 'R-m3-d5-m7', quality: 'tension'
    },
    minorMajor7: {
        intervals: [0, 3, 7, 11], symbol: 'mMaj7', name: 'Minor-Major 7th',
        formula: 'R-m3-P5-M7', quality: 'exotic'
    },
    augmented7: {
        intervals: [0, 4, 8, 10], symbol: 'aug7', name: 'Augmented 7th',
        formula: 'R-M3-A5-m7', quality: 'exotic'
    },

    // Extended Chords
    add9: {
        intervals: [0, 4, 7, 14], symbol: 'add9', name: 'Add 9',
        formula: 'R-M3-P5-M9', quality: 'bright'
    },
    minor9: {
        intervals: [0, 3, 7, 10, 14], symbol: 'm9', name: 'Minor 9th',
        formula: 'R-m3-P5-m7-M9', quality: 'smooth'
    },
    major9: {
        intervals: [0, 4, 7, 11, 14], symbol: 'maj9', name: 'Major 9th',
        formula: 'R-M3-P5-M7-M9', quality: 'lush'
    }
};

/**
 * Diatonic chord patterns for common scales
 * Each degree of the scale gets a chord quality
 * 
 * Roman numeral notation:
 * - Uppercase = Major
 * - Lowercase = minor
 * - ° = diminished
 * - + = augmented
 */
const DIATONIC_PATTERNS = {
    major: {
        triads: ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'],
        numerals: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
        sevenths: ['major7', 'minor7', 'minor7', 'major7', 'dominant7', 'minor7', 'halfDiminished']
    },
    naturalMinor: {
        triads: ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'],
        numerals: ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'],
        sevenths: ['minor7', 'halfDiminished', 'major7', 'minor7', 'minor7', 'major7', 'dominant7']
    },
    harmonicMinor: {
        triads: ['minor', 'diminished', 'augmented', 'minor', 'major', 'major', 'diminished'],
        numerals: ['i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°'],
        sevenths: ['minorMajor7', 'halfDiminished', 'augmented7', 'minor7', 'dominant7', 'major7', 'diminished7']
    },
    dorian: {
        triads: ['minor', 'minor', 'major', 'major', 'minor', 'diminished', 'major'],
        numerals: ['i', 'ii', 'III', 'IV', 'v', 'vi°', 'VII'],
        sevenths: ['minor7', 'minor7', 'major7', 'dominant7', 'minor7', 'halfDiminished', 'major7']
    }
};

// =============================================================================
// COMMON PROGRESSIONS  
// =============================================================================

/**
 * Popular chord progressions with their names and usage
 * Expressed in scale degrees (1-indexed)
 */
const PROGRESSIONS = {
    // Pop/Rock
    popCanon: {
        degrees: [1, 5, 6, 4], name: 'Pop Canon (I-V-vi-IV)',
        description: 'Most common pop progression ever. "Let It Be", "No Woman No Cry".'
    },
    fifties: {
        degrees: [1, 6, 4, 5], name: 'Fifties (I-vi-IV-V)',
        description: 'Doo-wop/oldies progression. "Stand By Me".'
    },

    // Deep House / EDM (minor key)
    deepHouse1: {
        degrees: [1, 6, 3, 7], name: 'Deep House Classic (i-VI-III-VII)',
        description: 'Haunting, driving progression. Minor key standard.', keyType: 'minor'
    },
    deepHouse2: {
        degrees: [1, 4, 7, 3], name: 'Emotional Deep (i-iv-VII-III)',
        description: 'Melancholic build. Great for breakdowns.', keyType: 'minor'
    },
    deepHouse3: {
        degrees: [1, 4, 6, 5], name: 'Uplifting Minor (i-iv-VI-V)',
        description: 'Minor but hopeful. Perfect for drops.', keyType: 'minor'
    },

    // Jazz
    twoFiveOne: {
        degrees: [2, 5, 1], name: 'ii-V-I',
        description: 'The jazz cadence. Tension → resolution.'
    },

    // Tension/Movement
    andalusian: {
        degrees: [1, 7, 6, 5], name: 'Andalusian Cadence (i-VII-VI-V)',
        description: 'Spanish/dramatic descent. "Hit The Road Jack".', keyType: 'minor'
    },

    // Blues
    blues12: {
        degrees: [1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5], name: '12-Bar Blues',
        description: 'The foundation of blues, rock, and early pop.'
    }
};

// =============================================================================
// MUSIC THEORY ENGINE CLASS
// =============================================================================

class MusicTheoryEngine {
    constructor() {
        this.currentKey = 'C';
        this.currentScale = 'major';
    }

    // =========================================================================
    // NOTE & FREQUENCY UTILITIES
    // =========================================================================

    /**
     * Convert note name to semitone index (0-11)
     * @param {string} note - Note name like 'C', 'C#', 'Db'
     * @returns {number} Semitone index (0 = C)
     */
    noteToIndex(note) {
        // Handle flats by converting to sharps
        const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B' };
        const normalized = flatToSharp[note] || note;
        return NOTE_NAMES.indexOf(normalized);
    }

    /**
     * Convert semitone index to note name
     * @param {number} index - Semitone index (0-11)
     * @param {boolean} useFlats - Use flat names instead of sharps
     * @returns {string} Note name
     */
    indexToNote(index, useFlats = false) {
        const normalized = ((index % 12) + 12) % 12;
        return useFlats ? NOTE_NAMES_FLAT[normalized] : NOTE_NAMES[normalized];
    }

    /**
     * Calculate frequency for a note
     * 
     * MATH: f = 440 * 2^((midiNote - 69) / 12)
     * 
     * @param {string} note - Note name (e.g., 'A')
     * @param {number} octave - Octave number (4 = middle octave)
     * @returns {number} Frequency in Hz
     */
    noteToFrequency(note, octave = 4) {
        const noteIndex = this.noteToIndex(note);
        const midiNote = (octave + 1) * 12 + noteIndex;
        return A4_FREQUENCY * Math.pow(2, (midiNote - A4_MIDI_NUMBER) / 12);
    }

    /**
     * Calculate semitone distance between two notes
     * 
     * HALF-STEP = 1 semitone (frequency * 2^(1/12))
     * WHOLE-STEP = 2 semitones (frequency * 2^(2/12))
     * 
     * @param {string} noteA - First note
     * @param {string} noteB - Second note
     * @returns {object} { semitones, halfSteps, wholeSteps, intervalName }
     */
    getInterval(noteA, noteB) {
        const indexA = this.noteToIndex(noteA);
        const indexB = this.noteToIndex(noteB);
        const semitones = ((indexB - indexA) + 12) % 12;

        // Find matching interval
        const intervalEntry = Object.entries(INTERVALS).find(([_, data]) => data.semitones === semitones);
        const intervalData = intervalEntry ? intervalEntry[1] : null;

        return {
            semitones,
            halfSteps: semitones,
            wholeSteps: semitones / 2,
            frequencyRatio: Math.pow(2, semitones / 12).toFixed(4),
            justRatio: intervalData?.justRatio || 'N/A',
            name: intervalData?.name || `${semitones} semitones`,
            quality: intervalData?.quality || 'unknown'
        };
    }

    // =========================================================================
    // SCALE OPERATIONS
    // =========================================================================

    /**
     * Get all notes in a scale
     * @param {string} root - Root note (e.g., 'A')
     * @param {string} scaleType - Scale type from SCALES
     * @returns {object} { notes, intervals, description }
     */
    getScaleNotes(root, scaleType = 'major') {
        const scale = SCALES[scaleType];
        if (!scale) return null;

        const rootIndex = this.noteToIndex(root);
        const notes = scale.intervals.map(interval =>
            this.indexToNote((rootIndex + interval) % 12)
        );

        return {
            root,
            type: scaleType,
            name: `${root} ${scale.name}`,
            notes,
            intervals: scale.intervals,
            description: scale.description,
            // Include which keys are "in" this scale (for keyboard overlay)
            noteIndices: scale.intervals.map(i => (rootIndex + i) % 12)
        };
    }

    /**
     * Check if a note is in a scale
     * @param {string} note - Note to check
     * @param {string} root - Scale root
     * @param {string} scaleType - Scale type
     * @returns {boolean}
     */
    isNoteInScale(note, root, scaleType) {
        const scale = this.getScaleNotes(root, scaleType);
        return scale?.notes.includes(note) || false;
    }

    /**
     * Get all available scale types
     * @returns {array} Array of { key, name, description }
     */
    getAvailableScales() {
        return Object.entries(SCALES).map(([key, data]) => ({
            key,
            name: data.name,
            description: data.description
        }));
    }

    // =========================================================================
    // CHORD OPERATIONS  
    // =========================================================================

    /**
     * Build a chord from root and type
     * @param {string} root - Chord root note
     * @param {string} chordType - Chord type from CHORD_TYPES
     * @returns {object} Chord data with notes, frequencies, formula
     */
    buildChord(root, chordType = 'major') {
        const chord = CHORD_TYPES[chordType];
        if (!chord) return null;

        const rootIndex = this.noteToIndex(root);
        const notes = chord.intervals.map(interval =>
            this.indexToNote((rootIndex + interval) % 12)
        );

        return {
            root,
            type: chordType,
            name: `${root}${chord.symbol}`,
            fullName: `${root} ${chord.name}`,
            notes,
            intervals: chord.intervals,
            formula: chord.formula,
            quality: chord.quality,
            frequencies: notes.map((n, i) => ({
                note: n,
                octave: 4 + Math.floor((rootIndex + chord.intervals[i]) / 12),
                frequency: this.noteToFrequency(n, 4 + Math.floor((rootIndex + chord.intervals[i]) / 12))
            }))
        };
    }

    /**
     * Get diatonic chords for a key
     * @param {string} root - Key root
     * @param {string} scaleType - Scale type
     * @param {boolean} useSevenths - Include 7th chords
     * @returns {array} Array of chord objects for each scale degree
     */
    getDiatonicChords(root, scaleType = 'major', useSevenths = false) {
        const pattern = DIATONIC_PATTERNS[scaleType];
        if (!pattern) return null;

        const scale = this.getScaleNotes(root, scaleType);
        const chordTypes = useSevenths ? pattern.sevenths : pattern.triads;

        return scale.notes.map((note, i) => ({
            degree: i + 1,
            numeral: pattern.numerals[i],
            root: note,
            chord: this.buildChord(note, chordTypes[i]),
            chordType: chordTypes[i]
        }));
    }

    /**
     * Identify a chord from a set of notes
     * @param {array} notes - Array of note names or { note, freq } objects
     * @returns {object} Identified chord or null
     */
    identifyChord(notes) {
        // Normalize input
        const noteNames = notes.map(n => typeof n === 'string' ? n : n.note);
        const uniqueNotes = [...new Set(noteNames.map(n => this.indexToNote(this.noteToIndex(n))))];

        if (uniqueNotes.length < 2) return null;

        // Try each note as potential root
        for (const potentialRoot of uniqueNotes) {
            const rootIndex = this.noteToIndex(potentialRoot);
            const intervals = uniqueNotes.map(n =>
                ((this.noteToIndex(n) - rootIndex) + 12) % 12
            ).sort((a, b) => a - b);

            // Match against known chord types
            for (const [type, data] of Object.entries(CHORD_TYPES)) {
                const chordIntervals = [...data.intervals].sort((a, b) => a - b);
                if (JSON.stringify(intervals) === JSON.stringify(chordIntervals)) {
                    return {
                        ...this.buildChord(potentialRoot, type),
                        confidence: 1.0
                    };
                }
            }
        }

        // No exact match found
        return {
            notes: uniqueNotes,
            name: 'Unknown',
            confidence: 0
        };
    }

    // =========================================================================
    // KEY DETECTION
    // =========================================================================

    /**
     * Detect probable key from a set of notes
     * Uses a scoring system based on how well notes fit each key
     * 
     * @param {array} notes - Array of note names or frequencies
     * @returns {array} Array of { key, scale, score } sorted by probability
     */
    detectKey(notes) {
        // Normalize to note names
        const noteNames = notes.map(n => {
            if (typeof n === 'string') return n;
            if (typeof n === 'number') return this.frequencyToNote(n);
            return n.note || n;
        }).filter(Boolean);

        const uniqueNotes = [...new Set(noteNames.map(n => this.indexToNote(this.noteToIndex(n))))];

        if (uniqueNotes.length < 2) return [];

        const results = [];

        // Test each possible root and scale combination
        for (const root of NOTE_NAMES) {
            for (const scaleType of ['major', 'naturalMinor', 'dorian', 'mixolydian']) {
                const scale = this.getScaleNotes(root, scaleType);

                // Score: how many played notes are in this scale
                const inScale = uniqueNotes.filter(n => scale.notes.includes(n)).length;
                const outOfScale = uniqueNotes.length - inScale;
                const score = (inScale - outOfScale * 2) / uniqueNotes.length;

                if (score > 0) {
                    results.push({
                        key: `${root} ${scale.name}`,
                        root,
                        scale: scaleType,
                        score: Math.max(0, score),
                        matchedNotes: inScale,
                        totalNotes: uniqueNotes.length
                    });
                }
            }
        }

        // Sort by score descending
        return results.sort((a, b) => b.score - a.score).slice(0, 5);
    }

    /**
     * Convert frequency to nearest note name
     * @param {number} freq - Frequency in Hz
     * @returns {string} Note name
     */
    frequencyToNote(freq) {
        const midiNote = Math.round(12 * Math.log2(freq / A4_FREQUENCY) + A4_MIDI_NUMBER);
        return this.indexToNote(midiNote % 12);
    }

    // =========================================================================
    // MODULATION HELPERS
    // =========================================================================

    /**
     * Find pivot chords between two keys
     * Pivot chords exist in both keys, enabling smooth modulation
     * 
     * @param {string} keyA - First key (e.g., 'C major')
     * @param {string} keyB - Second key (e.g., 'G major')
     * @returns {array} Array of shared chords
     */
    findPivotChords(rootA, scaleA, rootB, scaleB) {
        const chordsA = this.getDiatonicChords(rootA, scaleA);
        const chordsB = this.getDiatonicChords(rootB, scaleB);

        if (!chordsA || !chordsB) return [];

        const pivots = [];

        for (const chordA of chordsA) {
            for (const chordB of chordsB) {
                if (chordA.chord.name === chordB.chord.name) {
                    pivots.push({
                        chord: chordA.chord.name,
                        inKeyA: `${chordA.numeral} of ${rootA} ${scaleA}`,
                        inKeyB: `${chordB.numeral} of ${rootB} ${scaleB}`,
                        suggestion: `Play ${chordA.chord.name}, then move to ${rootB} ${scaleB}`
                    });
                }
            }
        }

        return pivots;
    }

    /**
     * Suggest modulation path between keys
     * @param {string} fromRoot - Starting key root
     * @param {string} fromScale - Starting scale type  
     * @param {string} toRoot - Target key root
     * @param {string} toScale - Target scale type
     * @returns {object} Modulation suggestions
     */
    suggestModulation(fromRoot, fromScale, toRoot, toScale) {
        const pivots = this.findPivotChords(fromRoot, fromScale, toRoot, toScale);
        const fromIndex = this.noteToIndex(fromRoot);
        const toIndex = this.noteToIndex(toRoot);
        const distance = ((toIndex - fromIndex) + 12) % 12;

        return {
            fromKey: `${fromRoot} ${SCALES[fromScale]?.name || fromScale}`,
            toKey: `${toRoot} ${SCALES[toScale]?.name || toScale}`,
            semitoneDistance: distance,
            relationship: this.getKeyRelationship(distance, fromScale, toScale),
            pivotChords: pivots.slice(0, 3),
            techniques: this.getModulationTechniques(distance)
        };
    }

    /**
     * Describe relationship between two keys
     */
    getKeyRelationship(semitones, fromScale, toScale) {
        if (semitones === 0 && fromScale !== toScale) return 'Parallel (same root, different mode)';
        if (semitones === 7 || semitones === 5) return 'Dominant/Subdominant relationship';
        if (semitones === 3 || semitones === 9) return 'Relative Major/Minor';
        if (semitones === 2 || semitones === 10) return 'Whole step away';
        if (semitones === 1 || semitones === 11) return 'Half step away (dramatic!)';
        return `${semitones} semitones apart`;
    }

    /**
     * Suggest modulation techniques based on interval
     */
    getModulationTechniques(semitones) {
        const techniques = [
            'Use a pivot chord shared by both keys',
            'Use a ii-V-I in the new key'
        ];

        if (semitones === 1 || semitones === 11) {
            techniques.push('Direct modulation (bold key change)');
            techniques.push('Chromatic bass line leading to new key');
        }
        if (semitones === 7) {
            techniques.push('Tonicize V (make V feel like temporary I)');
            techniques.push('Use V/V (secondary dominant)');
        }
        if (semitones === 5) {
            techniques.push('Plagal cadence to new key');
        }

        return techniques;
    }

    // =========================================================================
    // PROGRESSION HELPERS
    // =========================================================================

    /**
     * Get a progression template
     * @param {string} progressionKey - Key from PROGRESSIONS
     * @returns {object} Progression data
     */
    getProgression(progressionKey) {
        return PROGRESSIONS[progressionKey] || null;
    }

    /**
     * Build a chord progression in a specific key
     * @param {string} progressionKey - Progression name
     * @param {string} root - Key root
     * @param {string} scaleType - Scale type
     * @returns {array} Array of chord objects
     */
    buildProgression(progressionKey, root, scaleType = 'major') {
        const progression = PROGRESSIONS[progressionKey];
        if (!progression) return null;

        const diatonic = this.getDiatonicChords(root, scaleType);
        if (!diatonic) return null;

        return progression.degrees.map((degree, index) => ({
            position: index + 1,
            degree,
            ...diatonic[degree - 1]
        }));
    }

    /**
     * Get all available progressions
     */
    getAvailableProgressions() {
        return Object.entries(PROGRESSIONS).map(([key, data]) => ({
            key,
            name: data.name,
            description: data.description,
            keyType: data.keyType || 'major'
        }));
    }
}

// =============================================================================
// EXPORT
// =============================================================================

// Make available globally for browser
if (typeof window !== 'undefined') {
    window.MusicTheoryEngine = MusicTheoryEngine;
    window.SCALES = SCALES;
    window.CHORD_TYPES = CHORD_TYPES;
    window.INTERVALS = INTERVALS;
    window.PROGRESSIONS = PROGRESSIONS;
    window.NOTE_NAMES = NOTE_NAMES;
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MusicTheoryEngine,
        SCALES,
        CHORD_TYPES,
        INTERVALS,
        PROGRESSIONS,
        NOTE_NAMES
    };
}
