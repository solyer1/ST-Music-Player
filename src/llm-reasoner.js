/**
 * RP World Music - LLM Provider Reasoning Engine
 * Queries the currently connected LLM provider (Claude, OpenAI, Gemini, local model, etc.)
 * to perform deep semantic reasoning on user roleplay messages before triggering playback.
 */

import { getContext, getSettings } from './state.js';

// Fast keyword pre-check to prevent burning LLM generation tokens on messages completely unrelated to music
const MUSIC_CUE_REGEX = /(music|song|track|tune|audio|listen|hear|playing|play|radio|ipod|walkman|cassette|speaker|vinyl|record|disc|album|melody|beat|volume|turn on|switch on|turns on|switches on|stereo|receiver|เพลง|ดนตรี|เปิด|ฟัง|วิทยุ|ลำโพง|แผ่นเสียง|เทป|เสียงเพลง)/i;

/**
 * Strips HTML, styles, think blocks, and truncates text for token-efficient reasoning
 */
function cleanMessageForReasoning(text, maxChars = 1200) {
    if (!text || typeof text !== 'string') return '';
    const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<style>[\s\S]*?<\/style>/gi, '')
        .replace(/<details>[\s\S]*?<\/details>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (cleaned.length <= maxChars) return cleaned;
    return cleaned.slice(0, maxChars) + '...';
}

/**
 * Sends the user message or turn context to the connected LLM provider for structured reasoning and extraction
 * @param {string|{userMessage?: string, characterMessage?: string}} input - Roleplay text or turn object
 * @returns {Promise<object|null>} Reasoned intent object or null if reasoning fails/disabled
 */
export async function reasonMusicIntentWithLlm(input) {
    if (!input) return null;

    const settings = getSettings();
    if (!settings.useLlmReasoning) {
        return null;
    }

    let userText = '';
    let charText = '';
    let combinedCueText = '';

    if (typeof input === 'object' && input !== null) {
        userText = cleanMessageForReasoning(input.userMessage, 800);
        charText = cleanMessageForReasoning(input.characterMessage, 1200);
        combinedCueText = `${userText} ${charText}`;
    } else if (typeof input === 'string') {
        userText = cleanMessageForReasoning(input, 1200);
        combinedCueText = userText;
    }

    if (!combinedCueText) return null;

    // Fast check: If message has zero musical or audio cues, skip LLM call to save tokens
    if (!MUSIC_CUE_REGEX.test(combinedCueText)) {
        return { action: 'none' };
    }

    const context = getContext();
    if (!context || typeof context.generateQuietPrompt !== 'function') {
        console.warn('[RP-Music] context.generateQuietPrompt is not available in SillyTavern.');
        return null;
    }

    let turnDescription = '';
    if (userText && charText) {
        turnDescription = `User Message:\n"""${userText}"""\n\nCharacter Narrative Reply:\n"""${charText}"""`;
    } else if (userText) {
        turnDescription = `User Message:\n"""${userText}"""`;
    } else {
        turnDescription = `Character Narrative Reply:\n"""${charText}"""`;
    }

    const reasoningPrompt = `You are a precise semantic parser for an immersive in-world roleplay music extension.
Analyze the following roleplay turn and determine if the user or a character wants to play, listen to, change, or stop music, or interact with an audio device.

${turnDescription}

Available Devices: "iPod", "Radio", "Cassette", "Speaker", "Vinyl"

Reasoning Rules:
1. Identify if there is an intent or scene action to play, change, or stop music (action: "play", "stop", or "none").
2. Extract the EXACT clean song title without artist names, quotes, punctuation, or narration. E.g. "Wasteland, Baby!", "Would That I", "Starboy".
3. Extract the EXACT artist or band name if specified or implied (e.g. "Hozier", "The Weeknd").
4. Identify which audio device is being used (iPod, Radio, Cassette, Speaker, Vinyl).
   - If radio/station/FM/AM/Kenwood/stereo receiver ➔ "Radio".
   - If phone/earphones/iPod/personal player ➔ "iPod".
   - If speaker/Bluetooth/room sound ➔ "Speaker".
   - If turntable/record/vinyl ➔ "Vinyl".
   - If tape/Walkman/cassette ➔ "Cassette".
   - If none specified, choose "Radio" for room audio or "iPod" for personal.
5. If music is turned on or a device is switched on without naming a song, set action="play", song_title=null.
6. If the text has no music or audio device action, set has_music_action=false, action="none".

Respond with ONLY a raw JSON object matching this schema (NO markdown blocks, NO backticks):
{
  "has_music_action": true,
  "action": "play",
  "song_title": "Wasteland, Baby!",
  "artist": "Hozier",
  "device": "Radio",
  "mood": "folk",
  "reasoning": "Brief explanation"
}`;

    try {
        console.log('[RP-Music] 🧠 Sending message to LLM Provider for music reasoning...');
        const responseText = await context.generateQuietPrompt({
            quietPrompt: reasoningPrompt,
            responseLength: 160,
            trimToSentence: false,
            removeReasoning: true
        });

        if (!responseText || typeof responseText !== 'string') {
            console.warn('[RP-Music] LLM provider returned empty response for music reasoning.');
            return null;
        }

        // Clean any code block wrappers, thought tags, or extraneous text
        let cleanJson = responseText
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/```(?:json)?/gi, '')
            .replace(/```/g, '')
            .trim();

        let parsed = null;
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                parsed = JSON.parse(jsonMatch[0]);
            } catch (_) {
                const firstBrace = cleanJson.indexOf('{');
                const lastBrace = cleanJson.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace > firstBrace) {
                    try {
                        parsed = JSON.parse(cleanJson.substring(firstBrace, lastBrace + 1));
                    } catch (e) {}
                }
            }
        }

        console.log('[RP-Music] 🧠 LLM Provider Reasoning Result:', parsed);

        if (!parsed || parsed.has_music_action === false || parsed.action === 'none') {
            return { action: 'none' };
        }

        const result = {
            action: parsed.action === 'stop' ? 'stop' : 'play',
            songTitle: parsed.song_title ? String(parsed.song_title).trim().replace(/^["']|["']$/g, '').replace(/[.,;]+$/, '').trim() : null,
            artist: parsed.artist ? String(parsed.artist).trim().replace(/^["']|["']$/g, '').replace(/[.,;]+$/, '').trim() : null,
            device: parsed.device || 'Radio',
            mood: parsed.mood || 'ambient',
            reasoning: parsed.reasoning || ''
        };

        // Notify user via toastr if available
        if (typeof toastr !== 'undefined' && settings.showChatNotifications) {
            if (result.action === 'play' && result.songTitle) {
                toastr.info(
                    `🧠 <b>AI Reasoned:</b> "${result.songTitle}" by ${result.artist || 'Artist'} [${result.device}]`,
                    'RP World Music',
                    { timeOut: 3500 }
                );
            }
        }

        return result;
    } catch (err) {
        console.warn('[RP-Music] LLM reasoning parsing failed, falling back to regex:', err);
        return null;
    }
}
