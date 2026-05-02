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

export interface EmbeddedMpvSupport {
    supported: boolean;
    platform: string;
    reason?: string;
}

export interface EmbeddedMpvAudioTrack {
    id: number;
    title?: string;
    language?: string;
    selected: boolean;
    defaultTrack?: boolean;
    forced?: boolean;
}

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
    startedAt: string;
    updatedAt: string;
    error?: string;
}
