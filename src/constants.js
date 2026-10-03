/**
 * RP World Music - Constants & Default Configuration
 * Hybrid Mode: Spotify Connect API + Local Audio + Procedural Ambient Synth
 */

export const MODULE_NAME = 'rp_world_music';
export const EXTENSION_PROMPT_ID = 'rp_world_music_env';

export const SPOTIFY_CONFIG = {
    AUTH_ENDPOINT: 'https://accounts.spotify.com/authorize',
    TOKEN_ENDPOINT: 'https://accounts.spotify.com/api/token',
    API_BASE: 'https://api.spotify.com/v1',
    SCOPES: [
        'streaming',
        'user-read-email',
        'user-read-private',
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing'
    ]
};

export const DEFAULT_DEVICES = {
    'iPod': {
        name: 'iPod',
        icon: 'fa-solid fa-mobile-screen',
        description: 'Personal digital MP3 player with click wheel and earbuds.',
        tracks: [
            { id: 'lost_kitten', title: 'Lost Kitten', artist: 'Metric', mood: 'melancholy', url: '', duration: 198 },
            { id: 'ocean_drive', title: 'Ocean Drive', artist: 'Duke Dumont', mood: 'chill', url: '', duration: 206 },
            { id: 'old_memories', title: 'Old Memories', artist: 'Lofi Dreams', mood: 'melancholy', url: '', duration: 175 },
            { id: 'resonance', title: 'Resonance', artist: 'HOME', mood: 'chill', url: '', duration: 212 },
            { id: 'after_dark', title: 'After Dark', artist: 'Mr.Kitty', mood: 'dark', url: '', duration: 257 }
        ]
    },
    'Radio': {
        name: 'Radio',
        icon: 'fa-solid fa-radio',
        description: 'FM/AM Radio receiver playing broadcasted music and talk stations.',
        tracks: [
            { id: 'midnight_fm', title: 'Midnight FM Broadcast', artist: 'Radio Waves', mood: 'chill', url: '', duration: 240 },
            { id: 'golden_oldies', title: 'Golden Oldies 70s Rock', artist: 'Classic Rock Station', mood: 'cheerful', url: '', duration: 210 },
            { id: 'static_jazz', title: 'Late Night Static Jazz', artist: 'FM 98.5', mood: 'melancholy', url: '', duration: 280 },
            { id: 'city_pop', title: 'City Pop Radio Jam', artist: 'Midnight Tokyo', mood: 'cheerful', url: '', duration: 225 }
        ]
    },
    'Cassette': {
        name: 'Cassette Player',
        icon: 'fa-solid fa-tape',
        description: 'Vintage cassette tape player / Walkman with warm analog hiss.',
        tracks: [
            { id: 'summer_tape_84', title: "Summer Mixtape '84", artist: 'Analog Kids', mood: 'nostalgic', url: '', duration: 230 },
            { id: 'faded_memories', title: 'Faded Tape Memories', artist: 'Cassette Master', mood: 'melancholy', url: '', duration: 195 },
            { id: 'lofi_rain_tape', title: 'Lofi Rain Beats', artist: 'Tape Deck Beats', mood: 'chill', url: '', duration: 215 }
        ]
    },
    'Speaker': {
        name: 'Bluetooth Speaker',
        icon: 'fa-solid fa-volume-high',
        description: 'Portable wireless speaker filling the entire room with music.',
        tracks: [
            { id: 'cafe_acoustic', title: 'Acoustic Cafe Session', artist: 'Coffeehouse Duo', mood: 'calm', url: '', duration: 220 },
            { id: 'chillhop_beats', title: 'Chillhop Beats to Relax', artist: 'Chill Beats', mood: 'chill', url: '', duration: 245 },
            { id: 'party_groove', title: 'Neon Nightclub Groove', artist: 'Synth Syndicate', mood: 'energetic', url: '', duration: 190 }
        ]
    },
    'Vinyl': {
        name: 'Vinyl Record Player',
        icon: 'fa-solid fa-compact-disc',
        description: 'Turntable with warm crackle and rich analog acoustics.',
        tracks: [
            { id: 'autumn_jazz', title: 'Autumn Leaves in New York', artist: 'Classic Quartet', mood: 'romantic', url: '', duration: 310 },
            { id: 'moonlight_sonata', title: 'Moonlight Sonata (Vinyl)', artist: 'Beethoven', mood: 'melancholy', url: '', duration: 340 },
            { id: 'vintage_blues', title: '1940s Rainy Day Blues', artist: 'Delta Records', mood: 'melancholy', url: '', duration: 235 }
        ]
    }
};

