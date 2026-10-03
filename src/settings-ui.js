/**
 * RP World Music - Settings UI & Playlist Manager (with Spotify Connect Config)
 */

import { MODULE_NAME, DEFAULT_SETTINGS } from './constants.js';
import { getSettings, saveSettings } from './state.js';
import { populateDeviceSelect } from './player-ui.js';
import { initiateSpotifyAuth, disconnectSpotify } from './spotify-service.js';

let activeDeviceTab = 'iPod';

/**
 * Injects the extension settings panel into SillyTavern's Extensions drawer
 */
export function initSettingsUI() {
    const container = document.getElementById('extensions_settings');
    if (!container || document.getElementById('rp_music_settings_wrapper')) return;

    const settings = getSettings();
    const isSpotifyConnected = !!(settings.spotifyEnabled && settings.spotifyAccessToken);

    const html = `
    <div id="rp_music_settings_wrapper" class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b><i class="fa-solid fa-music"></i> RP World Music (Hybrid)</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="display: none;">
            
            <!-- Hybrid Spotify Integration Card -->
            <div class="rp-settings-group rp-spotify-card">
                <div class="rp-spotify-header">
                    <h4><i class="fa-brands fa-spotify" style="color:#1db954;"></i> Spotify Connect (Hybrid Mode)</h4>
                    <span id="rp_spotify_status_badge" class="rp-badge ${isSpotifyConnected ? 'rp-badge-connected' : 'rp-badge-disconnected'}">
                        ${isSpotifyConnected ? '● Connected' : '○ Not Connected'}
                    </span>
                </div>
                <p class="rp-hint">
                    Connect Spotify to automatically search and play real tracks on your Spotify desktop/mobile/web app when you or characters play music in RP!
                </p>
                <div class="rp-setting-item">
                    <label>Spotify Developer Client ID:</label>
                    <div class="rp-input-btn-row">
                        <input type="text" id="rp_spotify_client_id" placeholder="Paste Spotify Client ID here" value="${settings.spotifyClientId || localStorage.getItem('rp_music_spotify_client_id') || ''}" class="text_pole" />
                        <button id="rp_btn_spotify_connect" class="menu_button ${isSpotifyConnected ? 'menu_button_danger' : 'menu_button_success'}">
                            ${isSpotifyConnected ? '<i class="fa-solid fa-link-slash"></i> Disconnect' : '<i class="fa-brands fa-spotify"></i> Connect Spotify'}
                        </button>
                    </div>
                    <small>Get a free Client ID from <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">Spotify Developer Dashboard</a> (Set Redirect URI to: <code>${window.location.origin + window.location.pathname}</code>)</small>
                </div>
                <div class="rp-setting-item">
                    <label>Playback Mode:</label>
                    <select id="rp_audio_source_select" class="rp-device-dropdown">
                        <option value="hybrid" ${settings.audioSource === 'hybrid' ? 'selected' : ''}>Hybrid (Try Spotify first, fallback to local/synth)</option>
                        <option value="spotify" ${settings.audioSource === 'spotify' ? 'selected' : ''}>Spotify Only</option>
                        <option value="local" ${settings.audioSource === 'local' ? 'selected' : ''}>Local Audio Only</option>
                    </select>
                </div>
            </div>

            <hr class="rp-divider" />

            <!-- Master Toggles -->
            <div class="rp-settings-group">
                <h4>Roleplay Detection & Immersion</h4>
                <label class="checkbox_label">
                    <input type="checkbox" id="rp_music_enabled" ${settings.enabled ? 'checked' : ''} />
                    <span>Enable Extension</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="rp_music_auto_detect" ${settings.autoDetection ? 'checked' : ''} />
                    <span>RP Action Detection (Auto-detect iPod, Radio, "play", "listen to" in messages)</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="rp_music_ai_awareness" ${settings.aiAwareness ? 'checked' : ''} />
                    <span>AI Character Awareness (Inject currently playing music into prompt)</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="rp_music_memory" ${settings.musicMemory ? 'checked' : ''} />
                    <span>Music Memory System (Characters remember repeat songs)</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="rp_music_mood" ${settings.moodMatching ? 'checked' : ''} />
                    <span>Mood-Based Song Matching (Rain, Battle, Party, etc.)</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="rp_music_synth" ${settings.useSynthFallback ? 'checked' : ''} />
                    <span>Procedural Ambient Synthesizer (Instant ambient audio if no MP3 file exists)</span>
                </label>
            </div>

            <hr class="rp-divider" />

            <!-- Volume & Prompt Settings -->
            <div class="rp-settings-group">
                <h4>Audio & Prompt Configuration</h4>
                <div class="rp-setting-item">
                    <label>Default Playback Volume: <span id="rp_vol_label">${Math.round((settings.defaultVolume || 0.65) * 100)}%</span></label>
                    <input type="range" id="rp_setting_volume" min="0" max="1" step="0.05" value="${settings.defaultVolume || 0.65}" class="rp-slider" />
                </div>
                <div class="rp-setting-item">
                    <label>Prompt Injection Depth (Messages from bottom):</label>
                    <input type="number" id="rp_setting_depth" min="0" max="10" value="${settings.promptDepth ?? 1}" class="text_pole" style="width: 80px;" />
                </div>
                <div class="rp-setting-item">
                    <label>Prompt Environment Template:</label>
                    <textarea id="rp_setting_prompt_template" class="text_pole" rows="3">${settings.promptTemplate || ''}</textarea>
                    <small>Available tokens: <code>{{songTitle}}</code>, <code>{{artist}}</code>, <code>{{device}}</code>, <code>{{volume}}</code>, <code>{{user}}</code>, <code>{{char}}</code></small>
                </div>
                <div class="rp-setting-item">
                    <label>Music Memory Note Template:</label>
                    <textarea id="rp_setting_memory_template" class="text_pole" rows="2">${settings.memoryTemplate || ''}</textarea>
                    <small>Tokens: <code>{{songTitle}}</code>, <code>{{timesPlayed}}</code>, <code>{{relativeTime}}</code></small>
                </div>
            </div>

            <hr class="rp-divider" />

            <!-- Device Playlist Manager -->
            <div class="rp-settings-group">
                <h4>Device Playlists & Local Audio</h4>
                <div class="rp-device-tabs-row">
                    <label>Select Device Playlist:</label>
                    <select id="rp_manage_device_select" class="rp-device-dropdown">
                        <!-- Populated dynamically -->
                    </select>
                </div>

                <!-- Track List Container -->
                <div id="rp_track_list_container" class="rp-track-list-box">
                    <!-- Populated dynamically -->
                </div>

                <!-- Add New Track Form -->
                <div class="rp-add-track-box">
                    <h5>Add Track to Local Playlist</h5>
                    <div class="rp-form-row">
                        <input type="text" id="rp_new_title" placeholder="Song Title (e.g. Lost Kitten)" class="text_pole" />
                        <input type="text" id="rp_new_artist" placeholder="Artist (e.g. Metric)" class="text_pole" />
                    </div>
                    <div class="rp-form-row">
                        <input type="text" id="rp_new_url" placeholder="Local Path, URL, or leave blank for synth" class="text_pole" />
                        <select id="rp_new_mood" class="text_pole">
                            <option value="chill">Mood: Chill / Relax</option>
                            <option value="melancholy">Mood: Melancholy / Sad</option>
                            <option value="cheerful">Mood: Cheerful / Upbeat</option>
                            <option value="romantic">Mood: Romantic</option>
                            <option value="energetic">Mood: Energetic / Battle</option>
                        </select>
                    </div>
                    <div class="rp-btn-row">
                        <button id="rp_btn_add_track" class="menu_button"><i class="fa-solid fa-plus"></i> Add Track</button>
                        <label class="menu_button rp-upload-btn" title="Choose local audio file">
                            <i class="fa-solid fa-file-audio"></i> Choose Local File
                            <input type="file" id="rp_file_audio_input" accept="audio/*" style="display:none;" />
                        </label>
                    </div>
                </div>
            </div>

            <hr class="rp-divider" />
            <div class="rp-footer-buttons">
                <button id="rp_btn_reset_defaults" class="menu_button menu_button_danger">Reset to Defaults</button>
            </div>
        </div>
    </div>
    `;

    container.insertAdjacentHTML('beforeend', html);
    bindSettingsEvents();
    renderDeviceSelector();
    renderTrackList();
}

