type AudioSessionType = 'auto' | 'playback' | 'transient' | 'ambient' | 'none';

interface NavigatorWithAudioSession {
  audioSession?: { type: AudioSessionType };
}

/**
 * Ask the platform to treat this app's audio as playback audio. On iOS this
 * keeps sound playing when the silent switch is on.
 */
export function preferPlaybackAudioSession(): void {
  const nav = navigator as Navigator & NavigatorWithAudioSession;
  if (nav.audioSession) {
    nav.audioSession.type = 'playback';
  }
}
