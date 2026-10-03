/**
 * RP World Music - Spotify Web API & PKCE OAuth Service
 * Enables direct Spotify search, album art retrieval, and Spotify Connect playback control.
 */

import { SPOTIFY_CONFIG } from './constants.js';
import { getSettings, saveSettings } from './state.js';

const STORAGE_VERIFIER_KEY = 'rp_music_spotify_code_verifier';

/**
 * Initiates the PKCE Authorization Flow (100% client-side, no backend needed)
 */
export async function initiateSpotifyAuth(clientId) {
    if (!clientId || clientId.trim() === '') {
        toastr.error('Please enter your Spotify Client ID first.', 'RP World Music');
        return;
    }

    const cleanClientId = clientId.trim();
    const settings = getSettings();
    settings.spotifyClientId = cleanClientId;
    saveSettings();

    // Persist in localStorage to survive the redirect safely
    localStorage.setItem('rp_music_spotify_client_id', cleanClientId);

    // 1. Generate code verifier and code challenge
    const verifier = generateRandomString(64);
    localStorage.setItem(STORAGE_VERIFIER_KEY, verifier);

    const challenge = await generateCodeChallenge(verifier);

    // 2. Build redirect URI (current SillyTavern URL)
    const redirectUri = window.location.origin + window.location.pathname;

    const params = new URLSearchParams({
        client_id: cleanClientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: SPOTIFY_CONFIG.SCOPES.join(' '),
        code_challenge_method: 'S256',
        code_challenge: challenge
    });

    // 3. Redirect to Spotify Authorization
    window.location.href = `${SPOTIFY_CONFIG.AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Checks URL on page load and exchanges auth code for tokens
 */
export async function handleSpotifyCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
        console.error('[RP-Music] Spotify auth error:', error);
        toastr.error(`Spotify authorization failed: ${error}`, 'RP World Music');
        cleanUrl();
        return;
    }

    if (!code) return;

    const verifier = localStorage.getItem(STORAGE_VERIFIER_KEY);
    const storedClientId = localStorage.getItem('rp_music_spotify_client_id');
    const settings = getSettings();
    const clientId = storedClientId || settings.spotifyClientId;

    if (!clientId || !verifier) {
        console.warn('[RP-Music] Missing Spotify Client ID or code verifier during callback.');
        cleanUrl();
        return;
    }

    const redirectUri = window.location.origin + window.location.pathname;

    try {
        const response = await fetch(SPOTIFY_CONFIG.TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                code_verifier: verifier
            })
        });

        const data = await response.json();

        if (data.access_token) {
            settings.spotifyClientId = clientId;
            settings.spotifyAccessToken = data.access_token;
            settings.spotifyRefreshToken = data.refresh_token || settings.spotifyRefreshToken;
            settings.spotifyTokenExpiry = Date.now() + (data.expires_in * 1000);
            settings.spotifyEnabled = true;
            saveSettings();

            localStorage.removeItem(STORAGE_VERIFIER_KEY);
            cleanUrl();

            toastr.success('Spotify connected successfully to RP World Music!', 'RP World Music');
            console.log('[RP-Music] Spotify connected successfully.');
        } else {
            console.error('[RP-Music] Spotify token exchange failed:', data);
            toastr.error(`Token exchange failed: ${data.error_description || data.error}`, 'RP World Music');
            cleanUrl();
        }
    } catch (err) {
        console.error('[RP-Music] Spotify token request error:', err);
        cleanUrl();
    }
}

/**
 * Gets a valid access token, auto-refreshing if expired
 */
export async function getValidAccessToken() {
    const settings = getSettings();
    if (!settings.spotifyAccessToken) return null;

    // Check if token has expired or is about to expire in the next 60 seconds
    if (Date.now() > (settings.spotifyTokenExpiry - 60000)) {
        if (!settings.spotifyRefreshToken) return null;
        try {
            const response = await fetch(SPOTIFY_CONFIG.TOKEN_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: settings.spotifyClientId,
                    grant_type: 'refresh_token',
                    refresh_token: settings.spotifyRefreshToken
                })
            });

            const data = await response.json();
            if (data.access_token) {
                settings.spotifyAccessToken = data.access_token;
                if (data.refresh_token) settings.spotifyRefreshToken = data.refresh_token;
                settings.spotifyTokenExpiry = Date.now() + (data.expires_in * 1000);
                saveSettings();
                return data.access_token;
            }
        } catch (err) {
            console.error('[RP-Music] Failed to refresh Spotify token:', err);
            return null;
        }
    }

    return settings.spotifyAccessToken;
}

/**
 * Disconnect Spotify
 */
export function disconnectSpotify() {
    const settings = getSettings();
    settings.spotifyEnabled = false;
    settings.spotifyAccessToken = '';
    settings.spotifyRefreshToken = '';
    settings.spotifyTokenExpiry = 0;
    saveSettings();
    toastr.info('Spotify disconnected.', 'RP World Music');
}

/**
 * Search Spotify catalog for a track with intelligent ranking:
 * - Prioritizes official original tracks using Spotify popularity scores (0-100)
 * - Explicitly matches target artist when specified
 * - Filters out unwanted covers, karaoke, tributes, and instrumentals
 */
export async function searchSpotifyTrack(query, targetArtist = null) {
    const token = await getValidAccessToken();
    if (!token || !query) return null;

    let cleanQuery = query.trim();
    let artistFilter = targetArtist;

    // Separate "by" if query is "Song by Artist"
    if (!artistFilter && /\s+by\s+/i.test(cleanQuery)) {
        const parts = cleanQuery.split(/\s+by\s+/i);
        cleanQuery = parts[0].trim();
        artistFilter = parts[1].trim();
    } else if (!artistFilter && /\s*[-–—]\s*/.test(cleanQuery)) {
        const parts = cleanQuery.split(/\s*[-–—]\s*/);
        if (parts.length === 2) {
            artistFilter = parts[0].trim();
            cleanQuery = parts[1].trim();
        }
    }

    try {
        // Construct optimized Spotify query
        const searchQuery = artistFilter 
            ? `${cleanQuery} ${artistFilter}` 
            : cleanQuery;

        const response = await fetch(`${SPOTIFY_CONFIG.API_BASE}/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=20`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) return null;

        const data = await response.json();
        const items = data.tracks?.items || [];
        if (items.length === 0) return null;

        const wantsCover = /cover/i.test(query);
        const wantsRemix = /remix/i.test(query);
        const wantsKaraoke = /karaoke/i.test(query);
        const wantsInstrumental = /instrumental/i.test(query);

        // Score and rank all 20 candidates
        const scoredItems = items.map(item => {
            let score = item.popularity || 0; // Baseline popularity score (0-100)

            const itemTitleLower = (item.name || '').toLowerCase();
            const artistNames = (item.artists || []).map(a => (a.name || '').toLowerCase());
            const combinedArtists = artistNames.join(' ');

            // Penalize cover / karaoke / tribute / instrumental if user didn't ask for it
            if (!wantsCover && (itemTitleLower.includes('cover') || artistNames.some(a => a.includes('cover') || a.includes('tribute')))) {
                score -= 70;
            }
            if (!wantsKaraoke && (itemTitleLower.includes('karaoke') || combinedArtists.includes('karaoke'))) {
                score -= 90;
            }
            if (!wantsInstrumental && itemTitleLower.includes('instrumental')) {
                score -= 40;
            }
            if (!wantsRemix && (itemTitleLower.includes('remix') || itemTitleLower.includes('edit'))) {
                score -= 25;
            }
            if (itemTitleLower.includes('tribute') || itemTitleLower.includes('in the style of')) {
                score -= 80;
            }

            // Strong bonus if the artist matches what the user specified
            if (artistFilter) {
                const cleanTargetArtist = artistFilter.toLowerCase();
                const directArtistMatch = artistNames.some(a => a.includes(cleanTargetArtist) || cleanTargetArtist.includes(a));
                if (directArtistMatch) {
                    score += 60;
                } else {
                    score -= 40;
                }
            }

            // Bonus if title matches closely
            const cleanTitleLower = cleanQuery.toLowerCase();
            if (itemTitleLower === cleanTitleLower) {
                score += 35;
            } else if (itemTitleLower.startsWith(cleanTitleLower)) {
                score += 15;
            }

            return { item, score };
        });

        // Sort descending by highest score
        scoredItems.sort((a, b) => b.score - a.score);
        const bestMatch = scoredItems[0]?.item;
        if (!bestMatch) return null;

        console.log(`[RP-Music] Selected best Spotify match: "${bestMatch.name}" by ${bestMatch.artists.map(a => a.name).join(', ')} (Popularity: ${bestMatch.popularity})`);

        // Fetch artist genre from Spotify for rich RP context
        let genreStr = '';
        try {
            const primaryArtistId = bestMatch.artists?.[0]?.id;
            if (primaryArtistId) {
                const aRes = await fetch(`${SPOTIFY_CONFIG.API_BASE}/artists/${primaryArtistId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (aRes.ok) {
                    const aData = await aRes.json();
                    if (aData.genres && aData.genres.length > 0) {
                        genreStr = aData.genres.slice(0, 3).join(', ');
                    }
                }
            }
        } catch (_) {}

        return {
            id: bestMatch.id,
            title: bestMatch.name,
            artist: bestMatch.artists.map(a => a.name).join(', '),
            album: bestMatch.album.name,
            albumArt: bestMatch.album.images?.[0]?.url || bestMatch.album.images?.[1]?.url || '',
            uri: bestMatch.uri,
            duration: Math.round(bestMatch.duration_ms / 1000),
            externalUrl: bestMatch.external_urls?.spotify || '',
            genre: genreStr || 'Music'
        };
    } catch (err) {
        console.error('[RP-Music] Spotify search failed:', err);
        return null;
    }
}

