/**
 * RP World Music - Prompt Injection & Memory Context Engine
 */

import { EXTENSION_PROMPT_ID } from './constants.js';
import { getContext, getSettings, runtimeState, getSongMemory } from './state.js';

/**
 * Updates the extension prompt injected into the LLM context
 */
export function updatePromptInjection(isStopped = false) {
    const context = getContext();
    const settings = getSettings();

    if (!settings.aiAwareness) {
        // Clear injection if AI awareness is disabled
        context.setExtensionPrompt(EXTENSION_PROMPT_ID, '', settings.promptPosition ?? 1, settings.promptDepth ?? 1);
        return;
    }

    if (isStopped || !runtimeState.isPlaying || !runtimeState.currentSong) {
        // Inject stopped environment notice if a device was recently turned off
        if (isStopped && settings.stopTemplate && runtimeState.currentDevice) {
            const stopText = formatTemplate(settings.stopTemplate, {
                device: runtimeState.currentDevice,
                user: context.name1 || 'User',
                char: context.name2 || 'Character'
            });
            context.setExtensionPrompt(EXTENSION_PROMPT_ID, stopText, settings.promptPosition ?? 1, settings.promptDepth ?? 1);
        } else {
            context.setExtensionPrompt(EXTENSION_PROMPT_ID, '', settings.promptPosition ?? 1, settings.promptDepth ?? 1);
        }
        return;
    }

    const song = runtimeState.currentSong;
    const device = runtimeState.currentDevice || 'Device';
    const volumePercent = Math.round((runtimeState.volume ?? 0.65) * 100);

    // 1. Base Environment Prompt
    let promptText = formatTemplate(settings.promptTemplate, {
        songTitle: song.title || 'Unknown Song',
        artist: song.artist || 'Unknown Artist',
        device: device,
        volume: volumePercent,
        mood: song.mood || 'ambient',
        genre: song.genre || 'Music',
        user: context.name1 || 'User',
        char: context.name2 || 'Character'
    });

    // 2. Music Memory Context (if song was played before in this chat)
    if (settings.musicMemory) {
        const memory = getSongMemory(song);
        if (memory && memory.timesPlayed > 1) {
            const relativeTimeStr = getRelativeTimeString(memory.firstPlayed);
            const memoryText = formatTemplate(settings.memoryTemplate, {
                songTitle: song.title,
                artist: song.artist,
                device: device,
                timesPlayed: memory.timesPlayed,
                relativeTime: relativeTimeStr,
                user: context.name1 || 'User',
                char: context.name2 || 'Character'
            });
            promptText += `\n${memoryText}`;
        }
    }

    // Set prompt into SillyTavern's context
    // position: 1 = IN_CHAT, 0 = IN_PROMPT, -1 = BEFORE_PROMPT
    const position = settings.promptPosition !== undefined ? settings.promptPosition : 1;
    const depth = settings.promptDepth !== undefined ? settings.promptDepth : 1;

    context.setExtensionPrompt(EXTENSION_PROMPT_ID, promptText, position, depth);
}

/**
 * Replace template tokens {{key}} with values
 */
function formatTemplate(templateStr, data) {
    if (!templateStr) return '';
    return templateStr.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
        return data[key] !== undefined ? String(data[key]) : match;
    });
}

function getRelativeTimeString(timestamp) {
    if (!timestamp) return 'earlier';
    const diffMs = Date.now() - timestamp;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 2) return 'just a moment ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
}
