/**
 * RP World Music - Main Extension Entry Point
 * Immersive in-world music system for SillyTavern roleplay (Hybrid: Spotify + Local Audio)
 */

import { MODULE_NAME } from './src/constants.js';
import { setContext, initSettings, getSettings, loadChatState, runtimeState } from './src/state.js';
import { initAudioEngine } from './src/audio-engine.js';
import { detectMusicAction } from './src/detector.js';
import { triggerMusic, triggerStopMusic, registerSlashCommands } from './src/commands.js';
import { initPlayerUI } from './src/player-ui.js';
import { initSettingsUI } from './src/settings-ui.js';
import { updatePromptInjection } from './src/prompt-injector.js';
import { handleSpotifyCallback, initSpotifyWebPlayer } from './src/spotify-service.js';

/**
 * Main initialization routine
 */
async function initializeExtension() {
    const context = SillyTavern.getContext();
    setContext(context);

    // 1. Initialize configuration and state
    initSettings();

    // Ensure referrer policy allows embedded players to verify origin (prevents YouTube Error 153)
    if (!document.querySelector('meta[name="referrer"]')) {
        const meta = document.createElement('meta');
        meta.name = 'referrer';
        meta.content = 'strict-origin-when-cross-origin';
        document.head.appendChild(meta);
    }

    // 2. Intercept Spotify OAuth PKCE callback if present in URL
    await handleSpotifyCallback();

    // 3. Initialize in-browser Spotify Web Player
    const settings = getSettings();
    if (settings.spotifyEnabled && settings.spotifyAccessToken) {
        initSpotifyWebPlayer();
    }

    // 4. Initialize Audio Engine
    initAudioEngine();

    // 4. Mount UI Components
    initPlayerUI();
    initSettingsUI();

    // 5. Register Slash Commands (/music, /stopmusic, /nextsong, /prevsong, /playlist)
    registerSlashCommands();

    // 6. Hook into SillyTavern Event Bus
    const eventSource = context.eventSource;
    const eventTypes = context.eventTypes || context.event_types;

    if (!eventSource || !eventTypes) {
        console.error('[RP-Music] Failed to locate SillyTavern eventSource.');
        return;
    }

    // A. Detect RP actions in user messages
    eventSource.on(eventTypes.MESSAGE_SENT, async (messageId) => {
        const settings = getSettings();
        if (!settings.enabled || !settings.autoDetection) return;

        // Retrieve current message text
        let messageText = '';
        const chat = context.chat;
        if (Array.isArray(chat) && chat.length > 0) {
            const lastMsg = chat[chat.length - 1];
            if (lastMsg && !lastMsg.is_system && lastMsg.is_user) {
                messageText = lastMsg.mes || '';
            }
        }

        if (!messageText) return;

        // Run NLP detection
        const detected = detectMusicAction(messageText);

        if (detected.action === 'play') {
            console.log('[RP-Music] Detected RP music play action:', detected);
            await triggerMusic(detected.songTitle, detected.device, detected.mood, detected.artist);
        } else if (detected.action === 'stop') {
            console.log('[RP-Music] Detected RP music stop action:', detected);
            triggerStopMusic(detected.device);
        }
    });

    // B. Sync state when switching characters or chats
    eventSource.on(eventTypes.CHAT_CHANGED, () => {
        loadChatState();
        if (runtimeState.isPlaying && runtimeState.currentSong) {
            updatePromptInjection(false);
        }
    });

    // C. Ensure prompt injection is fresh before generation combines prompts
    eventSource.on(eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS, () => {
        if (runtimeState.isPlaying && runtimeState.currentSong) {
            updatePromptInjection(false);
        }
    });

    console.log('[RP-Music] RP World Music (Hybrid Mode) initialized successfully.');
}

// Bootstrap on DOM ready
jQuery(() => {
    initializeExtension().catch(err => {
        console.error('[RP-Music] Failed to initialize RP World Music:', err);
    });
});
