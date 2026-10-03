/**
 * RP World Music - State Management & Chat Metadata Sync
 */

import { MODULE_NAME, DEFAULT_SETTINGS } from './constants.js';

let contextRef = null;

// Runtime playback state
export const runtimeState = {
    currentSong: null,
    currentDevice: 'iPod',
    isPlaying: false,
    volume: 0.65,
    currentTime: 0,
    duration: 0,
    history: [], // [{ songTitle, artist, device, timestamp, count }]
    listeners: new Set()
};

export function setContext(ctx) {
    contextRef = ctx;
}

export function getContext() {
    return contextRef || SillyTavern.getContext();
}

/**
 * Initializes settings and loads persistent config
 */
export function initSettings() {
    const context = getContext();
    const settings = context.extensionSettings;

    if (!settings[MODULE_NAME]) {
        settings[MODULE_NAME] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    } else {
        // Deep merge missing properties from defaults
        settings[MODULE_NAME] = {
            ...DEFAULT_SETTINGS,
            ...settings[MODULE_NAME],
            devices: {
                ...DEFAULT_SETTINGS.devices,
                ...(settings[MODULE_NAME].devices || {})
            }
        };
    }

    runtimeState.volume = settings[MODULE_NAME].defaultVolume ?? 0.65;
    runtimeState.currentDevice = settings[MODULE_NAME].currentDevice || 'iPod';
    return settings[MODULE_NAME];
}

export function getSettings() {
    const context = getContext();
    return context.extensionSettings[MODULE_NAME] || DEFAULT_SETTINGS;
}

export function saveSettings() {
    const context = getContext();
    context.saveSettingsDebounced();
}

/**
 * Subscribe to runtime state changes (e.g. for UI updates)
 */
export function onStateChange(listener) {
    runtimeState.listeners.add(listener);
    return () => runtimeState.listeners.delete(listener);
}

export function notifyStateChange(changeType = 'update') {
    for (const listener of runtimeState.listeners) {
        try {
            listener(runtimeState, changeType);
        } catch (e) {
            console.error('[RP-Music] Error in state listener:', e);
        }
    }
}

/**
 * Sync memory and song history to current chat metadata
 */
export function recordSongPlay(song, deviceName) {
    if (!song) return;

    const chatMetadata = getContext().chatMetadata;
    if (!chatMetadata) return;

    if (!chatMetadata.rp_music_history) {
        chatMetadata.rp_music_history = [];
    }

    const songArtist = (song.artist || '').toLowerCase();
    const songTitle = (song.title || '').toLowerCase();
    const existingIndex = chatMetadata.rp_music_history.findIndex(
        h => (h.title || '').toLowerCase() === songTitle && (h.artist || '').toLowerCase() === songArtist
    );

    const now = Date.now();
    let record;

    if (existingIndex !== -1) {
        record = chatMetadata.rp_music_history[existingIndex];
        record.timesPlayed = (record.timesPlayed || 1) + 1;
        record.lastPlayed = now;
        record.device = deviceName || record.device;
    } else {
        record = {
            id: song.id || `${song.title}_${now}`,
            title: song.title,
            artist: song.artist || 'Unknown Artist',
            device: deviceName || 'Device',
            firstPlayed: now,
            lastPlayed: now,
            timesPlayed: 1
        };
        chatMetadata.rp_music_history.push(record);
    }

    // Save chat metadata
    if (typeof getContext().saveMetadataDebounced === 'function') {
        getContext().saveMetadataDebounced();
    }

    // Update runtime memory
    runtimeState.history = chatMetadata.rp_music_history;
    return record;
}

/**
 * Get memory record for current or given song in this chat
 */
export function getSongMemory(song) {
    if (!song) return null;
    const chatMetadata = getContext().chatMetadata;
    if (!chatMetadata || !chatMetadata.rp_music_history) return null;

    const songArtist = (song.artist || '').toLowerCase();
    const songTitle = (song.title || '').toLowerCase();
    return chatMetadata.rp_music_history.find(
        h => (h.title || '').toLowerCase() === songTitle && (h.artist || '').toLowerCase() === songArtist
    ) || null;
}

/**
 * Load chat-specific state on CHAT_CHANGED
 */
export function loadChatState() {
    const chatMetadata = getContext().chatMetadata;
    if (chatMetadata && Array.isArray(chatMetadata.rp_music_history)) {
        runtimeState.history = chatMetadata.rp_music_history;
    } else {
        runtimeState.history = [];
    }
    notifyStateChange('chat_loaded');
}
