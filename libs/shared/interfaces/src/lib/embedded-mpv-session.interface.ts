export type EmbeddedMpvSessionStatus =
    | 'idle'
    | 'loading'
    | 'playing'
    | 'paused'
    | 'error'
    | 'closed';

export interface EmbeddedMpvBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface EmbeddedMpvCapabilities {
    subtitles: boolean;
    playbackSpeed: boolean;
    aspectOverride: boolean;
    screenshot: boolean;
}

export interface EmbeddedMpvSupport {
    supported: boolean;
    platform: string;
    reason?: string;
    capabilities?: EmbeddedMpvCapabilities;
}

export interface EmbeddedMpvAudioTrack {
    id: number;
    title?: string;
    language?: string;
    selected: boolean;
    defaultTrack?: boolean;
    forced?: boolean;
}

export type EmbeddedMpvSubtitleTrack = EmbeddedMpvAudioTrack;

export interface EmbeddedMpvSession {
    id: string;
    title: string;
    streamUrl: string;
    status: EmbeddedMpvSessionStatus;
    positionSeconds: number;
    durationSeconds: number | null;
    volume: number;
    audioTracks: EmbeddedMpvAudioTrack[];
    selectedAudioTrackId: number | null;
    subtitleTracks: EmbeddedMpvSubtitleTrack[];
    selectedSubtitleTrackId: number | null;
    playbackSpeed: number;
    aspectOverride: string;
    startedAt: string;
    updatedAt: string;
    error?: string;
}
