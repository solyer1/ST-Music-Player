/**
 * RP World Music - Slash Commands & Action Handler (Hybrid: Spotify + Local)
 */

import { getContext, getSettings, runtimeState, recordSongPlay } from './state.js';
import { playTrack, stopTrack, pauseTrack, resumeTrack, setVolume as setLocalVolume } from './audio-engine.js';
import { updatePromptInjection } from './prompt-injector.js';
import { selectTrackForDevice } from './detector.js';
import { showChatNowPlayingCard, updateUI } from './player-ui.js';
import { searchSpotifyTrack, playSpotifyUri, pauseSpotify, resumeSpotify, setSpotifyVolume } from './spotify-service.js';

/**
 * Lightweight public metadata search via iTunes API (Zero Config / No Login needed)
 * Fetches real artist, high-res artwork, genre, and playable 30-sec preview stream.
 */
async function fetchPublicTrackMetadata(title, artist) {
    if (!title) return null;
    try {
        const queryTerm = (title + (artist ? ' ' + artist : '')).trim();
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(queryTerm)}&entity=song&limit=5`;
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.results && data.results.length > 0) {
            let item = data.results[0];
            if (artist) {
                const lowerArt = artist.toLowerCase();
                const matched = data.results.find(r => (r.artistName || '').toLowerCase().includes(lowerArt));
                if (matched) item = matched;
            }
            return {
                id: `public_${item.trackId}`,
                title: item.trackName,
                artist: item.artistName,
                album: item.collectionName,
                albumArt: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : '',
                previewUrl: item.previewUrl || '',
                duration: Math.round((item.trackTimeMillis || 210000) / 1000),
                genre: item.primaryGenreName || 'Music',
                isSpotify: false
            };
        }
    } catch (e) {
        console.warn('[RP-Music] Public track metadata lookup error:', e);
    }
    return null;
}
/**
 * Searches for full-length playable stream ID so user never has to open Spotify
 */
async function fetchYouTubeVideoId(query) {
    if (!query) return null;
    const endpoints = [
        'https://api.piped.private.coffee',
        'https://pipedapi.tokhmi.xyz'
    ];
    for (const ep of endpoints) {
        try {
            const resp = await fetch(`${ep}/search?q=${encodeURIComponent(query)}&filter=videos`);
            if (resp.ok) {
                const data = await resp.json();
                const nonVevo = data.items?.find(it => !it.isLive && it.type === 'video' && !it.uploaderName?.toLowerCase().includes('vevo'));
                const item = nonVevo || data.items?.find(it => !it.isLive && it.type === 'video') || data.items?.[0];
                if (item?.url) {
                    const videoId = item.url.replace('/watch?v=', '');
                    if (videoId && videoId.length === 11) {
                        return {
                            videoId,
                            title: item.title,
                            uploader: item.uploaderName
                        };
                    }
                }
            }
        } catch (_) {}
    }
    return null;
}

/**
 * Handle triggering music in Hybrid Mode (Spotify or Local)
 */
export async function triggerMusic(songTitle = null, deviceName = null, mood = null, artist = null) {
    const settings = getSettings();
    const activeDevice = deviceName || runtimeState.currentDevice || settings.currentDevice || 'iPod';
    const deviceObj = (settings.devices || {})[activeDevice] || Object.values(settings.devices)[0];
    const tracks = deviceObj ? (deviceObj.tracks || []) : [];

    let targetTrack = null;
    let queryForSpotify = songTitle;
    let artistForSpotify = artist;

    // Separate "by" or "ของ" if passed in songTitle
    if (queryForSpotify && !artistForSpotify) {
        if (/\s+by\s+/i.test(queryForSpotify)) {
            const parts = queryForSpotify.split(/\s+by\s+/i);
            queryForSpotify = parts[0].trim();
            artistForSpotify = parts[1].trim();
        } else if (/\s*[-–—]\s*/.test(queryForSpotify)) {
            const parts = queryForSpotify.split(/\s*[-–—]\s*/);
            if (parts.length === 2) {
                artistForSpotify = parts[0].trim();
                queryForSpotify = parts[1].trim();
            }
        }
    }

    // If no song title specified, pick from device playlist
    if (!queryForSpotify) {
        const localCandidate = selectTrackForDevice(activeDevice, mood);
        queryForSpotify = localCandidate ? `${localCandidate.title}` : 'ambient lofi chill';
        artistForSpotify = localCandidate?.artist || null;
        targetTrack = localCandidate;
    }

    // --- 1. Hybrid Mode: Attempt Spotify Playback first if enabled ---
    if (settings.spotifyEnabled && settings.spotifyAccessToken) {
        console.log(`[RP-Music] Attempting Spotify search for "${queryForSpotify}" (Artist: ${artistForSpotify || 'any'})`);
        const spotifyResult = await searchSpotifyTrack(queryForSpotify, artistForSpotify);

        if (spotifyResult) {
            const played = await playSpotifyUri(spotifyResult.uri);
            if (played) {
                targetTrack = {
                    id: spotifyResult.id,
                    title: spotifyResult.title,
                    artist: spotifyResult.artist,
                    album: spotifyResult.album,
                    albumArt: spotifyResult.albumArt,
                    duration: spotifyResult.duration,
                    uri: spotifyResult.uri,
                    genre: spotifyResult.genre || 'Music',
                    isSpotify: true
                };

                // Stop any playing local audio
                stopTrack();

                runtimeState.currentSong = targetTrack;
                runtimeState.currentDevice = activeDevice;
                runtimeState.isPlaying = true;
                runtimeState.duration = targetTrack.duration;
                runtimeState.currentTime = 0;

                recordSongPlay(targetTrack, activeDevice);
                updatePromptInjection(false);
                showChatNowPlayingCard(targetTrack, activeDevice);
                updateUI(runtimeState);
                return;
            } else {
                // Playback route via Spotify Connect failed, but keep full track metadata, embed ID & album art!
                targetTrack = {
                    id: spotifyResult.id,
                    title: spotifyResult.title,
                    artist: spotifyResult.artist,
                    album: spotifyResult.album,
                    albumArt: spotifyResult.albumArt,
                    duration: spotifyResult.duration,
                    uri: spotifyResult.uri,
                    genre: spotifyResult.genre || 'Music',
                    isSpotify: false,
                    spotifyId: spotifyResult.id,
                    externalUrl: spotifyResult.externalUrl
                };

                // Fetch audio stream preview so audio plays immediately in background
                const publicMatch = await fetchPublicTrackMetadata(spotifyResult.title, spotifyResult.artist);
                if (publicMatch && publicMatch.previewUrl) {
                    targetTrack.previewUrl = publicMatch.previewUrl;
                }
            }
        }
    }

    // --- 2. Check local presets in current device and other devices ---
    if (!targetTrack && queryForSpotify) {
        const cleanTitle = queryForSpotify.trim().toLowerCase();
        // Check current device
        targetTrack = tracks.find(t => t.title.toLowerCase().includes(cleanTitle));

        // Check other devices
        if (!targetTrack) {
            for (const [dName, dData] of Object.entries(settings.devices || {})) {
                for (const t of (dData.tracks || [])) {
                    if (t.title.toLowerCase().includes(cleanTitle)) {
                        targetTrack = t;
                        runtimeState.currentDevice = dName;
                        break;
                    }
                }
                if (targetTrack) break;
            }
        }
        // Check if user placed an audio file into the extension's music directory
        if (!targetTrack) {
            const baseExtUrl = '/scripts/extensions/third-party/sillytavern-rp-music/music';
            const cleanName = encodeURIComponent(queryForSpotify.trim());
            const fileCandidates = [
                `${baseExtUrl}/${activeDevice}/${cleanName}.mp3`,
                `${baseExtUrl}/${activeDevice}/${cleanName}.ogg`,
                `${baseExtUrl}/${activeDevice}/${cleanName}.wav`,
                `${baseExtUrl}/Radio/${cleanName}.mp3`,
                `${baseExtUrl}/iPod/${cleanName}.mp3`,
                `${baseExtUrl}/Speaker/${cleanName}.mp3`
            ];
            for (const cand of fileCandidates) {
                try {
                    const head = await fetch(cand, { method: 'HEAD' });
                    if (head.ok) {
                        targetTrack = {
                            id: `local_${Date.now()}`,
                            title: queryForSpotify.trim(),
                            artist: artistForSpotify || 'Local File',
                            url: cand,
                            duration: 240,
                            isSpotify: false
                        };
                        break;
                    }
                } catch (_) {}
            }
        }
    }

    // --- 3. Zero-Config Public Search (Discovers real Artist, Album Art & Preview Stream) ---
    if (!targetTrack && queryForSpotify) {
        const publicMatch = await fetchPublicTrackMetadata(queryForSpotify, artistForSpotify);
        if (publicMatch) {
            targetTrack = publicMatch;
        }
    }

    // --- 4. Fallback virtual track (Preserves artist if given!) ---
    if (!targetTrack && queryForSpotify) {
        targetTrack = {
            id: `dynamic_${Date.now()}`,
            title: queryForSpotify.trim(),
            artist: artistForSpotify || artist || 'In-Story Artist',
            mood: mood || 'ambient',
            url: '',
            duration: 210,
            isSpotify: false
        };
    }

    if (!targetTrack) {
        targetTrack = selectTrackForDevice(activeDevice, mood);
    }

    // Resolve YouTube video ID so the user can 1-click launch full song
    if (targetTrack && !targetTrack.isSpotify && !targetTrack.youtubeId) {
        const fullQuery = `${targetTrack.title} ${targetTrack.artist || ''} lyrics`.trim();
        const yt = await fetchYouTubeVideoId(fullQuery);
        if (yt) {
            targetTrack.youtubeId = yt.videoId;
        }
    }

    // Play via local engine (plays audio file URL, public preview stream, or ambient synth)
    await playTrack(targetTrack, activeDevice);

    recordSongPlay(targetTrack, activeDevice);
    updatePromptInjection(false);
    showChatNowPlayingCard(targetTrack, activeDevice);
    updateUI(runtimeState);
}

/**
 * Handle stopping music
 */
export function triggerStopMusic(deviceName = null) {
    const activeDevice = deviceName || runtimeState.currentDevice || 'Device';

    if (runtimeState.currentSong?.isSpotify) {
        pauseSpotify();
    }
    stopTrack();

    runtimeState.isPlaying = false;
    updatePromptInjection(true);

    if (typeof toastr !== 'undefined') {
        toastr.info(`Music turned off on ${activeDevice}.`, 'RP World Music');
    }
    updateUI(runtimeState);
}

/**
 * Pause / Resume toggle
 */
export function togglePlayPause() {
    if (runtimeState.isPlaying) {
        if (runtimeState.currentSong?.isSpotify) {
            pauseSpotify();
        }
        pauseTrack();
        runtimeState.isPlaying = false;
    } else {
        if (runtimeState.currentSong?.isSpotify) {
            resumeSpotify();
            runtimeState.isPlaying = true;
        } else {
            resumeTrack();
        }
    }
    updateUI(runtimeState);
}

/**
 * Unified Volume Control
 */
export function setUnifiedVolume(vol) {
    setLocalVolume(vol);
    if (runtimeState.currentSong?.isSpotify) {
        setSpotifyVolume(vol);
    }
}

/**
 * Skip to next track in playlist
 */
export function nextTrack() {
    const settings = getSettings();
    const device = runtimeState.currentDevice || 'iPod';
    const tracks = settings.devices?.[device]?.tracks || [];
    if (tracks.length === 0) return;

    let currentIndex = tracks.findIndex(t => t.id === runtimeState.currentSong?.id);
    const nextIndex = (currentIndex + 1) % tracks.length;
    triggerMusic(tracks[nextIndex].title, device);
}

/**
 * Go to previous track in playlist
 */
export function prevTrack() {
    const settings = getSettings();
    const device = runtimeState.currentDevice || 'iPod';
    const tracks = settings.devices?.[device]?.tracks || [];
    if (tracks.length === 0) return;

    let currentIndex = tracks.findIndex(t => t.id === runtimeState.currentSong?.id);
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    triggerMusic(tracks[prevIndex].title, device);
}

/**
 * Register Slash Commands
 */
export function registerSlashCommands() {
    const context = getContext();
    const parser = context.SlashCommandParser;
    const command = context.SlashCommand;
    const arg = context.SlashCommandArgument;

    if (!parser || !command) return;

    // /music [song title or subcommand]
    parser.addCommandObject(
        command.fromProps({
            name: 'music',
            aliases: ['playmusic', 'rpmusic'],
            helpString: 'Play or control in-world RP music (Spotify or Local). Usage: /music [song name] or /music stop',
            unnamedArgumentList: [
                arg.fromProps({
                    description: 'Song name or command (play, stop, pause, resume, next, prev)',
                    type: context.ARGUMENT_TYPE?.STRING || 1,
                    isRequired: false
                })
            ],
            callback: async (namedArgs, unnamedArgs) => {
                const query = (unnamedArgs || '').trim();

                if (!query) {
                    togglePlayPause();
                    return runtimeState.isPlaying ? 'Music resumed.' : 'Music paused.';
                }

                const lower = query.toLowerCase();
                if (lower === 'stop' || lower === 'off') {
                    triggerStopMusic();
                    return 'Music stopped.';
                } else if (lower === 'pause') {
                    togglePlayPause();
                    return 'Music paused.';
                } else if (lower === 'resume' || lower === 'play') {
                    togglePlayPause();
                    return 'Music playing.';
                } else if (lower === 'next') {
                    nextTrack();
                    return 'Playing next song.';
                } else if (lower === 'prev') {
                    prevTrack();
                    return 'Playing previous song.';
                }

                // If argument is a song title:
                await triggerMusic(query);
                return `Triggered RP music: "${query}" on ${runtimeState.currentDevice}.`;
            }
        })
    );

    // /stopmusic
    parser.addCommandObject(
        command.fromProps({
            name: 'stopmusic',
            aliases: ['musicstop'],
            helpString: 'Stops currently playing in-world music and resets environment prompt.',
            callback: async () => {
                triggerStopMusic();
                return 'Stopped RP world music.';
            }
        })
    );

    // /nextsong
    parser.addCommandObject(
        command.fromProps({
            name: 'nextsong',
            helpString: 'Plays next song on current device playlist.',
            callback: async () => {
                nextTrack();
                return `Next song: ${runtimeState.currentSong?.title || 'None'}`;
            }
        })
    );

    // /prevsong
    parser.addCommandObject(
        command.fromProps({
            name: 'prevsong',
            helpString: 'Plays previous song on current device playlist.',
            callback: async () => {
                prevTrack();
                return `Previous song: ${runtimeState.currentSong?.title || 'None'}`;
            }
        })
    );

    // /playlist [device]
    parser.addCommandObject(
        command.fromProps({
            name: 'playlist',
            aliases: ['musicplaylist'],
            helpString: 'Lists tracks available on current or specified device.',
            unnamedArgumentList: [
                arg.fromProps({
                    description: 'Device name (iPod, Radio, Cassette, Speaker, Vinyl)',
                    type: context.ARGUMENT_TYPE?.STRING || 1,
                    isRequired: false
                })
            ],
            callback: async (namedArgs, unnamedArgs) => {
                const deviceQuery = (unnamedArgs || '').trim() || runtimeState.currentDevice || 'iPod';
                const settings = getSettings();
                const device = settings.devices?.[deviceQuery];

                if (!device) {
                    return `Device "${deviceQuery}" not found. Available devices: ${Object.keys(settings.devices || {}).join(', ')}`;
                }

                const trackList = (device.tracks || [])
                    .map((t, i) => `${i + 1}. **${t.title}** by *${t.artist}* [${t.mood || 'ambient'}]`)
                    .join('\n');

                return `### 🎵 ${device.name} Playlist:\n${trackList || 'No tracks loaded.'}`;
            }
        })
    );
}
