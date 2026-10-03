/**
 * RP World Music - Natural Language Action & Device & Song Detector
 */

import { RP_TRIGGER_WORDS } from './constants.js';
import { getSettings } from './state.js';

/**
 * Capitalizes names/titles cleanly (e.g. "hozier" -> "Hozier", "the weeknd" -> "The Weeknd")
 */
function capitalizeWords(str) {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Analyzes text (user message or slash command) to detect RP music actions
 * @param {string} text - Message text
 * @returns {object} { action: 'play'|'stop'|'none', device: string, songTitle: string|null, artist: string|null, matchedTrack: object|null, mood: string|null }
 */
export function detectMusicAction(text) {
    if (!text || typeof text !== 'string') {
        return { action: 'none' };
    }

    const cleanText = text.trim();
    // Normalize surrounding RP asterisks (e.g. "*turns on the radio and listens to Would that i. by hozier*")
    const normalizedText = cleanText.replace(/^\*+|\*+$/g, '').trim();
    const lowerText = normalizedText.toLowerCase();
    const settings = getSettings();
    const devices = settings.devices || {};

    // 1. Check for Stop / Turn off actions
    const hasStopVerb = RP_TRIGGER_WORDS.stopVerbs.some(verb => {
        if (/[\u0E00-\u0E7F]/.test(verb)) {
            return lowerText.includes(verb);
        }
        const regex = new RegExp(`\\b${escapeRegExp(verb)}\\b`, 'i');
        return regex.test(lowerText);
    });

    // Detect target device in message
    let detectedDevice = null;
    for (const [deviceName, keywords] of Object.entries(RP_TRIGGER_WORDS.deviceKeywords)) {
        if (devices[deviceName]) {
            for (const kw of keywords) {
                if (/[\u0E00-\u0E7F]/.test(kw)) {
                    if (lowerText.includes(kw)) {
                        detectedDevice = deviceName;
                        break;
                    }
                } else {
                    const regex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
                    if (regex.test(lowerText)) {
                        detectedDevice = deviceName;
                        break;
                    }
                }
            }
        }
        if (detectedDevice) break;
    }

    // Check if stop music action was triggered
    const musicMention = /\b(music|song|track|tune|audio|playback|playlist)\b/i.test(lowerText) || /(เพลง|ดนตรี)/.test(lowerText);
    if (hasStopVerb && (detectedDevice || musicMention)) {
        return {
            action: 'stop',
            device: detectedDevice || settings.currentDevice || 'iPod'
        };
    }

    // 2. Check for Play / Turn on actions
    const hasPlayVerb = RP_TRIGGER_WORDS.verbs.some(verb => {
        if (/[\u0E00-\u0E7F]/.test(verb)) {
            return lowerText.includes(verb);
        }
        const regex = new RegExp(`\\b${escapeRegExp(verb)}\\b`, 'i');
        return regex.test(lowerText);
    });

    if (!hasPlayVerb && !detectedDevice) {
        return { action: 'none' };
    }

    // Fall back to current or default device if not explicitly mentioned
    const activeDevice = detectedDevice || settings.currentDevice || 'iPod';
    const deviceObj = devices[activeDevice] || Object.values(devices)[0];
    const tracks = deviceObj ? (deviceObj.tracks || []) : [];

    // 3. Detect Song Title and Artist
    let extractedSongTitle = null;
    let extractedArtist = null;
    let matchedTrack = null;

    // A. Explicit "Song by Artist" or "Song ของ Artist" pattern
    const byPatterns = [
        // English: (play|listen to|put on|cues up|playing) [Title] [optional period] by [Artist]
        /(?:play|plays|playing|played|put on|puts on|listen to|listens to|listening to|cue up|cues up|crank up)\s+(?:a song called\s+|the song\s+)?["'“]?([^\n*"’.,!?]+?)["'”]?\s*[.,]?\s+by\s+["'“]?([A-Za-z0-9\s'.-]+?)["'”]?(?:\s+(?:on|through|from|with)\s+(?:my|the|his|her)?\s*(?:ipod|phone|radio|cassette|speaker|walkman|vinyl|stereo)|[.,!?*]|$)/i,
        // Thai: (เปิดเพลง|เล่นเพลง|ฟังเพลง) [Title] (ของ|by) [Artist]
        /(?:เปิดเพลง|เล่นเพลง|ฟังเพลง)\s*(?:ชื่อ\s*)?["'“]?([^\n*"’.,!?]+?)["'”]?\s*(?:ของ|by)\s*["'“]?([^\n*"’.,!?]+?)["'”]?(?:\s*(?:ใน|จาก|ด้วย|บน|ที่)?\s*(?:ลำโพง|วิทยุ|ไอพอด|โทรศัพท์|เทป|แผ่นเสียง)|[.,!?*]|$)/i,
        // Quoted: "Title" by Artist
        /["'“]([^"'”]+)["'”]\s+by\s+["'“]?([A-Za-z0-9\s'.-]+?)["'”]?/i
    ];

    for (const pattern of byPatterns) {
        const match = normalizedText.match(pattern);
        if (match && match[1] && match[2]) {
            extractedSongTitle = match[1].trim();
            extractedArtist = capitalizeWords(match[2].trim());
            break;
        }
    }

    // B. Quoted song names: "Song Title" or 'Song Title'
    if (!extractedSongTitle) {
        const quoteMatch = normalizedText.match(/["'“]([^"'”]+)["'”]/);
        if (quoteMatch && quoteMatch[1].trim().length > 1) {
            extractedSongTitle = quoteMatch[1].trim();
        }
    }

    // C. Patterns: "play X on/through my/the iPod" or "put on X" or Thai "เปิดเพลง X"
    if (!extractedSongTitle) {
        const playPatterns = [
            /(?:play|plays|playing|played|put on|puts on|listen to|listens to|listening to|cue up|cues up)\s+(?:a song called\s+|the song\s+)?([A-Za-z0-9\s'-]+?)(?:\s+(?:on|through|from|with)\s+(?:my|the|his|her|their)?\s*(?:ipod|phone|radio|cassette|speaker|walkman|vinyl|stereo)|[.,!?*]|$)/i,
            /(?:เปิดเพลง|เล่นเพลง|ฟังเพลง)\s*(?:ชื่อ\s*)?([^\n*.,!?]+?)(?:\s*(?:ใน|จาก|ด้วย|บน|ที่)?\s*(?:ลำโพง|วิทยุ|ไอพอด|โทรศัพท์|เทป|แผ่นเสียง)|[.,!?*]|$)/i
        ];

        for (const pattern of playPatterns) {
            const match = normalizedText.match(pattern);
            if (match && match[1]) {
                const candidate = match[1].trim();
                // Filter out non-title words like "music", "some music", "the radio"
                if (!/^(the|a|some|my)?\s*(music|radio|ipod|cassette|tape|speaker|sound|audio|เพลง|ลำโพง|วิทยุ)$/i.test(candidate)) {
                    extractedSongTitle = candidate;
                    break;
                }
            }
        }
    }

    // D. "turn on [song] on [device]" (only when specific song is named)
    if (!extractedSongTitle) {
        const turnOnMatch = normalizedText.match(/(?:turn on|turns on)\s+([A-Za-z0-9\s'-]+?)(?:\s+on\s+(?:my|the)?\s*(?:ipod|phone|radio|cassette|speaker|walkman)|$)/i);
        if (turnOnMatch && turnOnMatch[1]) {
            const candidate = turnOnMatch[1].trim();
            if (!/^(the|a|some|my)?\s*(music|radio|ipod|cassette|tape|speaker|sound|audio|เพลง|ลำโพง|วิทยุ)$/i.test(candidate)) {
                extractedSongTitle = candidate;
            }
        }
    }

    // E. Search known library for direct title mention
    for (const track of tracks) {
        const trackTitleRegex = new RegExp(`\\b${escapeRegExp(track.title)}\\b`, 'i');
        if (trackTitleRegex.test(cleanText)) {
            matchedTrack = track;
            extractedSongTitle = track.title;
            if (!extractedArtist) extractedArtist = track.artist;
            break;
        }
    }

    // Also check other devices if not found in current device
    if (!matchedTrack && extractedSongTitle) {
        for (const [dName, dData] of Object.entries(devices)) {
            for (const t of (dData.tracks || [])) {
                if (t.title.toLowerCase() === extractedSongTitle.toLowerCase()) {
                    matchedTrack = t;
                    if (!extractedArtist) extractedArtist = t.artist;
                    break;
                }
            }
            if (matchedTrack) break;
        }
    }

    // F. Separate song title and artist if formatted as "Song by Artist" or "Artist - Song"
    if (extractedSongTitle) {
        if (!extractedArtist && /\s+by\s+/i.test(extractedSongTitle)) {
            const parts = extractedSongTitle.split(/\s+by\s+/i);
            extractedSongTitle = parts[0].trim();
            extractedArtist = capitalizeWords(parts[1].trim());
        } else if (!extractedArtist && /\s*[-–—]\s*/.test(extractedSongTitle)) {
            const parts = extractedSongTitle.split(/\s*[-–—]\s*/);
            if (parts.length === 2) {
                // E.g. "Hozier - Would That I" or "Would That I - Hozier"
                extractedArtist = capitalizeWords(parts[0].trim());
                extractedSongTitle = parts[1].trim();
            }
        }
    }

    if (matchedTrack && !extractedArtist) {
        extractedArtist = matchedTrack.artist;
    }

    // 4. Detect Mood / Atmosphere
    let detectedMood = null;
    if (settings.moodMatching) {
        for (const [mood, keywords] of Object.entries(RP_TRIGGER_WORDS.moodKeywords)) {
            for (const kw of keywords) {
                const regex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
                if (regex.test(lowerText)) {
                    detectedMood = mood;
                    break;
                }
            }
            if (detectedMood) break;
        }
    }

    // If an action was identified or device turned on:
    if (hasPlayVerb || detectedDevice) {
        return {
            action: 'play',
            device: activeDevice,
            songTitle: extractedSongTitle,
            artist: extractedArtist,
            matchedTrack,
            mood: detectedMood
        };
    }

    return { action: 'none' };
}

/**
 * Selects a random or mood-matched track from device playlist
 */
export function selectTrackForDevice(deviceName, requestedMood = null) {
    const settings = getSettings();
    const deviceObj = (settings.devices || {})[deviceName];
    if (!deviceObj || !deviceObj.tracks || deviceObj.tracks.length === 0) {
        return {
            id: 'ambient_generic',
            title: 'Atmospheric Melody',
            artist: deviceName,
            mood: 'chill',
            duration: 180,
            url: ''
        };
    }

    const tracks = deviceObj.tracks;

    // If mood is requested, filter tracks with matching mood
    if (requestedMood) {
        const moodMatches = tracks.filter(t => (t.mood || '').toLowerCase() === requestedMood.toLowerCase());
        if (moodMatches.length > 0) {
            return moodMatches[Math.floor(Math.random() * moodMatches.length)];
        }
    }

    // Otherwise select random track
    return tracks[Math.floor(Math.random() * tracks.length)];
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