/**
 * Fetch available Spotify Connect devices
 */
export async function getSpotifyDevices() {
    const token = await getValidAccessToken();
    if (!token) return [];

    try {
        const res = await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player/devices`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.devices || [];
    } catch (_) {
        return [];
    }
}

let spotifyWebPlayer = null;
export let webPlayerDeviceId = null;

/**
 * Initializes in-browser Spotify Web Playback SDK so audio streams directly in SillyTavern
 */
export function initSpotifyWebPlayer() {
    if (typeof window === 'undefined' || document.getElementById('spotify-player-sdk')) return;

    const script = document.createElement('script');
    script.id = 'spotify-player-sdk';
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
        const settings = getSettings();
        if (!settings.spotifyAccessToken) return;

        try {
            const player = new Spotify.Player({
                name: 'SillyTavern RP Music',
                getOAuthToken: async cb => {
                    const token = await getValidAccessToken();
                    cb(token);
                },
                volume: 0.65
            });

            player.addListener('ready', ({ device_id }) => {
                console.log('[RP-Music] In-browser Spotify Web Player ready with Device ID:', device_id);
                webPlayerDeviceId = device_id;
                toastr.success('In-browser Spotify Player ready! Audio plays directly in this tab without opening any apps.', 'RP World Music');
            });

            player.addListener('not_ready', ({ device_id }) => {
                if (webPlayerDeviceId === device_id) webPlayerDeviceId = null;
            });

            player.addListener('initialization_error', ({ message }) => {
                console.warn('[RP-Music] Web Player init notice (embed player active for mobile):', message);
            });

            player.connect();
            spotifyWebPlayer = player;
        } catch (e) {
            console.warn('[RP-Music] Web Playback SDK notice:', e);
        }
    };
}

/**
 * Send Play Command to active or available Spotify Connect device
 */
export async function playSpotifyUri(uri) {
    const token = await getValidAccessToken();
    if (!token) return false;

    try {
        // 1. If in-browser SDK is ready, target it directly so audio plays inside SillyTavern
        const targetDeviceId = webPlayerDeviceId || null;
        const playUrl = targetDeviceId 
            ? `${SPOTIFY_CONFIG.API_BASE}/me/player/play?device_id=${targetDeviceId}`
            : `${SPOTIFY_CONFIG.API_BASE}/me/player/play`;

        let response = await fetch(playUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uris: [uri] })
        });

        // 2. If 404 (No active device), find any open/idle Spotify device and transfer playback to it
        if (response.status === 404) {
            const devices = await getSpotifyDevices();
            if (devices && devices.length > 0) {
                const target = devices.find(d => d.is_active) || devices.find(d => !d.is_restricted) || devices[0];
                if (target) {
                    console.log(`[RP-Music] Auto-targeting Spotify device: ${target.name} (${target.id})`);
                    response = await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player/play?device_id=${target.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ uris: [uri] })
                    });
                }
            }
        }

        // Return whether Connect API started playback successfully
        return response.ok || response.status === 204;
    } catch (err) {
        console.error('[RP-Music] Spotify play command failed:', err);
        return false;
    }
}

/**
 * Pause Spotify playback
 */
export async function pauseSpotify() {
    const token = await getValidAccessToken();
    if (!token) return false;

    try {
        const res = await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player/pause`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.ok || res.status === 204;
    } catch (_) {
        return false;
    }
}

/**
 * Resume Spotify playback
 */
export async function resumeSpotify() {
    const token = await getValidAccessToken();
    if (!token) return false;

    try {
        const res = await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player/play`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.ok || res.status === 204;
    } catch (_) {
        return false;
    }
}

/**
 * Set Spotify Volume (0.0 to 1.0)
 */
export async function setSpotifyVolume(vol) {
    const token = await getValidAccessToken();
    if (!token) return false;

    const percent = Math.round(Math.max(0, Math.min(1, vol)) * 100);
    try {
        await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player/volume?volume_percent=${percent}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return true;
    } catch (_) {
        return false;
    }
}

/* ========================================================================= */
/*  PKCE Cryptographic Helper Functions                                      */
/* ========================================================================= */

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function cleanUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    window.history.replaceState({}, document.title, url.pathname);
}
