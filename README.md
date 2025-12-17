# Sonic Geometry: Math x Buffer

**Sonic Geometry** is an interactive web-based visualizer that explores the intersection of Music Theory, Physics of Sound, and Mathematics. It uses the Web Audio API and HTML5 Canvas to provide real-time visualizations of sound waves, frequencies, and harmony.

## 🚀 Live Demo
> [Link to live demo if valid, otherwise omit or use generic placeholder]
*(Run locally to experience the full audio engine)*

## ✨ Key Features

### 1. Interactive Visualizations
- **Oscilloscope (Time Domain)**: Visualize the actual shape of sound waves in real-time.
- **Spectrum Analyzer (Frequency Domain)**: See the individual frequencies that make up a sound (FFT).
- **Lissajous Figures (Phase)**: Visualize the relationship between left and right stereo channels (X-Y plot).
- **Interference Patterns**: See how two waves add up (constructive/destructive interference) to create harmony or dissonance.

### 2. Music Theory Lab
- **Circle of Fifths**: Interactive clock-face visualization to navigate musical keys by perfect fifths (3:2 ratio).
- **Harmony Explorer**: Toggle different interval ratios (Unison, Main Third, Perfect Fifth, Octave) to hear and see the math behind consonance and dissonance.
- **Detuning**: Fine-tune frequencies by cents to create "beating" effects.

### 3. Virtual Instruments
- **Continuous Drone**: A persistent background tone (Drone) that sustains indefinitely for meditative or analytical purposes.
- **Polyphonic Keyboard**: A fully functional virtual piano that allows you to play chords and melodies on top of the drone.
- **Dual-Voice Harmony**: When "Theory Lab" is enabled, the keyboard plays both a base note and a harmony note simultaneously based on your selected ratio.

### 4. Guided Lessons
- **Physics of Sound**: Learn about Frequency, Amplitude, and Waveforms.
- **Harmonics**: Understand the Harmonic Series and Overtones.
- Interactive overlays guide you through the concepts with hands-on experiments.

## 🛠️ Tech Stack
- **Core**: Vanilla JavaScript (ES6+)
- **Audio**: Web Audio API (Oscillators, Analysers, Gain Nodes, Stereo Panner)
- **Graphics**: HTML5 Canvas API (2D Context)
- **Styling**: CSS3 (Glassmorphism, Flexbox, Responsive Design)
- **No external frameworks** (React/Vue/Three.js) - Pure native performance.

## 📦 How to Run

1. **Clone the repository**
   ```bash
   git clone https://github.com/akashagl92/Music-and-Math.git
   cd Music-and-Math
   ```

2. **Start a local server**
   Because of CORS policies related to Web Audio/Modules, it's best to run on a local server.

   **Python 3:**
   ```bash
   python3 -m http.server 8081
   # Open http://localhost:8081
   ```

   **Node.js (http-server):**
   ```bash
   npx http-server .
   # Open the address shown
   ```

3. **Explore!**
   Click "Start Audio" and verify your volume is up.

## 🤝 Contributing
Feel free to submit issues and enhancement requests.

## 📝 License
[MIT](LICENSE)
