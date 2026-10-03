/**
 * RP World Music - LLM Provider Reasoning Engine
 * Queries the currently connected LLM provider (Claude, OpenAI, Gemini, local model, etc.)
 * to perform deep semantic reasoning on user roleplay messages before triggering playback.
 */

import { getContext, getSettings } from './state.js';

// Fast keyword pre-check to prevent burning LLM generation tokens on messages completely unrelated to music
const MUSIC_CUE_REGEX = /(music|song|track|tune|audio|listen|hear|playing|play|radio|ipod|walkman|cassette|speaker|vinyl|record|disc|album|melody|beat|volume|เพลง|ดนตรี|เปิด|ฟัง|วิทยุ|ลำโพง|แผ่นเสียง|เทป|เสียงเพลง)/i;

/**
 * Sends the user message to the connected LLM provider for structured reasoning and extraction
 * @param {string} messageText - The user's roleplay message
 * @returns {Promise<object|null>} Reasoned intent object or null if reasoning fails/disabled
 */
export async function reasonMusicIntentWithLlm(messageText) {
    if (!messageText || typeof messageText !== 'string') return null;

    const settings = getSettings();
    if (!settings.useLlmReasoning) {
        return null;
    }

    // Fast check: If message has zero musical or audio cues, skip LLM call to save tokens
    if (!MUSIC_CUE_REGEX.test(messageText)) {
        return { action: 'none' };
    }

    const context = getContext();
    if (!context || typeof context.generateQuietPrompt !== 'function') {
        console.warn('[RP-Music] context.generateQuietPrompt is not available in SillyTavern.');
        return null;
    }

    const reasoningPrompt = `You are a precise semantic parser for an immersive in-world roleplay music extension.
Analyze the following user roleplay message and determine if the user or a character wants to play, listen to, change, or stop music, or interact with an audio device.

User Message:
"""${messageText.trim()}"""

Available Devices: "iPod", "Radio", "Cassette", "Speaker", "Vinyl"

Reasoning Rules:
1. Identify if there is an intent to play, change, or stop music (action: "play", "stop", or "none").
2. Extract the EXACT clean song title without artist names, quotes, punctuation, or narration. E.g. "Would That I", "Starboy".
3. Extract the EXACT artist or band name if specified or implied (e.g. "Hozier", "The Weeknd").
4. Identify which audio device is being used (iPod, Radio, Cassette, Speaker, Vinyl).
   - If radio/station/FM/AM is mentioned ➔ "Radio".
   - If phone/earphones/iPod/personal player ➔ "iPod".
   - If speaker/Bluetooth/room sound ➔ "Speaker".
   - If turntable/record/vinyl ➔ "Vinyl".
   - If tape/Walkman/cassette ➔ "Cassette".
   - If none specified, choose "Radio" for room audio or "iPod" for personal.
5. If the user turns on a device without naming a song, set action="play", song_title=null.
6. If the text has no music or audio device action, set has_music_action=false, action="none".

Respond with ONLY a raw JSON object matching this schema (NO markdown blocks, NO backticks):
{
  "has_music_action": true,
  "action": "play",
  "song_title": "Would That I",
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

        // Clean any code block wrappers or extraneous text
        let cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleanJson = jsonMatch[0];
        }

        const parsed = JSON.parse(cleanJson);
        console.log('[RP-Music] 🧠 LLM Provider Reasoning Result:', parsed);

        if (!parsed || parsed.has_music_action === false || parsed.action === 'none') {
            return { action: 'none' };
        }

        const result = {
            action: parsed.action === 'stop' ? 'stop' : 'play',
            songTitle: parsed.song_title ? String(parsed.song_title).trim().replace(/^["']|["']$/g, '') : null,
            artist: parsed.artist ? String(parsed.artist).trim().replace(/^["']|["']$/g, '') : null,
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