export const DEFAULT_SETTINGS = {
    enabled: true,
    autoDetection: true,
    aiAwareness: true,
    musicMemory: true,
    moodMatching: true,
    defaultVolume: 0.65,
    promptDepth: 1,
    promptPosition: 1, // extension_prompt_types.IN_CHAT
    promptTemplate: `[RP Environment Update: A song called "{{songTitle}}" by {{artist}} (Genre: {{genre}}, Mood: {{mood}}) is currently playing aloud from {{user}}'s {{device}} (Volume: {{volume}}%). Nearby characters can hear the music and lyrics clearly, and may react naturally to the song's genre, rhythm, melody, or specific lyrics (e.g., singing along, humming, commenting on the lyrics/meaning, or reacting to the genre).]`,
    memoryTemplate: `[Character Memory Note: This song ("{{songTitle}}") has played {{timesPlayed}} times in this conversation (first heard {{relativeTime}}). Nearby characters might recognize it or recall earlier memories associated with this song.]`,
    stopTemplate: `[RP Environment Update: The music playing from the {{device}} has been stopped or turned off. The surroundings are now quiet.]`,
    currentDevice: 'iPod',
    showPlayerCard: true,
    showChatNotifications: true,
    useSynthFallback: true, // Use procedural WebAudio synth if no audio file is provided

    // Hybrid Spotify Configuration
    audioSource: 'hybrid', // 'hybrid' | 'spotify' | 'local'
    spotifyEnabled: false,
    spotifyClientId: '',
    spotifyAccessToken: '',
    spotifyRefreshToken: '',
    spotifyTokenExpiry: 0,
    spotifyDeviceId: '',

    devices: DEFAULT_DEVICES
};

export const RP_TRIGGER_WORDS = {
    verbs: [
        'turn on', 'turns on', 'turning on', 'turned on',
        'switch on', 'switches on', 'switched on',
        'power on', 'powers on', 'powered on',
        'activate', 'activates', 'activating', 'activated',
        'put on', 'puts on', 'putting on',
        'play', 'plays', 'playing', 'played',
        'listen to', 'listens to', 'listening to', 'listened to',
        'start up', 'starts up', 'started up',
        'crank up', 'cranks up', 'cue up', 'cues up',
        // Thai language verbs
        'เปิดเพลง', 'เปิดลำโพง', 'เปิดวิทยุ', 'เปิดเครื่อง', 'เล่นเพลง', 'ฟังเพลง', 'เปิด'
    ],
    stopVerbs: [
        'turn off', 'turns off', 'turning off', 'turned off',
        'switch off', 'switches off', 'switched off',
        'shut off', 'shuts off', 'shutting off',
        'power off', 'powers off', 'powered off',
        'stop', 'stops', 'stopping', 'stopped',
        'pause', 'pauses', 'pausing', 'paused',
        'mute', 'mutes', 'muting', 'muted',
        'take off', 'takes off', 'unplug', 'unplugs',
        // Thai language stop verbs
        'ปิดเพลง', 'หยุดเพลง', 'ปิดลำโพง', 'ปิดวิทยุ', 'หยุดเล่น', 'ปิดเครื่อง', 'ปิด'
    ],
    deviceKeywords: {
        'iPod': ['ipod', 'mp3 player', 'mp3', 'clickwheel', 'earbuds', 'earphone', 'earphones', 'ไอพอด', 'หูฟัง'],
        'Radio': ['radio', 'boombox', 'fm radio', 'am radio', 'station', 'stereo', 'car radio', 'car stereo', 'tuner', 'วิทยุ'],
        'Cassette': ['cassette', 'cassette player', 'walkman', 'tape player', 'tape deck', 'mixtape', 'tape', 'เทป', 'คาสเซ็ท', 'วอล์กแมน'],
        'Speaker': ['speaker', 'speakers', 'bluetooth speaker', 'sound system', 'phone speaker', 'phone', 'smartphone', 'iphone', 'android', 'ลำโพง', 'โทรศัพท์', 'มือถือ', 'บลูทูธ'],
        'Vinyl': ['vinyl', 'record player', 'turntable', 'gramophone', 'phonograph', 'lp record', 'แผ่นเสียง', 'เครื่องเล่นแผ่นเสียง']
    },
    moodKeywords: {
        'melancholy': ['rain', 'raining', 'crying', 'tears', 'sad', 'sorrow', 'alone', 'lonely', 'miss you', 'grief', 'heartbreak', 'gloomy', 'ฝน', 'ร้องไห้', 'เศร้า', 'เหงา', 'เสียใจ', 'คิดถึง'],
        'chill': ['chill', 'relax', 'study', 'night', 'stars', 'bed', 'cozy', 'warm', 'tea', 'coffee', 'evening', 'rest', 'ชิล', 'พักผ่อน', 'ผ่อนคลาย', 'นอน', 'ดึก', 'สบาย'],
        'cheerful': ['happy', 'laugh', 'dancing', 'dance', 'fun', 'smile', 'celebrate', 'party', 'sunny', 'joy', 'สนุก', 'หัวเราะ', 'ปาร์ตี้', 'เต้น', 'มีความสุข'],
        'romantic': ['kiss', 'hug', 'love', 'blush', 'gentle', 'cuddle', 'intimate', 'candlelight', 'tender', 'whisper', 'รัก', 'กอด', 'จูบ', 'โรแมนติก', 'เขิน'],
        'energetic': ['fight', 'battle', 'run', 'sprint', 'danger', 'action', 'punch', 'attack', 'workout', 'clash', 'intense', 'สู้', 'ต่อสู้', 'เร็ว', 'วิ่ง', 'มันส์']
    }
};
