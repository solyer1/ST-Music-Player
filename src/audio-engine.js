/**
 * RP World Music - Audio Playback Engine
 * Supports local audio files, direct URLs, and Procedural WebAudio ambient synthesis fallback.
 */

import { runtimeState, notifyStateChange, getSettings } from './state.js';

let audioElement = null;
let audioContext = null;
let synthNodes = null;
let synthTimer = null;
let isSynthPlaying = false;

/**
 * Initializes the HTML5 Audio element
 */
export function initAudioEngine() {
    if (audioElement) return;

    audioElement = new Audio();
    audioElement.preload = 'metadata';

    audioElement.addEventListener('play', () => {
        runtimeState.isPlaying = true;
        notifyStateChange('play');
    });

    audioElement.addEventListener('pause', () => {
        if (!isSynthPlaying) {
            runtimeState.isPlaying = false;
            notifyStateChange('pause');
        }
    });

    audioElement.addEventListener('ended', () => {
        runtimeState.isPlaying = false;
        notifyStateChange('ended');
    });

    audioElement.addEventListener('timeupdate', () => {
        if (!isSynthPlaying) {
            runtimeState.currentTime = audioElement.currentTime;
            runtimeState.duration = audioElement.duration || (runtimeState.currentSong?.duration || 180);
            notifyStateChange('timeupdate');
        }
    });

    audioElement.addEventListener('error', (e) => {
        console.warn('[RP-Music] Audio stream error, checking fallback options:', e);
        const currentSong = runtimeState.currentSong;
        if (currentSong?.previewUrl && audioElement.src !== currentSong.previewUrl) {
            console.log('[RP-Music] Falling back to audio preview stream');
            audioElement.src = currentSong.previewUrl;
            audioElement.play().catch(() => {
                if (runtimeState.isPlaying && getSettings().useSynthFallback) {
                    startSynthPlayback(currentSong, runtimeState.currentDevice);
                }
            });
            return;
        }
        if (runtimeState.isPlaying && getSettings().useSynthFallback) {
            startSynthPlayback(runtimeState.currentSong, runtimeState.currentDevice);
        }
    });
}

/**
 * Play a track by object
 */
export async function playTrack(track, deviceName) {
    initAudioEngine();

    runtimeState.currentSong = track;
    if (deviceName) {
        runtimeState.currentDevice = deviceName;
    }
    runtimeState.duration = track.duration || 180;
    runtimeState.currentTime = 0;

    const volume = runtimeState.volume ?? getSettings().defaultVolume ?? 0.65;
    audioElement.volume = Math.max(0, Math.min(1, volume));

    stopSynth();


    // Check if track has a playable URL or public stream preview
    const playableUrl = track.url || track.previewUrl;
    if (playableUrl && playableUrl.trim() !== '') {
        try {
            audioElement.src = playableUrl;
            await audioElement.play();
            runtimeState.isPlaying = true;
            notifyStateChange('play');
            return true;
        } catch (err) {
            console.warn('[RP-Music] Failed to play audio URL/preview, using procedural ambient synth:', err);
        }
    }

    // Fallback: Procedural WebAudio ambient generative synthesizer
    if (getSettings().useSynthFallback !== false) {
        startSynthPlayback(track, deviceName || runtimeState.currentDevice);
        return true;
    }

    return false;
}

/**
 * Pause playback
 */
export function pauseTrack() {
    if (isSynthPlaying) {
        stopSynth();
    }
    if (audioElement) {
        audioElement.pause();
    }
    runtimeState.isPlaying = false;
    notifyStateChange('pause');
}

/**
 * Resume current playback
 */
export function resumeTrack() {
    if (!runtimeState.currentSong) return;

    if (audioElement && audioElement.src && !isSynthPlaying) {
        audioElement.play().catch(() => {
            startSynthPlayback(runtimeState.currentSong, runtimeState.currentDevice);
        });
    } else {
        startSynthPlayback(runtimeState.currentSong, runtimeState.currentDevice);
    }
    runtimeState.isPlaying = true;
    notifyStateChange('play');
}

/**
 * Stop playback completely
 */
