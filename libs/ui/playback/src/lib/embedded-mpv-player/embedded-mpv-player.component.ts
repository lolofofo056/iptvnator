import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    EventEmitter,
    OnDestroy,
    Output,
    computed,
    effect,
    inject,
    input,
    signal,
    untracked,
    viewChild,
} from '@angular/core';
import { EmbeddedMpvOverlayVisibilityService } from './embedded-mpv-overlay-visibility.service';

const HIDDEN_BOUNDS = Object.freeze({
    x: -100000,
    y: -100000,
    width: 1,
    height: 1,
});
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
    EmbeddedMpvAudioTrack,
    EmbeddedMpvBounds,
    EmbeddedMpvSession,
    EmbeddedMpvSupport,
    ResolvedPortalPlayback,
} from 'shared-interfaces';

@Component({
    selector: 'app-embedded-mpv-player',
    templateUrl: './embedded-mpv-player.component.html',
    styleUrl: './embedded-mpv-player.component.scss',
    imports: [MatButtonModule, MatIconModule, MatTooltipModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        class: 'embedded-mpv-player-host',
    },
})
export class EmbeddedMpvPlayerComponent implements OnDestroy {
    readonly playback = input.required<ResolvedPortalPlayback>();
    readonly showControls = input(true);

    @Output() timeUpdate = new EventEmitter<{
        currentTime: number;
        duration: number;
    }>();

    private readonly overlayVisibility = inject(
        EmbeddedMpvOverlayVisibilityService
    );

    readonly viewport = viewChild<ElementRef<HTMLDivElement>>('viewport');
    readonly playerRoot = viewChild<ElementRef<HTMLDivElement>>('playerRoot');
    readonly support = signal<EmbeddedMpvSupport | null>(null);
    readonly session = signal<EmbeddedMpvSession | null>(null);
    readonly sessionId = signal<string | null>(null);
    readonly volume = signal(this.readStoredVolume());
    readonly isFullscreen = signal(false);
    readonly controlsVisible = signal(true);
    readonly volumePopoverOpen = signal(false);
    readonly audioMenuOpen = signal(false);

    readonly isSupported = computed(() => this.support()?.supported ?? false);
    readonly canFullscreen = computed(
        () =>
            typeof document !== 'undefined' &&
            Boolean(this.playerRoot()?.nativeElement.requestFullscreen) &&
            Boolean(document.exitFullscreen)
    );
    readonly isLoading = computed(
        () =>
            !this.support() ||
            this.session()?.status === 'loading' ||
            (!this.session() && this.isSupported())
    );
    readonly isPaused = computed(
        () => this.session()?.status === 'paused' || this.session()?.status === 'idle'
    );
    readonly isPlaying = computed(() => this.session()?.status === 'playing');
    readonly canSeek = computed(
        () => (this.session()?.durationSeconds ?? 0) > 0
    );
    readonly statusLabel = computed(() => {
        const session = this.session();
        if (session?.status === 'error') {
            return session.error ?? 'Embedded MPV playback failed.';
        }

        if (!this.support()) {
            return 'Checking embedded MPV support...';
        }

        if (!this.isSupported()) {
            return (
                this.support()?.reason ??
                'Embedded MPV is not available in this environment.'
            );
        }

        if (!session || session.status === 'loading') {
            return 'Loading stream in MPV...';
        }

        return '';
    });
    readonly fullscreenLabel = computed(() =>
        this.isFullscreen() ? 'Exit fullscreen' : 'Enter fullscreen'
    );
    readonly audioTracks = computed(
        () => this.session()?.audioTracks ?? []
    );
    readonly hasAudioTracks = computed(() => this.audioTracks().length > 1);
    readonly selectedAudioTrack = computed(
        () => this.audioTracks().find((track) => track.selected) ?? null
    );
    readonly controlsAreVisible = computed(
        () =>
            this.showControls() &&
            this.isSupported() &&
            (this.controlsVisible() ||
                this.isLoading() ||
                this.isPaused() ||
                this.volumePopoverOpen() ||
                this.audioMenuOpen() ||
                Boolean(this.statusLabel()))
    );
    readonly hideCursor = computed(
        () =>
            this.isFullscreen() &&
            this.isPlaying() &&
            !this.controlsAreVisible()
    );
    readonly volumeIcon = computed(() => {
        const value = this.volume();
        if (value <= 0) {
            return 'volume_off';
        }

        return value < 0.5 ? 'volume_down' : 'volume_up';
    });
    readonly volumeLabel = computed(
        () => `Volume ${Math.round(this.volume() * 100)}%`
    );
    readonly timelineValue = computed(() =>
        Math.max(0, this.session()?.positionSeconds ?? 0)
    );

