import {
    DestroyRef,
    Injectable,
    effect,
    inject,
    signal,
    untracked,
} from '@angular/core';
import {
    EmbeddedMpvSession,
    EmbeddedMpvSupport,
    ResolvedPortalPlayback,
} from 'shared-interfaces';
import { HIDDEN_BOUNDS, measureBounds } from './embedded-mpv-format.utils';

const STALLED_TIMEOUT_MS = 30_000;

@Injectable()
export class EmbeddedMpvSessionController {
    readonly support = signal<EmbeddedMpvSupport | null>(null);
    readonly session = signal<EmbeddedMpvSession | null>(null);
    readonly sessionId = signal<string | null>(null);
    readonly stalled = signal(false);
    readonly retryToken = signal(0);

    private readonly destroyRef = inject(DestroyRef);
    private readonly unsubscribeSessionUpdate?: () => void;

    private overlayActiveProvider: () => boolean = () => false;
    private activeBoundsSync: (() => void) | null = null;
    private boundsAnimationFrame: number | null = null;
    private stalledTimer: number | null = null;

    constructor() {
        this.unsubscribeSessionUpdate =
            window.electron?.onEmbeddedMpvSessionUpdate?.((session) => {
                if (session.id !== this.sessionId()) {
                    return;
                }
                this.session.set(session);
            });

        if (window.electron?.getEmbeddedMpvSupport) {
            void this.loadSupport();
        } else {
            this.support.set({
                supported: false,
                platform: typeof window === 'undefined' ? 'web' : 'unknown',
                reason: 'Embedded MPV requires the Electron desktop build.',
            });
        }

        effect(() => {
            const status = this.session()?.status ?? null;
            untracked(() => this.handleStalledTracking(status));
        });

        this.destroyRef.onDestroy(() => {
            this.unsubscribeSessionUpdate?.();
            this.cancelStalledTimer();
            if (this.boundsAnimationFrame !== null) {
                cancelAnimationFrame(this.boundsAnimationFrame);
                this.boundsAnimationFrame = null;
            }
        });
    }

    setOverlayActiveProvider(provider: () => boolean): void {
        this.overlayActiveProvider = provider;
    }

    triggerBoundsSync(): void {
        this.activeBoundsSync?.();
    }

    retry(): void {
        this.stalled.set(false);
        this.session.set(null);
        this.sessionId.set(null);
        this.retryToken.update((value) => value + 1);
    }

    /**
     * Spin up an embedded MPV session bound to `host`. Returns a teardown
     * function the caller must invoke when the host or playback changes (or
     * the component tears down). All bounds and lifecycle bookkeeping lives
     * here so the component can stay view-focused.
     */
    startSession(
        host: HTMLElement,
        playback: ResolvedPortalPlayback,
        initialVolume: number
    ): () => void {
        let disposed = false;
        let activeSessionId: string | null = null;

        const syncBounds = () => {
            if (!activeSessionId) {
                return;
            }
            const bounds = this.overlayActiveProvider()
                ? HIDDEN_BOUNDS
                : measureBounds(host);
            void window.electron
                ?.setEmbeddedMpvBounds(activeSessionId, bounds)
                .catch(() => undefined);
        };

        const scheduleBoundsSync = () => {
            if (this.boundsAnimationFrame !== null) {
                cancelAnimationFrame(this.boundsAnimationFrame);
            }
            this.boundsAnimationFrame = requestAnimationFrame(() => {
                this.boundsAnimationFrame = null;
                syncBounds();
            });
        };

        this.activeBoundsSync = scheduleBoundsSync;

        const resizeObserver = new ResizeObserver(() => scheduleBoundsSync());
        resizeObserver.observe(host);
        window.addEventListener('resize', scheduleBoundsSync);
        window.addEventListener('scroll', scheduleBoundsSync, true);

        const create = async () => {
            this.session.set(this.createLoadingSession(playback, initialVolume));
            await this.waitForStartupPaint();
            if (disposed) {
                return;
            }

            const prepared = await window.electron!.prepareEmbeddedMpv?.();
            if (disposed) {
                return;
            }
            if (prepared && !prepared.supported) {
                throw new Error(
                    prepared.reason ??
                        'Embedded MPV is not available in this environment.'
                );
            }
            if (prepared) {
                this.support.set(prepared);
            }

            const created = await window.electron!.createEmbeddedMpvSession(
                measureBounds(host),
                playback.title,
                initialVolume
            );

            if (disposed) {
                await window.electron!.disposeEmbeddedMpvSession(created.id);
                return;
            }

            activeSessionId = created.id;
            this.sessionId.set(created.id);
            this.session.set(created);
            await window.electron!.loadEmbeddedMpvPlayback(created.id, playback);
            scheduleBoundsSync();
        };

        void create().catch((error) =>
            this.session.set(this.createErrorSession(playback, initialVolume, error))
        );

        return () => {
            disposed = true;
            resizeObserver.disconnect();
            window.removeEventListener('resize', scheduleBoundsSync);
            window.removeEventListener('scroll', scheduleBoundsSync, true);

            if (this.activeBoundsSync === scheduleBoundsSync) {
                this.activeBoundsSync = null;
            }
            if (this.boundsAnimationFrame !== null) {
                cancelAnimationFrame(this.boundsAnimationFrame);
                this.boundsAnimationFrame = null;
            }

            const id = activeSessionId;
            activeSessionId = null;
            this.sessionId.set(null);
            this.session.set(null);

            if (id) {
                void window.electron?.disposeEmbeddedMpvSession(id);
            }
        };
    }

