/**
 * RP World Music - Spotify Web API & PKCE OAuth Service
 * Enables direct Spotify search, album art retrieval, and Spotify Connect playback control.
 */

import { SPOTIFY_CONFIG } from './constants.js';
import { getSettings, saveSettings, runtimeState } from './state.js';

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

        const response = await fetch(`${SPOTIFY_CONFIG.API_BASE}/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=10`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            console.warn(`[RP-Music] Spotify search returned HTTP ${response.status}:`, await response.text().catch(() => ''));
            return null;
        }

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
            albumUri: bestMatch.album?.uri || '',
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

            // Auto-unlock browser audio on user gesture for Spotify Web Playback SDK
            const unlock = () => {
                if (player && typeof player.activateElement === 'function') {
                    player.activateElement().catch(() => {});
                }
            };
            document.addEventListener('click', unlock, { once: true });
            document.addEventListener('keydown', unlock, { once: true });
        } catch (e) {
            console.warn('[RP-Music] Web Playback SDK notice:', e);
        }
    };
}

/**
 * Send Play Command to active or available Spotify Connect device
 */
export async function playSpotifyUri(uri, albumUri = null) {
    const token = await getValidAccessToken();
    if (!token) return false;

    const playPayload = albumUri 
        ? { context_uri: albumUri, offset: { uri } } 
        : { uris: [uri] };

    try {
        const settings = getSettings();
        let devices = await getSpotifyDevices();
        if (devices.length === 0) {
            console.log('[RP-Music] No devices returned on first check, waiting 500ms...');
            await new Promise(r => setTimeout(r, 500));
            devices = await getSpotifyDevices();
        }

        console.log('[RP-Music] Available Spotify Connect devices:', devices.map(d => `${d.name} (${d.type}) [active=${d.is_active}]`));

        // Helper to verify if playback actually started
        const verifyPlayback = async (expectedUri = null) => {
            try {
                const s = await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (s.status === 200) {
                    const data = await s.json();
                    if (data.is_playing || (expectedUri && data.item?.uri === expectedUri)) {
                        return data.device?.name || 'Spotify';
                    }
                }
            } catch (_) {}
            return null;
        };

        // 1. If an active device exists (e.g. desktop app or mobile actively playing), target it directly first!
        // This gives a 100% seamless transition without dropping queues or hopping devices.
        const activeDev = devices.find(d => d.is_active);
        if (activeDev) {
            console.log(`[RP-Music] Active device found (${activeDev.name}). Performing seamless transition...`);
            const playRes = await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player/play?device_id=${activeDev.id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(playPayload)
            });

            if (playRes.ok || playRes.status === 204) {
                let activeName = null;
                for (let poll = 0; poll < 4; poll++) {
                    await new Promise(r => setTimeout(r, 600));
                    activeName = await verifyPlayback(uri);
                    if (activeName) break;
                }

                if (activeName) {
                    console.log(`[RP-Music] 🎵 Spotify playback confirmed playing on active device: ${activeName}`);
                    settings.spotifyDeviceId = activeDev.id;
                    saveSettings();
                    if (typeof toastr !== 'undefined') {
                        toastr.success(`▶️ Playing on Spotify Connect (${activeName})`, 'RP World Music', { timeOut: 3500 });
                    }
                    return true;
                }
            }
        }

        // 2. Build prioritized candidate list if no active device or active device didn't respond
        const candidates = [];

        // Active device (if any, already tried once, but included in list)
        if (activeDev) candidates.push(activeDev);

        // User choice from settings
        if (settings.spotifyDeviceId) {
            const userChoice = devices.find(d => d.id === settings.spotifyDeviceId);
            if (userChoice && !candidates.some(c => c.id === userChoice.id)) {
                candidates.push(userChoice);
            }
        }

        // Native apps (e.g. Spotify Desktop / Mobile)
        for (const d of devices) {
            if (!d.name.includes('SillyTavern') && !candidates.some(c => c.id === d.id)) {
                candidates.push(d);
            }
        }

        // In-browser Web Player (SillyTavern RP Music)
        if (webPlayerDeviceId && !candidates.some(c => c.id === webPlayerDeviceId)) {
            const webDev = devices.find(d => d.id === webPlayerDeviceId);
            if (webDev) candidates.push(webDev);
        }

        // Remaining devices
        for (const d of devices) {
            if (!candidates.some(c => c.id === d.id)) {
                candidates.push(d);
            }
        }

        console.log('[RP-Music] Candidate Spotify playback devices in order:', candidates.map(d => `${d.name} (${d.type}) [id=${d.id.slice(0, 8)}]`));

        // Try playing on candidate devices in priority order
        for (const dev of candidates) {
            if (activeDev && dev.id === activeDev.id) continue; // Already tried in step 1

            console.log(`[RP-Music] Attempting playback on candidate: ${dev.name} (${dev.id})`);
            const playRes = await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player/play?device_id=${dev.id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(playPayload)
            });

            if (playRes.ok || playRes.status === 204) {
                let activeName = null;
                for (let poll = 0; poll < 4; poll++) {
                    await new Promise(r => setTimeout(r, 600));
                    activeName = await verifyPlayback(uri);
                    if (activeName) break;
                }

                if (activeName) {
                    console.log(`[RP-Music] 🎵 Spotify playback confirmed playing on: ${activeName}`);
                    settings.spotifyDeviceId = dev.id;
                    saveSettings();
                    if (typeof toastr !== 'undefined') {
                        toastr.success(`▶️ Playing on Spotify Connect (${activeName})`, 'RP World Music', { timeOut: 3500 });
                    }
                    return true;
                }
                console.warn(`[RP-Music] Device ${dev.name} returned 204, but was not playing. Trying next device...`);
            }

            // If direct play didn't start, try explicit transfer with play: true
            try {
                const transferRes = await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ device_ids: [dev.id], play: true })
                });

                if (transferRes.ok || transferRes.status === 204) {
                    await new Promise(r => setTimeout(r, 400));
                    const retryRes = await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player/play?device_id=${dev.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(playPayload)
                    });

                    if (retryRes.ok || retryRes.status === 204) {
                        let activeName = null;
                        for (let poll = 0; poll < 4; poll++) {
                            await new Promise(r => setTimeout(r, 600));
                            activeName = await verifyPlayback(uri);
                            if (activeName) break;
                        }
                        if (activeName) {
                            console.log(`[RP-Music] 🎵 Spotify playback confirmed after transfer on: ${activeName}`);
                            settings.spotifyDeviceId = dev.id;
                            saveSettings();
                            if (typeof toastr !== 'undefined') {
                                toastr.success(`▶️ Playing on Spotify Connect (${activeName})`, 'RP World Music', { timeOut: 3500 });
                            }
                            return true;
                        }
                    }
                }
            } catch (_) {}
        }

        // General player endpoint fallback (if no specific device succeeded)
        const generalRes = await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player/play`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(playPayload)
        });

        if (generalRes.ok || generalRes.status === 204) {
            let activeName = null;
            for (let poll = 0; poll < 3; poll++) {
                await new Promise(r => setTimeout(r, 600));
                activeName = await verifyPlayback(uri);
                if (activeName) break;
            }
            if (activeName) {
                console.log(`[RP-Music] 🎵 Spotify playback confirmed via default player: ${activeName}`);
                if (typeof toastr !== 'undefined') {
                    toastr.success(`▶️ Playing on Spotify Connect (${activeName})`, 'RP World Music', { timeOut: 3500 });
                }
                return true;
            }
        }

        // None of the devices confirmed actually playing
        console.warn('[RP-Music] All Spotify Connect devices returned idle or inactive.');
        if (typeof toastr !== 'undefined') {
            toastr.warning('⚠️ Spotify app is idle. Please select or click play in your Spotify app (or on the player card) to wake it up.', 'RP World Music', { timeOut: 7000 });
        }

        return false;
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

    const settings = getSettings();
    const devParam = settings.spotifyDeviceId ? `?device_id=${settings.spotifyDeviceId}` : '';

    try {
        const res = await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player/pause${devParam}`, {
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
export async function resumeSpotify(uri = null, albumUri = null) {
    const token = await getValidAccessToken();
    if (!token) return false;

    const settings = getSettings();
    const devParam = settings.spotifyDeviceId ? `?device_id=${settings.spotifyDeviceId}` : '';

    try {
        let body = undefined;
        if (uri) {
            const playPayload = albumUri
                ? { context_uri: albumUri, offset: { uri } }
                : { uris: [uri] };
            body = JSON.stringify(playPayload);
        }
        const res = await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player/play${devParam}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            ...(body ? { body } : {})
        });
        if (res.ok || res.status === 204) return true;

        if (!uri && runtimeState.currentSong?.uri) {
            return await resumeSpotify(runtimeState.currentSong.uri, runtimeState.currentSong.albumUri);
        }
        return false;
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

    const settings = getSettings();
    const devParam = settings.spotifyDeviceId ? `&device_id=${settings.spotifyDeviceId}` : '';
    const percent = Math.round(Math.max(0, Math.min(1, vol)) * 100);

    try {
        await fetch(`${SPOTIFY_CONFIG.API_BASE}/me/player/volume?volume_percent=${percent}${devParam}`, {
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