    private readonly unsubscribeSessionUpdate =
        window.electron?.onEmbeddedMpvSessionUpdate?.((session) => {
            if (session.id !== this.sessionId()) {
                return;
            }

            this.session.set(session);
            this.volume.set(session.volume);
            this.timeUpdate.emit({
                currentTime: session.positionSeconds,
                duration: session.durationSeconds ?? 0,
            });
            this.scheduleControlsHide();
        });
    private boundsAnimationFrame: number | null = null;
    private controlsHideTimer: number | null = null;
    private activeBoundsSync: (() => void) | null = null;
    private readonly onDocumentPointerDown = (event: PointerEvent) => {
        const playerRoot = this.playerRoot()?.nativeElement;
        const path = event.composedPath();
        if (!playerRoot || path.includes(playerRoot)) {
            return;
        }

        this.closePopovers();
    };
    private readonly onDocumentPointerMove = (event: PointerEvent) => {
        const playerRoot = this.playerRoot()?.nativeElement;
        if (
            playerRoot &&
            !event.composedPath().includes(playerRoot) &&
            this.isPointerInsidePlayer(event)
        ) {
            this.revealControls();
        }
    };
    private readonly onDocumentKeydown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') {
            return;
        }

        this.closePopovers();
    };
    private readonly onFullscreenChange = () => {
        const playerRoot = this.playerRoot()?.nativeElement;
        this.isFullscreen.set(
            Boolean(playerRoot && document.fullscreenElement === playerRoot)
        );
        this.revealControls();
        this.activeBoundsSync?.();
    };

    constructor() {
        if (typeof document !== 'undefined') {
            document.addEventListener(
                'fullscreenchange',
                this.onFullscreenChange
            );
            document.addEventListener(
                'pointerdown',
                this.onDocumentPointerDown
            );
            document.addEventListener(
                'pointermove',
                this.onDocumentPointerMove,
                { passive: true }
            );
            document.addEventListener('keydown', this.onDocumentKeydown);
        }

        if (window.electron?.getEmbeddedMpvSupport) {
            void this.loadSupport();
        } else {
            this.support.set({
                supported: false,
                platform: typeof window === 'undefined' ? 'web' : 'unknown',
                reason: 'Embedded MPV requires the Electron desktop build.',
            });
        }

        effect((onCleanup) => {
            const viewport = this.viewport();
            const playback = this.playback();
            const support = this.support();

            if (
                !viewport ||
                !playback.streamUrl ||
                !support?.supported ||
                !window.electron
            ) {
                return;
            }

            let disposed = false;
            let activeSessionId: string | null = null;
            const host = viewport.nativeElement;
            const initialVolume = untracked(() => this.volume());

            const syncBounds = () => {
                if (!activeSessionId) {
                    return;
                }

                const bounds = untracked(() =>
                    this.overlayVisibility.overlayActive()
                )
                    ? HIDDEN_BOUNDS
                    : this.measureBounds(host);

                void window.electron
                    .setEmbeddedMpvBounds(activeSessionId, bounds)
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

            const resizeObserver = new ResizeObserver(() => {
                scheduleBoundsSync();
            });
            resizeObserver.observe(host);

            window.addEventListener('resize', scheduleBoundsSync);
            window.addEventListener('scroll', scheduleBoundsSync, true);

            const createSession = async () => {
                this.session.set(
                    this.createLoadingSession(playback, initialVolume)
                );
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

                const createdSession =
                    await window.electron!.createEmbeddedMpvSession(
                        this.measureBounds(host),
                        playback.title,
                        initialVolume
                    );

                if (disposed) {
                    await window.electron!.disposeEmbeddedMpvSession(
                        createdSession.id
                    );
                    return;
                }

                activeSessionId = createdSession.id;
                this.sessionId.set(createdSession.id);
                this.session.set(createdSession);

                await window.electron!.loadEmbeddedMpvPlayback(
                    createdSession.id,
                    playback
                );
                scheduleBoundsSync();
            };

            void createSession().catch((error) => {
                const startedAt = new Date().toISOString();
                this.sessionId.set(null);
                this.session.set({
                    id: 'embedded-mpv-error',
                    title: playback.title,
                    streamUrl: playback.streamUrl,
                    status: 'error',
                    positionSeconds: 0,
                    durationSeconds: null,
                    volume: initialVolume,
                    audioTracks: [],
                    selectedAudioTrackId: null,
                    startedAt,
                    updatedAt: startedAt,
                    error:
                        error instanceof Error
                            ? error.message
                            : String(error),
                });
            });

            onCleanup(() => {
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

                const sessionId = activeSessionId;
                activeSessionId = null;
                this.sessionId.set(null);
                this.session.set(null);

                if (sessionId) {
                    void window.electron?.disposeEmbeddedMpvSession(sessionId);
                }
            });
        });

        effect(() => {
            this.overlayVisibility.overlayActive();
            untracked(() => this.activeBoundsSync?.());
        });
    }

    ngOnDestroy(): void {
        this.unsubscribeSessionUpdate?.();
        if (typeof document !== 'undefined') {
            document.removeEventListener(
                'fullscreenchange',
                this.onFullscreenChange
            );
            document.removeEventListener(
                'pointerdown',
                this.onDocumentPointerDown
            );
            document.removeEventListener(
                'pointermove',
                this.onDocumentPointerMove
            );
            document.removeEventListener('keydown', this.onDocumentKeydown);
        }

        if (this.boundsAnimationFrame !== null) {
            cancelAnimationFrame(this.boundsAnimationFrame);
            this.boundsAnimationFrame = null;
        }

        this.clearControlsHideTimer();
    }

    onPlayerInteraction(): void {
        this.revealControls();
    }

    async togglePaused(): Promise<void> {
        this.revealControls();
        const session = this.session();
        if (!session?.id || !window.electron?.setEmbeddedMpvPaused) {
            return;
        }

        const updatedSession = await window.electron.setEmbeddedMpvPaused(
            session.id,
            session.status !== 'paused'
        );
        if (updatedSession) {
            this.session.set(updatedSession);
        }
    }

    async toggleFullscreen(): Promise<void> {
        this.revealControls();
        const playerRoot = this.playerRoot()?.nativeElement;
        if (!playerRoot || !this.canFullscreen()) {
            return;
        }

        try {
            if (document.fullscreenElement === playerRoot) {
                await document.exitFullscreen();
            } else {
                await playerRoot.requestFullscreen();
            }
        } catch {
            return;
        } finally {
            this.activeBoundsSync?.();
        }
    }

    async seekBy(deltaSeconds: number): Promise<void> {
        this.revealControls();
        const session = this.session();
        if (!session?.id || !window.electron?.seekEmbeddedMpv) {
            return;
        }

        const nextPosition = Math.max(0, session.positionSeconds + deltaSeconds);
        const updatedSession = await window.electron.seekEmbeddedMpv(
            session.id,
            nextPosition
        );
        if (updatedSession) {
            this.session.set(updatedSession);
        }
    }

    async onTimelineInput(event: Event): Promise<void> {
        this.revealControls();
        const session = this.session();
        if (!session?.id || !window.electron?.seekEmbeddedMpv) {
            return;
        }

        const target = Number((event.target as HTMLInputElement).value);
        const updatedSession = await window.electron.seekEmbeddedMpv(
            session.id,
            target
        );
        if (updatedSession) {
            this.session.set(updatedSession);
        }
    }

    toggleVolumePopover(): void {
        this.volumePopoverOpen.update((open) => !open);
        if (this.volumePopoverOpen()) {
            this.audioMenuOpen.set(false);
        }
        this.revealControls();
        this.activeBoundsSync?.();
    }

    toggleAudioMenu(): void {
        this.audioMenuOpen.update((open) => !open);
        if (this.audioMenuOpen()) {
            this.volumePopoverOpen.set(false);
        }
        this.revealControls();
        this.activeBoundsSync?.();
    }

    showDefaultControls(): void {
        this.volumePopoverOpen.set(false);
        this.audioMenuOpen.set(false);
        this.revealControls();
        this.activeBoundsSync?.();
    }

    onVolumeInput(event: Event): void {
        const nextVolume = Number((event.target as HTMLInputElement).value);
        this.volume.set(nextVolume);
        localStorage.setItem('volume', String(nextVolume));
        this.revealControls(false);

        const session = this.session();
        if (!session?.id || !window.electron?.setEmbeddedMpvVolume) {
            return;
        }

        void window.electron
            .setEmbeddedMpvVolume(session.id, nextVolume)
            .then((updatedSession) => {
                if (updatedSession) {
                    this.session.set(updatedSession);
                }
            })
            .catch(() => undefined);
    }

    async selectAudioTrack(trackId: number): Promise<void> {
        const session = this.session();
        if (!session?.id || !window.electron?.setEmbeddedMpvAudioTrack) {
            return;
        }

        this.revealControls(false);
        const updatedSession = await window.electron.setEmbeddedMpvAudioTrack(
            session.id,
            trackId
        );
        if (updatedSession) {
            this.session.set(updatedSession);
        }
        this.audioMenuOpen.set(false);
        this.scheduleControlsHide();
    }

    formatTime(value: number | null | undefined): string {
        const safeValue = Math.max(0, Math.floor(value ?? 0));
        const hours = Math.floor(safeValue / 3600);
        const minutes = Math.floor((safeValue % 3600) / 60);
        const seconds = safeValue % 60;

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    trackLabel(track: EmbeddedMpvAudioTrack, index: number): string {
        const label = track.title || track.language || `Audio ${index + 1}`;
        return track.defaultTrack ? `${label} · Default` : label;
    }

    private closePopovers(): void {
        if (!this.volumePopoverOpen() && !this.audioMenuOpen()) {
            return;
        }

        this.volumePopoverOpen.set(false);
        this.audioMenuOpen.set(false);
        this.activeBoundsSync?.();
        this.scheduleControlsHide();
    }

    private revealControls(scheduleHide = true): void {
        this.controlsVisible.set(true);
        if (scheduleHide) {
            this.clearControlsHideTimer();
            this.scheduleControlsHide();
        }
    }

    private scheduleControlsHide(): void {
        if (
            !this.isPlaying() ||
            this.volumePopoverOpen() ||
            this.audioMenuOpen() ||
            Boolean(this.statusLabel())
        ) {
            this.clearControlsHideTimer();
            return;
        }

        if (!this.controlsVisible() || this.controlsHideTimer !== null) {
            return;
        }

        this.controlsHideTimer = window.setTimeout(() => {
            if (
                this.isPlaying() &&
                !this.volumePopoverOpen() &&
                !this.audioMenuOpen() &&
                !this.statusLabel()
            ) {
                this.controlsVisible.set(false);
            }
        }, 2500);
    }

    private clearControlsHideTimer(): void {
        if (this.controlsHideTimer === null) {
            return;
        }

        window.clearTimeout(this.controlsHideTimer);
        this.controlsHideTimer = null;
    }

    private isPointerInsidePlayer(event: PointerEvent): boolean {
        const playerRoot = this.playerRoot()?.nativeElement;
        if (!playerRoot) {
            return false;
        }

        const rect = playerRoot.getBoundingClientRect();
        return (
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom
        );
    }

    private async loadSupport(): Promise<void> {
        try {
            this.support.set(await window.electron!.getEmbeddedMpvSupport());
        } catch (error) {
            this.support.set({
                supported: false,
                platform: window.electron?.platform ?? 'unknown',
                reason:
                    error instanceof Error
                        ? error.message
                        : String(error),
            });
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
            startedAt: now,
            updatedAt: now,
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

    private measureBounds(host: HTMLDivElement): EmbeddedMpvBounds {
        const rect = host.getBoundingClientRect();
        return {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.max(1, Math.round(rect.width)),
            height: Math.max(1, Math.round(rect.height)),
        };
    }

    private readStoredVolume(): number {
        const rawValue = Number(localStorage.getItem('volume') ?? '1');
        if (Number.isNaN(rawValue)) {
            return 1;
        }

        return Math.max(0, Math.min(1, rawValue));
    }
}
