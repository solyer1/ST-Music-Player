/**
 * RP World Music - Main Extension Entry Point
 * Immersive in-world music system for SillyTavern roleplay (Hybrid: Spotify + Local Audio)
 */

import { MODULE_NAME } from './src/constants.js?v=1.0.3';
import { setContext, initSettings, getSettings, loadChatState, runtimeState } from './src/state.js?v=1.0.3';
import { initAudioEngine } from './src/audio-engine.js?v=1.0.3';
import { detectMusicAction } from './src/detector.js?v=1.0.3';
import { reasonMusicIntentWithLlm } from './src/llm-reasoner.js?v=1.0.3';
import { triggerMusic, triggerStopMusic, registerSlashCommands } from './src/commands.js?v=1.0.3';
import { initPlayerUI } from './src/player-ui.js?v=1.0.3';
import { initSettingsUI } from './src/settings-ui.js?v=1.0.3';
import { updatePromptInjection } from './src/prompt-injector.js?v=1.0.3';
import { handleSpotifyCallback, initSpotifyWebPlayer } from './src/spotify-service.js?v=1.0.3';

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

    // Deduplication tracker to avoid double-triggering across multiple lifecycle events
    let lastProcessedTurnKey = null;

    /**
     * Unified music trigger evaluator for roleplay turns
     * Handles both pre-response (regex only) and post-response (LLM reasoning + regex fallback)
     */
    async function handleChatTurnMusicCheck({ isAfterResponse = false, messageId = null } = {}) {
        const settings = getSettings();
        if (!settings.enabled || !settings.autoDetection) return;

        const chat = context.chat;
        if (!Array.isArray(chat) || chat.length === 0) return;

        let aiMsg = null;
        let userMsg = null;

        if (isAfterResponse) {
            const targetIdx = (typeof messageId === 'number' && messageId >= 0 && messageId < chat.length)
                ? messageId
                : (chat.length - 1);

            const candidateAi = chat[targetIdx];
            if (candidateAi && !candidateAi.is_user && !candidateAi.is_system) {
                aiMsg = candidateAi;
            }

            // Find the preceding user message in this turn
            for (let i = targetIdx - 1; i >= 0; i--) {
                if (chat[i] && chat[i].is_user && !chat[i].is_system) {
                    userMsg = chat[i];
                    break;
                }
            }
        } else {
            // Fired directly on MESSAGE_SENT before generation starts
            const lastMsg = chat[chat.length - 1];
            if (lastMsg && lastMsg.is_user && !lastMsg.is_system) {
                userMsg = lastMsg;
            }
        }

        if (!userMsg && !aiMsg) return;

        // Create turn fingerprint for deduplication
        const turnKey = `${userMsg?.send_date || userMsg?.mes?.slice(0, 30) || ''}_${aiMsg?.send_date || aiMsg?.mes?.slice(0, 30) || ''}_${aiMsg?.swipe_id ?? 0}`;
        if (turnKey === lastProcessedTurnKey) {
            return;
        }

        // When LLM reasoning is enabled, do NOT call generateQuietPrompt on MESSAGE_SENT,
        // because SillyTavern's main Generate('normal') is starting and will conflict.
        // We defer to CHARACTER_MESSAGE_RENDERED where the LLM is idle and available.
        if (!isAfterResponse && settings.useLlmReasoning !== false) {
            return;
        }

        let detected = null;

        // 1. If LLM Provider Reasoning is enabled and generation has completed
        if (settings.useLlmReasoning !== false && isAfterResponse) {
            try {
                detected = await reasonMusicIntentWithLlm({
                    userMessage: userMsg?.mes,
                    characterMessage: aiMsg?.mes
                });
            } catch (err) {
                console.warn('[RP-Music] LLM reasoning error, falling back to regex:', err);
            }
        }

        // 2. Fall back to regex detection (check user message first, then AI reply)
        if (!detected || detected.action === 'none') {
            if (userMsg && userMsg.mes) {
                const regexUser = detectMusicAction(userMsg.mes);
                if (regexUser && regexUser.action !== 'none') {
                    detected = regexUser;
                }
            }
            if ((!detected || detected.action === 'none') && aiMsg && aiMsg.mes) {
                const regexAi = detectMusicAction(aiMsg.mes);
                if (regexAi && regexAi.action !== 'none') {
                    detected = regexAi;
                }
            }
        }

        // If no action found, record key so we don't re-run expensive checks on the same turn
        if (!detected || detected.action === 'none') {
            lastProcessedTurnKey = turnKey;
            return;
        }

        lastProcessedTurnKey = turnKey;

        if (detected.action === 'play') {
            console.log('[RP-Music] 🎵 Executing RP music play action (after response):', detected);
            await triggerMusic(detected.songTitle, detected.device, detected.mood, detected.artist);
        } else if (detected.action === 'stop') {
            console.log('[RP-Music] ⏹️ Executing RP music stop action (after response):', detected);
            triggerStopMusic(detected.device);
        }
    }

    // A1. Post-response music trigger (fires right when AI finishes responding and renders message)
    if (eventTypes.CHARACTER_MESSAGE_RENDERED) {
        eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
            await handleChatTurnMusicCheck({ isAfterResponse: true, messageId });
        });
    }

    // A2. Backup post-response trigger for environments where MESSAGE_RECEIVED fires
    if (eventTypes.MESSAGE_RECEIVED) {
        eventSource.on(eventTypes.MESSAGE_RECEIVED, async (messageId) => {
            await handleChatTurnMusicCheck({ isAfterResponse: true, messageId });
        });
    }

    // A3. User message sent (for regex-only mode when LLM reasoning is disabled)
    eventSource.on(eventTypes.MESSAGE_SENT, async () => {
        const settings = getSettings();
        if (settings.useLlmReasoning === false) {
            await handleChatTurnMusicCheck({ isAfterResponse: false });
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
