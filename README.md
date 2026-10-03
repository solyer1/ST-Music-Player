# 🎵 RP World Music (Hybrid Edition)

An immersion roleplay extension for **SillyTavern** that allows characters and the user to experience music inside the story world. Music exists as an audible, physical presence in the environment that characters perceive, react to, and remember.

Operates in **Hybrid Mode**: seamless integration with **Spotify Connect** (to play real songs on your Spotify desktop/mobile app) with built-in fallback to **Local Audio Files** and **Procedural Ambient Synthesis**.

---

## ✨ Features

1. **🎭 Natural Language RP Action Detection**
   - Automatically detects when you or characters turn on audio devices or play music in chat:
     - *"I take out my iPod and turn it on"* ➔ starts iPod playlist.
     - *"I put on Lost Kitten on my iPod"* ➔ plays that exact song.
     - *"I switch off the radio"* ➔ stops music and updates environment context.
2. **🟢 Spotify Connect API (Remote Playback)**
   - Connects directly to Spotify via secure client-side PKCE OAuth (no backend needed).
   - Searches Spotify's global catalog, fetches real album covers, and starts playback directly on your active Spotify app.
3. **📁 Local Audio & Procedural Synth Fallback**
   - If Spotify is disconnected or offline, plays local audio files (`.mp3`, `.wav`, `.ogg`, `.flac`) or uses the built-in procedural WebAudio ambient synthesizer.
4. **📻 Device Playlist System**
   - Dedicated playlists and sound profiles for **iPod**, **Radio**, **Cassette/Walkman**, **Bluetooth Speaker**, and **Vinyl Record Player**.
5. **🧠 AI Character Awareness (Hidden Prompt Injection)**
   - Automatically injects environment state into the LLM context:
     ```text
     [RP Environment Update: A song called "Lost Kitten" by Metric is currently playing aloud from User's iPod. Nearby characters can hear the music clearly and may react naturally.]
     ```
6. **⏳ Music Memory System**
   - Characters remember songs played in previous turns of the chat:
     ```text
     [Character Memory Note: This song ("Lost Kitten") has played 3 times in this conversation. Nearby characters might recognize it.]
     ```
7. **🌧️ Mood-Based Song Selection**
   - Detects scene atmosphere (*rain, sadness, battle, celebration, romance*) and matches suitable playlist tracks.
8. **🎛️ In-Chat & Floating Music Player**
   - Interactive glassmorphic player card with:
     - Real Spotify album art or retro spinning vinyl animation
     - Play / Pause / Next / Previous controls
     - Interactive scrub/seek slider with time display (`2:14 / 4:32`)
     - Volume slider & device switcher
     - Minimizable floating toggle pill
9. **⌨️ Slash Commands**
   - `/music [song name]` — play or search for a song
   - `/stopmusic` — stop playing and quiet the room
   - `/nextsong` & `/prevsong` — skip tracks
   - `/playlist [device]` — view device tracklist

---

## 🚀 How to Install & Share with Others

### For Yourself (Already Installed!):
The extension is located at:
```text
data/default-user/extensions/sillytavern-rp-music/
```
Refresh SillyTavern or click **Extensions** ➔ you will see **RP World Music** active in your UI and settings.

### To Share with Other Users:
1. Create a public repository on GitHub (e.g. `https://github.com/YourUsername/sillytavern-rp-music`).
2. Push this folder's contents to the repository.
3. Other users simply:
   - Open **SillyTavern** ➔ Click the **Extensions 🧩** menu.
   - Click **Install Extension**.
   - Paste your GitHub URL and click **Install**!

---

## 🟢 Setting Up Spotify (Optional 2-Minute Setup)

To enable real Spotify playback:
1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create App**:
   - **App Name**: `SillyTavern RP Music`
   - **App Description**: `Music extension for SillyTavern`
   - **Redirect URI**: `http://localhost:8000/` (or your SillyTavern address)
   - Which API/SDKs are you planning to use?: Select **Web API**.
3. Copy your **Client ID**.
4. In SillyTavern, open **Extensions** ➔ **RP World Music** ➔ Paste your **Client ID** into the box ➔ Click **Connect Spotify**.
5. Make sure your Spotify desktop app, mobile app, or web player is open. Any song you trigger in RP will now play through your Spotify!

---

## 📁 Adding Local Songs

Drop your own music files into:
* `music/iPod/`
* `music/Radio/`
* `music/Cassette/`
* `music/Speaker/`
* `music/Vinyl/`

Or use the **"Choose Local File"** button in the extension's settings panel.

---

## 💬 Roleplay Example Phrases

* `*I take my iPod out of my pocket and turn it on.*`
* `*She walks over to the vinyl player and puts on Autumn Leaves.*`
* `*I click play on Lost Kitten through my speaker.*`
* `*I switch off the radio and sit down in silence.*`