function bindSettingsEvents() {
    const settings = getSettings();

    // Spotify Connect / Disconnect button
    document.getElementById('rp_btn_spotify_connect')?.addEventListener('click', () => {
        const isConnected = !!(settings.spotifyEnabled && settings.spotifyAccessToken);
        if (isConnected) {
            disconnectSpotify();
            updateSpotifyUI(false);
        } else {
            const clientId = document.getElementById('rp_spotify_client_id')?.value?.trim();
            initiateSpotifyAuth(clientId);
        }
    });

    document.getElementById('rp_audio_source_select')?.addEventListener('change', (e) => {
        settings.audioSource = e.target.value;
        saveSettings();
    });

    // Checkbox toggles
    document.getElementById('rp_music_enabled')?.addEventListener('change', (e) => {
        settings.enabled = e.target.checked;
        saveSettings();
    });

    document.getElementById('rp_music_auto_detect')?.addEventListener('change', (e) => {
        settings.autoDetection = e.target.checked;
        saveSettings();
    });

    document.getElementById('rp_music_ai_awareness')?.addEventListener('change', (e) => {
        settings.aiAwareness = e.target.checked;
        saveSettings();
    });

    document.getElementById('rp_music_memory')?.addEventListener('change', (e) => {
        settings.musicMemory = e.target.checked;
        saveSettings();
    });

    document.getElementById('rp_music_mood')?.addEventListener('change', (e) => {
        settings.moodMatching = e.target.checked;
        saveSettings();
    });

    document.getElementById('rp_music_synth')?.addEventListener('change', (e) => {
        settings.useSynthFallback = e.target.checked;
        saveSettings();
    });

    // Volume slider
    const volSlider = document.getElementById('rp_setting_volume');
    const volLabel = document.getElementById('rp_vol_label');
    volSlider?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        settings.defaultVolume = val;
        volLabel.textContent = `${Math.round(val * 100)}%`;
        saveSettings();
    });

    // Prompt depth and templates
    document.getElementById('rp_setting_depth')?.addEventListener('change', (e) => {
        settings.promptDepth = parseInt(e.target.value) || 1;
        saveSettings();
    });

    document.getElementById('rp_setting_prompt_template')?.addEventListener('input', (e) => {
        settings.promptTemplate = e.target.value;
        saveSettings();
    });

    document.getElementById('rp_setting_memory_template')?.addEventListener('input', (e) => {
        settings.memoryTemplate = e.target.value;
        saveSettings();
    });

    // Device playlist switcher
    const devSelect = document.getElementById('rp_manage_device_select');
    devSelect?.addEventListener('change', (e) => {
        activeDeviceTab = e.target.value;
        renderTrackList();
    });

    // Add track button
    document.getElementById('rp_btn_add_track')?.addEventListener('click', () => {
        const title = document.getElementById('rp_new_title')?.value?.trim();
        const artist = document.getElementById('rp_new_artist')?.value?.trim() || 'Artist';
        const url = document.getElementById('rp_new_url')?.value?.trim() || '';
        const mood = document.getElementById('rp_new_mood')?.value || 'chill';

        if (!title) {
            toastr.warning('Please enter a song title.');
            return;
        }

        const device = settings.devices[activeDeviceTab];
        if (!device) return;

        if (!device.tracks) device.tracks = [];
        device.tracks.push({
            id: `track_${Date.now()}`,
            title,
            artist,
            url,
            mood,
            duration: 210
        });

        saveSettings();
        renderTrackList();

        document.getElementById('rp_new_title').value = '';
        document.getElementById('rp_new_artist').value = '';
        document.getElementById('rp_new_url').value = '';
        toastr.success(`Added "${title}" to ${device.name}!`);
    });

    // Local Audio File Picker
    document.getElementById('rp_file_audio_input')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const objectUrl = URL.createObjectURL(file);
        const fileName = file.name.replace(/\.[^/.]+$/, '');

        // Populate fields
        document.getElementById('rp_new_title').value = fileName;
        document.getElementById('rp_new_url').value = objectUrl;
        toastr.info(`Loaded audio file: ${file.name}. Click "Add Track" to save.`);
    });

    // Reset button
    document.getElementById('rp_btn_reset_defaults')?.addEventListener('click', () => {
        if (confirm('Reset all RP World Music settings and playlists to factory defaults?')) {
            const context = SillyTavern.getContext();
            context.extensionSettings[MODULE_NAME] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            saveSettings();
            toastr.success('Reset RP World Music to defaults.');
            renderTrackList();
            populateDeviceSelect();
        }
    });
}