export function stopTrack() {
    if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
    }
    stopSynth();
    runtimeState.isPlaying = false;
    runtimeState.currentTime = 0;
    notifyStateChange('stop');
}

/**
 * Set playback volume (0 to 1)
 */
export function setVolume(vol) {
    const clamped = Math.max(0, Math.min(1, vol));
    runtimeState.volume = clamped;

    if (audioElement) {
        audioElement.volume = clamped;
    }
    if (synthNodes && synthNodes.masterGain) {
        synthNodes.masterGain.gain.setTargetAtTime(clamped * 0.25, audioContext.currentTime, 0.05);
    }
    notifyStateChange('volume');
}

/**
 * Seek to a specific second
 */
export function seekTo(seconds) {
    if (audioElement && audioElement.duration && !isSynthPlaying) {
        audioElement.currentTime = seconds;
        runtimeState.currentTime = seconds;
    } else {
        runtimeState.currentTime = seconds;
    }
    notifyStateChange('timeupdate');
}

/* ========================================================================= */
/*  Procedural Ambient WebAudio Synthesizer Engine (Zero-Asset Immersion)     */
/* ========================================================================= */

function getAudioContext() {
    if (!audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioCtx();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

/**
 * Generates continuous generative ambient chord progressions matching device / mood
 */
function startSynthPlayback(track, deviceName) {
    const ctx = getAudioContext();
    stopSynth();

    isSynthPlaying = true;
    runtimeState.isPlaying = true;

    // Master gain
    const masterGain = ctx.createGain();
    const vol = runtimeState.volume ?? 0.65;
    masterGain.gain.setValueAtTime(vol * 0.22, ctx.currentTime);
    masterGain.connect(ctx.destination);

    // Warm filter for analog aesthetic (Cassette / Vinyl / Radio)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    if (deviceName === 'Cassette' || deviceName === 'Vinyl') {
        filter.frequency.setValueAtTime(2200, ctx.currentTime);
        filter.Q.setValueAtTime(1.5, ctx.currentTime);
    } else if (deviceName === 'Radio') {
        filter.frequency.setValueAtTime(3200, ctx.currentTime);
        filter.Q.setValueAtTime(2.0, ctx.currentTime);
    } else {
        // iPod / Speaker - clean & lush
        filter.frequency.setValueAtTime(5500, ctx.currentTime);
        filter.Q.setValueAtTime(0.8, ctx.currentTime);
    }
    filter.connect(masterGain);

    synthNodes = {
        masterGain,
        filter,
        oscillators: []
    };

    // Harmonic chord progressions (frequencies in Hz)
    const chordProgressions = [
        [220.00, 261.63, 329.63, 392.00], // Am7
        [174.61, 220.00, 261.63, 329.63], // Fmaj7
        [196.00, 246.94, 293.66, 392.00], // G
        [164.81, 196.00, 246.94, 293.66], // Em7
    ];

    let chordIndex = 0;

    const playChord = () => {
        if (!isSynthPlaying) return;

        const chord = chordProgressions[chordIndex % chordProgressions.length];
        chordIndex++;

        chord.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            // Blend sine and soft triangle
            osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
            // Slight detune for rich lush chorus effect
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            osc.detune.setValueAtTime((Math.random() - 0.5) * 8, ctx.currentTime);

            // Gentle slow attack and gentle release
            const now = ctx.currentTime;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.18 / (idx + 1), now + 1.8);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 5.8);

            osc.connect(gain);
            gain.connect(filter);

            osc.start(now);
            osc.stop(now + 6.0);
        });

        // Advance simulated time
        runtimeState.currentTime = (runtimeState.currentTime + 5) % (runtimeState.duration || 180);
        notifyStateChange('timeupdate');
    };

    playChord();
    synthTimer = setInterval(playChord, 5000);
    notifyStateChange('play');
}

function stopSynth() {
    isSynthPlaying = false;
    if (synthTimer) {
        clearInterval(synthTimer);
        synthTimer = null;
    }
    if (synthNodes && synthNodes.masterGain) {
        try {
            synthNodes.masterGain.gain.setValueAtTime(0, audioContext.currentTime);
        } catch (_) {}
        synthNodes = null;
    }
}