    async togglePaused(): Promise<void> {
        const session = this.session();
        if (!session?.id || !window.electron?.setEmbeddedMpvPaused) {
            return;
        }
        const updated = await window.electron.setEmbeddedMpvPaused(
            session.id,
            session.status !== 'paused'
        );
        if (updated) {
            this.session.set(updated);
        }
    }

    async seekBy(deltaSeconds: number): Promise<boolean> {
        const session = this.session();
        if (!session?.id || !window.electron?.seekEmbeddedMpv) {
            return false;
        }
        const next = Math.max(0, session.positionSeconds + deltaSeconds);
        const updated = await window.electron.seekEmbeddedMpv(session.id, next);
        if (updated) {
            this.session.set(updated);
        }
        return true;
    }

    async seekTo(seconds: number): Promise<void> {
        const session = this.session();
        if (!session?.id || !window.electron?.seekEmbeddedMpv) {
            return;
        }
        const updated = await window.electron.seekEmbeddedMpv(session.id, seconds);
        if (updated) {
            this.session.set(updated);
        }
    }

    async applyVolume(value: number): Promise<void> {
        const session = this.session();
        if (!session?.id || !window.electron?.setEmbeddedMpvVolume) {
            return;
        }
        const updated = await window.electron.setEmbeddedMpvVolume(session.id, value);
        if (updated) {
            this.session.set(updated);
        }
    }

    async setAudioTrack(trackId: number): Promise<void> {
        const session = this.session();
        if (!session?.id || !window.electron?.setEmbeddedMpvAudioTrack) {
            return;
        }
        const updated = await window.electron.setEmbeddedMpvAudioTrack(
            session.id,
            trackId
        );
        if (updated) {
            this.session.set(updated);
        }
    }

    async setSubtitleTrack(trackId: number): Promise<void> {
        const session = this.session();
        if (!session?.id || !window.electron?.setEmbeddedMpvSubtitleTrack) {
            return;
        }
        const updated = await window.electron.setEmbeddedMpvSubtitleTrack(
            session.id,
            trackId
        );
        if (updated) {
            this.session.set(updated);
        }
    }

    async setSpeed(speed: number): Promise<void> {
        const session = this.session();
        if (!session?.id || !window.electron?.setEmbeddedMpvSpeed) {
            return;
        }
        const updated = await window.electron.setEmbeddedMpvSpeed(session.id, speed);
        if (updated) {
            this.session.set(updated);
        }
    }

    async setAspect(aspect: string): Promise<void> {
        const session = this.session();
        if (!session?.id || !window.electron?.setEmbeddedMpvAspect) {
            return;
        }
        const updated = await window.electron.setEmbeddedMpvAspect(
            session.id,
            aspect
        );
        if (updated) {
            this.session.set(updated);
        }
    }

    private async loadSupport(): Promise<void> {
        try {
            this.support.set(await window.electron!.getEmbeddedMpvSupport());
        } catch (error) {
            this.support.set({
                supported: false,
                platform: window.electron?.platform ?? 'unknown',
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private handleStalledTracking(
        status: EmbeddedMpvSession['status'] | null
    ): void {
        if (status === 'loading') {
            if (this.stalledTimer === null) {
                this.stalledTimer = window.setTimeout(() => {
                    this.stalled.set(true);
                    this.stalledTimer = null;
                }, STALLED_TIMEOUT_MS);
            }
            return;
        }

        this.cancelStalledTimer();
        if (this.stalled()) {
            this.stalled.set(false);
        }
    }

    private cancelStalledTimer(): void {
        if (this.stalledTimer !== null) {
            clearTimeout(this.stalledTimer);
            this.stalledTimer = null;
        }
    }

    private createLoadingSession(
        playback: ResolvedPortalPlayback,
        volume: number
    ): EmbeddedMpvSession {
        const now = new Date().toISOString();
        return {
            id: 'embedded-mpv-starting',
            title: playback.title,
            streamUrl: playback.streamUrl,
            status: 'loading',
            positionSeconds: 0,
            durationSeconds: null,
            volume,
            audioTracks: [],
            selectedAudioTrackId: null,
            subtitleTracks: [],
            selectedSubtitleTrackId: null,
            playbackSpeed: 1,
            aspectOverride: 'no',
            startedAt: now,
            updatedAt: now,
        };
    }

    private createErrorSession(
        playback: ResolvedPortalPlayback,
        volume: number,
        error: unknown
    ): EmbeddedMpvSession {
        const now = new Date().toISOString();
        this.sessionId.set(null);
        return {
            id: 'embedded-mpv-error',
            title: playback.title,
            streamUrl: playback.streamUrl,
            status: 'error',
            positionSeconds: 0,
            durationSeconds: null,
            volume,
            audioTracks: [],
            selectedAudioTrackId: null,
            subtitleTracks: [],
            selectedSubtitleTrackId: null,
            playbackSpeed: 1,
            aspectOverride: 'no',
            startedAt: now,
            updatedAt: now,
            error: error instanceof Error ? error.message : String(error),
        };
    }

    private waitForStartupPaint(): Promise<void> {
        if (typeof requestAnimationFrame !== 'function') {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => resolve());
            });
        });
    }
}