function updateSpotifyUI(isConnected) {
    const badge = document.getElementById('rp_spotify_status_badge');
    const btn = document.getElementById('rp_btn_spotify_connect');
    if (badge) {
        badge.className = `rp-badge ${isConnected ? 'rp-badge-connected' : 'rp-badge-disconnected'}`;
        badge.textContent = isConnected ? '● Connected' : '○ Not Connected';
    }
    if (btn) {
        btn.className = `menu_button ${isConnected ? 'menu_button_danger' : 'menu_button_success'}`;
        btn.innerHTML = isConnected ? '<i class="fa-solid fa-link-slash"></i> Disconnect' : '<i class="fa-brands fa-spotify"></i> Connect Spotify';
    }
}

function renderDeviceSelector() {
    const select = document.getElementById('rp_manage_device_select');
    if (!select) return;
    const settings = getSettings();
    select.innerHTML = '';

    for (const [key, dev] of Object.entries(settings.devices || {})) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `${dev.name} (${(dev.tracks || []).length} tracks)`;
        if (key === activeDeviceTab) opt.selected = true;
        select.appendChild(opt);
    }
}

function renderTrackList() {
    const container = document.getElementById('rp_track_list_container');
    if (!container) return;

    const settings = getSettings();
    const device = settings.devices[activeDeviceTab];
    if (!device) return;

    const tracks = device.tracks || [];

    if (tracks.length === 0) {
        container.innerHTML = `<div class="rp-empty-tracks">No tracks in ${device.name}. Add one below!</div>`;
        return;
    }

    container.innerHTML = tracks.map((t, idx) => `
        <div class="rp-track-row" data-index="${idx}">
            <div class="rp-track-left">
                <i class="fa-solid fa-compact-disc"></i>
                <div class="rp-track-meta">
                    <b>${escapeHtml(t.title)}</b>
                    <small>${escapeHtml(t.artist || 'Unknown')} • <span class="rp-mood-badge">${t.mood || 'ambient'}</span></small>
                </div>
            </div>
            <div class="rp-track-actions">
                <button class="rp-row-btn rp-btn-play-row" title="Play Now"><i class="fa-solid fa-play"></i></button>
                <button class="rp-row-btn rp-btn-del-row" title="Delete Track"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join('');

    // Bind row buttons
    container.querySelectorAll('.rp-track-row').forEach(row => {
        const idx = parseInt(row.getAttribute('data-index'));
        const track = tracks[idx];

        row.querySelector('.rp-btn-play-row')?.addEventListener('click', async () => {
            const { triggerMusic } = await import('./commands.js');
            triggerMusic(track.title, activeDeviceTab);
        });

        row.querySelector('.rp-btn-del-row')?.addEventListener('click', () => {
            if (confirm(`Remove "${track.title}" from ${device.name}?`)) {
                tracks.splice(idx, 1);
                saveSettings();
                renderTrackList();
                renderDeviceSelector();
            }
        });
    });
}

function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[m]));
}
