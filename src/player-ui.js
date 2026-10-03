/**
 * RP World Music - In-Chat & Floating Music Player UI
 * Displays track details, real Spotify album art, progress bar, audio controls, and animated visualizer.
 */

import { runtimeState, onStateChange, getSettings } from './state.js';
import { seekTo } from './audio-engine.js';
import { nextTrack, prevTrack, togglePlayPause, setUnifiedVolume } from './commands.js';

let playerElement = null;
let isDraggingSeek = false;

/**
 * Initializes and injects the music player widget into the SillyTavern UI
 */
export function initPlayerUI() {
    if (document.getElementById('rp-music-player')) return;

    const playerHtml = `
    <div id="rp-music-player" class="rp-music-player-container closed">
        <!-- Floating Toggle Pill -->
        <div id="rp-music-toggle-btn" class="rp-music-toggle-pill" title="Toggle RP World Music Player">
            <i class="fa-solid fa-music rp-music-disc-icon"></i>
            <span class="rp-pill-title">RP Music</span>
            <span class="rp-pill-now-playing">No Track</span>
        </div>

        <!-- Full Player Card -->
        <div class="rp-music-card glass-panel">
            <div class="rp-player-header">
                <div class="rp-device-badge">
                    <i id="rp-device-icon" class="fa-solid fa-mobile-screen"></i>
                    <span id="rp-device-name">iPod</span>
                </div>
                <div class="rp-source-badge" id="rp-source-badge" title="Source">
                    <i class="fa-solid fa-wave-square"></i> Local
                </div>
                <div class="rp-header-controls">
                    <button id="rp-btn-minimize" class="rp-icon-btn" title="Minimize"><i class="fa-solid fa-chevron-down"></i></button>
                </div>
            </div>

            <!-- Visual Art / Animated Graphic or Spotify Album Art -->
            <div class="rp-art-container">
                <div id="rp-album-art" class="rp-album-art-wrap">
                    <img id="rp-spotify-art-img" class="rp-spotify-cover" style="display:none;" alt="Album Cover" />
                    <div id="rp-vinyl-graphic" class="rp-vinyl-record">
                        <div class="rp-vinyl-grooves"></div>
                        <div class="rp-vinyl-center">
                            <i id="rp-center-icon" class="fa-solid fa-compact-disc"></i>
                        </div>
                    </div>
                </div>
                <div class="rp-visualizer-bars">
                    <span></span><span></span><span></span><span></span><span></span>
                </div>
            </div>

            <!-- In-Browser Spotify Embed Player Widget -->
            <div id="rp-spotify-embed-box" class="rp-spotify-embed-box" style="display:none;">
                <iframe id="rp-spotify-embed-iframe" src="" width="100%" height="80" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
            </div>


            <!-- Track Info -->
            <div class="rp-track-info">
                <div class="rp-title-row">
                    <div id="rp-track-title" class="rp-track-title" title="Track Title">No Track Selected</div>
                </div>
                <div id="rp-track-artist" class="rp-track-artist">Select or trigger a song in RP</div>
                <div class="rp-action-links">
                    <a id="rp-spotify-open-link" href="#" target="_blank" class="rp-spotify-open-btn" style="display:none;" title="Play full song in Spotify app or web player">
                        <i class="fa-brands fa-spotify"></i> Open in Spotify
                    </a>
                    <a id="rp-yt-open-link" href="#" target="_blank" class="rp-yt-open-btn" style="display:none;" title="Watch full video on YouTube">
                        <i class="fa-brands fa-youtube"></i> Watch on YouTube
                    </a>
                </div>
            </div>

            <!-- Progress & Scrub Bar -->
            <div class="rp-progress-section">
                <div class="rp-progress-bar-wrap">
                    <input type="range" id="rp-seek-slider" min="0" max="100" value="0" step="0.5" class="rp-slider" />
                </div>
                <div class="rp-time-display">
                    <span id="rp-time-current">0:00</span>
                    <span id="rp-time-duration">0:00</span>
                </div>
            </div>

            <!-- Playback Controls -->
            <div class="rp-controls-row">
                <button id="rp-btn-prev" class="rp-ctrl-btn" title="Previous Track">
                    <i class="fa-solid fa-backward-step"></i>
                </button>
                <button id="rp-btn-play" class="rp-ctrl-btn rp-play-btn" title="Play/Pause">
                    <i id="rp-play-icon" class="fa-solid fa-play"></i>
                </button>
                <button id="rp-btn-next" class="rp-ctrl-btn" title="Next Track">
                    <i class="fa-solid fa-forward-step"></i>
                </button>
            </div>

            <!-- Volume Slider & Device Selector -->
            <div class="rp-bottom-bar">
                <div class="rp-volume-box">
                    <i id="rp-vol-icon" class="fa-solid fa-volume-high"></i>
                    <input type="range" id="rp-vol-slider" min="0" max="1" step="0.02" value="0.65" class="rp-slider rp-vol-slider" />
                </div>
                <select id="rp-device-select" class="rp-device-dropdown">
                    <!-- Populated dynamically -->
                </select>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', playerHtml);
    playerElement = document.getElementById('rp-music-player');

    bindEvents();
    populateDeviceSelect();

    // Listen for playback state updates
    onStateChange((state, type) => {
        updateUI(state, type);
    });
}

function bindEvents() {
    const toggleBtn = document.getElementById('rp-music-toggle-btn');
    const minimizeBtn = document.getElementById('rp-btn-minimize');
    const playBtn = document.getElementById('rp-btn-play');
    const prevBtn = document.getElementById('rp-btn-prev');
    const nextBtn = document.getElementById('rp-btn-next');
    const seekSlider = document.getElementById('rp-seek-slider');
    const volSlider = document.getElementById('rp-vol-slider');
    const deviceSelect = document.getElementById('rp-device-select');

    toggleBtn?.addEventListener('click', () => {
        playerElement.classList.toggle('closed');
    });

    minimizeBtn?.addEventListener('click', () => {
        playerElement.classList.add('closed');
    });

    playBtn?.addEventListener('click', () => {
        togglePlayPause();
    });

    prevBtn?.addEventListener('click', () => {
        prevTrack();
    });

    nextBtn?.addEventListener('click', () => {
        nextTrack();
    });

    seekSlider?.addEventListener('input', (e) => {
        isDraggingSeek = true;
        const percent = parseFloat(e.target.value);
        const duration = runtimeState.duration || 180;
        const seekSeconds = (percent / 100) * duration;
        document.getElementById('rp-time-current').textContent = formatTime(seekSeconds);
    });

    seekSlider?.addEventListener('change', (e) => {
        isDraggingSeek = false;
        const percent = parseFloat(e.target.value);
        const duration = runtimeState.duration || 180;
        seekTo((percent / 100) * duration);
    });

    volSlider?.addEventListener('input', (e) => {
        setUnifiedVolume(parseFloat(e.target.value));
    });

    deviceSelect?.addEventListener('change', (e) => {
        runtimeState.currentDevice = e.target.value;
        const settings = getSettings();
        settings.currentDevice = e.target.value;
        updateUI(runtimeState);
    });
}

export function populateDeviceSelect() {
    const select = document.getElementById('rp-device-select');
    if (!select) return;

    const devices = getSettings().devices || {};
    select.innerHTML = '';

    for (const [name, data] of Object.entries(devices)) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = data.name || name;
        if (name === runtimeState.currentDevice) {
            option.selected = true;
        }
        select.appendChild(option);
    }
}

/**
 * Updates UI DOM elements according to player runtime state
 */
export function updateUI(state, type) {
    if (!playerElement) return;

    const song = state.currentSong;
    const isPlaying = state.isPlaying;
    const device = state.currentDevice || 'iPod';
    const settings = getSettings();
    const deviceData = (settings.devices || {})[device] || {};

    // Elements
    const titleEl = document.getElementById('rp-track-title');
    const artistEl = document.getElementById('rp-track-artist');
    const deviceNameEl = document.getElementById('rp-device-name');
    const deviceIconEl = document.getElementById('rp-device-icon');
    const sourceBadgeEl = document.getElementById('rp-source-badge');
    const playIconEl = document.getElementById('rp-play-icon');
    const seekSlider = document.getElementById('rp-seek-slider');
    const timeCurrentEl = document.getElementById('rp-time-current');
    const timeDurationEl = document.getElementById('rp-time-duration');
    const pillNowPlayingEl = playerElement.querySelector('.rp-pill-now-playing');
    const pillDiscIcon = playerElement.querySelector('.rp-music-disc-icon');
    const vinylGraphic = document.getElementById('rp-vinyl-graphic');
    const spotifyImg = document.getElementById('rp-spotify-art-img');

    // Title & Artist
    if (song) {
        titleEl.textContent = song.title;
        artistEl.textContent = song.artist || 'Unknown Artist';
        pillNowPlayingEl.textContent = `${song.title}`;

        // Album Art or Vinyl Graphic
        if (song.albumArt && song.albumArt.trim() !== '') {
            spotifyImg.src = song.albumArt;
            spotifyImg.style.display = 'block';
            vinylGraphic.style.display = 'none';
        } else {
            spotifyImg.style.display = 'none';
            vinylGraphic.style.display = 'block';
        }

        // Source badge indicator
        if (song.isSpotify) {
            sourceBadgeEl.innerHTML = '<i class="fa-brands fa-spotify" style="color:#1db954;"></i> Spotify Connect';
        } else if (song.youtubeId) {
            sourceBadgeEl.innerHTML = '<i class="fa-solid fa-circle-play" style="color:#00e5ff;"></i> Full Song (In-Browser)';
        } else if (song.previewUrl) {
            sourceBadgeEl.innerHTML = '<i class="fa-solid fa-tower-broadcast" style="color:#00e5ff;"></i> Stream Preview';
        } else if (song.url && song.url.trim() !== '') {
            sourceBadgeEl.innerHTML = '<i class="fa-solid fa-file-audio" style="color:#ffd700;"></i> Local Audio';
        } else {
            sourceBadgeEl.innerHTML = '<i class="fa-solid fa-wave-square" style="color:#a855f7;"></i> Ambient Synth';
        }

        // In-Browser Embedded Spotify Widget for Mobile & PC
        const embedBox = document.getElementById('rp-spotify-embed-box');
        const openLink = document.getElementById('rp-spotify-open-link');
        const spotifyId = song.spotifyId || (song.isSpotify ? song.id : null);
        const externalUrl = song.externalUrl || (spotifyId ? `https://open.spotify.com/track/${spotifyId}` : null);

        const ytOpenLink = document.getElementById('rp-yt-open-link');
        if (openLink) {
            if (externalUrl) {
                openLink.href = externalUrl;
                openLink.style.display = 'inline-flex';
            } else {
                openLink.style.display = 'none';
            }
        }

        if (ytOpenLink) {
            if (song.youtubeId) {
                ytOpenLink.href = `https://www.youtube.com/watch?v=${song.youtubeId}`;
                ytOpenLink.style.display = 'inline-flex';
            } else {
                ytOpenLink.style.display = 'none';
            }
        }


        // 2. Spotify Embed Widget
        if (spotifyId && !song.youtubeId) {
            if (embedBox && embedIframe) {
                const targetSrc = `https://open.spotify.com/embed/track/${spotifyId}?utm_source=generator&theme=0`;
                if (!embedIframe.src || !embedIframe.src.includes(spotifyId)) {
                    embedIframe.src = targetSrc;
                }
                embedBox.style.display = 'block';
            }
        } else {
            if (embedBox) embedBox.style.display = 'none';
        }
    } else {
        titleEl.textContent = 'No Track Selected';
        artistEl.textContent = 'Trigger in RP or select a track';
        pillNowPlayingEl.textContent = 'Paused';
        spotifyImg.style.display = 'none';
        vinylGraphic.style.display = 'block';
        sourceBadgeEl.innerHTML = '<i class="fa-solid fa-music"></i> Ready';

        const embedBox = document.getElementById('rp-spotify-embed-box');
        if (embedBox) embedBox.style.display = 'none';
        const openLink = document.getElementById('rp-spotify-open-link');
        if (openLink) openLink.style.display = 'none';
        const ytOpenLink = document.getElementById('rp-yt-open-link');
        if (ytOpenLink) ytOpenLink.style.display = 'none';
    }

    // Device Badge
    deviceNameEl.textContent = deviceData.name || device;
    if (deviceIconEl) {
        deviceIconEl.className = deviceData.icon || 'fa-solid fa-music';
    }

    // Play/Pause State & Animations
    if (isPlaying) {
        playIconEl.className = 'fa-solid fa-pause';
        playerElement.classList.add('is-playing');
        pillDiscIcon?.classList.add('spinning');
        vinylGraphic?.classList.add('spinning');
    } else {
        playIconEl.className = 'fa-solid fa-play';
        playerElement.classList.remove('is-playing');
        pillDiscIcon?.classList.remove('spinning');
        vinylGraphic?.classList.remove('spinning');
    }

    // Time & Progress Slider
    if (!isDraggingSeek) {
        const cur = state.currentTime || 0;
        const dur = state.duration || (song?.duration || 180);
        const percent = dur > 0 ? (cur / dur) * 100 : 0;

        seekSlider.value = percent;
        timeCurrentEl.textContent = formatTime(cur);
        timeDurationEl.textContent = formatTime(dur);
    }
}

/**
 * Posts an in-chat system message or notification card
 */
export function showChatNowPlayingCard(track, deviceName) {
    if (!track) return;
    const settings = getSettings();
    if (!settings.showChatNotifications) return;

    const sourceTag = track.isSpotify ? ' [Spotify]' : '';
    if (typeof toastr !== 'undefined') {
        toastr.info(`🎵 Now Playing: "${track.title}" by ${track.artist || 'Unknown'} on ${deviceName}${sourceTag}`, 'RP World Music', {
            timeOut: 4500,
            progressBar: true
        });
    }
}

function formatTime(seconds) {
    const s = Math.floor(seconds || 0);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
