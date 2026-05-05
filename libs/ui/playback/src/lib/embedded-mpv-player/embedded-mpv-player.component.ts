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
    viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
    EmbeddedMpvAudioTrack,
    ResolvedPortalPlayback,
} from 'shared-interfaces';
import { EmbeddedMpvOverlayVisibilityService } from './embedded-mpv-overlay-visibility.service';
import { EmbeddedMpvSessionController } from './embedded-mpv-session-controller';
import { EmbeddedMpvShortcuts } from './embedded-mpv-shortcuts';
import {
    EmbeddedMpvFeedback,
    EmbeddedMpvMenuState,
} from './embedded-mpv-ui-state';
import {
    ASPECT_PRESETS,
    HIDDEN_BOUNDS,
    MENU_OPEN_BOTTOM_CUTOUT_PX,
    SPEED_PRESETS,
    aspectLabel,
    audioTrackLabel,
    formatTime,
    measureBounds,
    persistVolume,
    readStoredVolume,
    speedLabel,
    subtitleTrackLabel,
    volumeIcon,
    volumeLabel,
} from './embedded-mpv-format.utils';

const HIDE_CONTROLS_DELAY_MS = 2500;
const VOLUME_POPOVER_CLOSE_DELAY_MS = 220;

@Component({
    selector: 'app-embedded-mpv-player',
    templateUrl: './embedded-mpv-player.component.html',
    styleUrl: './embedded-mpv-player.component.scss',
    imports: [
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatTooltipModule,
    ],
    providers: [EmbeddedMpvSessionController],
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
    private readonly controller = inject(EmbeddedMpvSessionController);
    private readonly shortcuts = new EmbeddedMpvShortcuts();
    readonly menus = new EmbeddedMpvMenuState();
    readonly feedback = new EmbeddedMpvFeedback();

    readonly viewport = viewChild<ElementRef<HTMLDivElement>>('viewport');
    readonly playerRoot = viewChild<ElementRef<HTMLDivElement>>('playerRoot');

    readonly support = this.controller.support;
    readonly session = this.controller.session;
    readonly stalled = this.controller.stalled;

    readonly volume = signal(readStoredVolume());
    readonly isFullscreen = signal(false);
    readonly controlsVisible = signal(true);

    readonly speedPresets = SPEED_PRESETS;
    readonly aspectPresets = ASPECT_PRESETS;

    readonly isSupported = computed(() => this.support()?.supported ?? false);
    readonly capabilities = computed(
        () =>
            this.support()?.capabilities ?? {
                subtitles: false,
                playbackSpeed: false,
                aspectOverride: false,
                screenshot: false,
            }
    );
    readonly isLoading = computed(
        () =>
            !this.support() ||
            this.session()?.status === 'loading' ||
            (!this.session() && this.isSupported())
    );
    readonly isPaused = computed(
        () =>
            this.session()?.status === 'paused' ||
            this.session()?.status === 'idle'
    );
    readonly isPlaying = computed(() => this.session()?.status === 'playing');
    readonly isErrored = computed(() => this.session()?.status === 'error');
    readonly canSeek = computed(
        () => (this.session()?.durationSeconds ?? 0) > 0
    );
    readonly canFullscreen = computed(
        () =>
            typeof document !== 'undefined' &&
            Boolean(this.playerRoot()?.nativeElement.requestFullscreen) &&
            Boolean(document.exitFullscreen)
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
            return 'Loading stream…';
        }
        return '';
    });
    readonly fullscreenLabel = computed(() =>
        this.isFullscreen() ? 'Exit fullscreen' : 'Enter fullscreen'
    );
    readonly audioTracks = computed(() => this.session()?.audioTracks ?? []);
    readonly hasAudioTracks = computed(() => this.audioTracks().length > 1);
    readonly subtitleTracks = computed(
        () => this.session()?.subtitleTracks ?? []
    );
    readonly hasSubtitleTracks = computed(
        () => this.subtitleTracks().length > 0
    );
    readonly selectedSubtitleTrackId = computed(
        () => this.session()?.selectedSubtitleTrackId ?? null
    );
    readonly playbackSpeed = computed(() => this.session()?.playbackSpeed ?? 1);
    readonly aspectOverride = computed(
        () => this.session()?.aspectOverride ?? 'no'
    );
    readonly volumeIcon = computed(() => volumeIcon(this.volume()));
    readonly volumeLabel = computed(() => volumeLabel(this.volume()));
    readonly timelineValue = computed(() =>
        Math.max(0, this.session()?.positionSeconds ?? 0)
    );
    readonly controlsAreVisible = computed(
        () =>
            this.showControls() &&
            this.isSupported() &&
            (this.controlsVisible() ||
                this.isLoading() ||
                this.isPaused() ||
                this.menus.anyOpen() ||
                Boolean(this.statusLabel()))
    );
    readonly hideCursor = computed(
        () =>
            this.isFullscreen() &&
            this.isPlaying() &&
            !this.controlsAreVisible()
    );

    private mutedVolume = 0;
    private controlsHideTimer: number | null = null;
    private volumeCloseTimer: number | null = null;

    private readonly onDocumentPointerDown = (event: PointerEvent) => {
        const playerRoot = this.playerRoot()?.nativeElement;
        if (!playerRoot || event.composedPath().includes(playerRoot)) {
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
    private readonly onFullscreenChange = () => {
        const playerRoot = this.playerRoot()?.nativeElement;
        this.isFullscreen.set(
            Boolean(playerRoot && document.fullscreenElement === playerRoot)
        );
        this.revealControls();
        this.controller.triggerBoundsSync();
    };

    constructor() {
        if (typeof document !== 'undefined') {
            document.addEventListener(
                'fullscreenchange',
                this.onFullscreenChange
            );
            document.addEventListener('pointerdown', this.onDocumentPointerDown);
            document.addEventListener(
                'pointermove',
                this.onDocumentPointerMove,
                { passive: true }
            );
        }

        this.controller.setBoundsProvider((host) => {
            if (this.overlayVisibility.overlayActive()) {
                return HIDDEN_BOUNDS;
            }
            const rect = measureBounds(host);
            if (this.menus.anyOpen()) {
                return {
                    ...rect,
                    height: Math.max(
                        1,
                        rect.height - MENU_OPEN_BOTTOM_CUTOUT_PX
                    ),
                };
            }
            return rect;
        });

        this.shortcuts.attach({
            isAvailable: () => !this.overlayVisibility.overlayActive(),
            onEscape: () => this.closePopovers(),
            togglePaused: () => void this.togglePaused(),
            toggleFullscreen: () => void this.toggleFullscreen(),
            seekBy: (delta) => void this.seekBy(delta),
            adjustVolume: (delta) => this.adjustVolume(delta),
            toggleMute: () => this.toggleMute(),
        });

        effect((onCleanup) => {
            const viewport = this.viewport();
            const playback = this.playback();
            const support = this.support();
            this.controller.retryToken();

            if (
                !viewport ||
                !playback.streamUrl ||
                !support?.supported ||
                !window.electron
            ) {
                return;
            }

            const teardown = this.controller.startSession(
                viewport.nativeElement,
                playback,
                this.volume()
            );
            onCleanup(teardown);
        });

        effect(() => {
            this.overlayVisibility.overlayActive();
            this.menus.anyOpen();
            this.controller.triggerBoundsSync();
        });

        effect(() => {
            const session = this.session();
            if (!session) {
                return;
            }
            this.volume.set(session.volume);
            this.timeUpdate.emit({
                currentTime: session.positionSeconds,
                duration: session.durationSeconds ?? 0,
            });
            this.scheduleControlsHide();
        });
    }

    ngOnDestroy(): void {
        this.shortcuts.detach();
        this.feedback.dispose();
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
        }
        if (this.volumeCloseTimer !== null) {
            clearTimeout(this.volumeCloseTimer);
            this.volumeCloseTimer = null;
        }
        this.clearControlsHideTimer();
    }

    onPlayerInteraction(): void {
        this.revealControls();
    }

    onPlayerDblClick(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, input, [role="slider"]')) {
            return;
        }
        void this.toggleFullscreen();
    }

    async togglePaused(): Promise<void> {
        this.revealControls();
        await this.controller.togglePaused();
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
            this.controller.triggerBoundsSync();
        }
    }

    async seekBy(deltaSeconds: number): Promise<void> {
        this.revealControls();
        const ok = await this.controller.seekBy(deltaSeconds);
        if (ok) {
            this.feedback.flash(
                deltaSeconds >= 0 ? 'forward_10' : 'replay_10',
                `${deltaSeconds >= 0 ? '+' : ''}${Math.round(deltaSeconds)}s`
            );
        }
    }

    async onTimelineInput(event: Event): Promise<void> {
        this.revealControls();
        const target = Number((event.target as HTMLInputElement).value);
        await this.controller.seekTo(target);
    }

    onVolumeInput(event: Event): void {
        const next = Number((event.target as HTMLInputElement).value);
        this.applyVolume(next);
        this.revealControls(false);
    }

    onVolumeWheel(event: WheelEvent): void {
        event.preventDefault();
        this.adjustVolume(event.deltaY > 0 ? -0.05 : 0.05);
    }

    onVolumeHoverEnter(): void {
        if (this.volumeCloseTimer !== null) {
            clearTimeout(this.volumeCloseTimer);
            this.volumeCloseTimer = null;
        }
        this.menus.open('volume');
    }

    onVolumeHoverLeave(): void {
        if (this.volumeCloseTimer !== null) {
            clearTimeout(this.volumeCloseTimer);
        }
        this.volumeCloseTimer = window.setTimeout(() => {
            this.menus.close('volume');
            this.volumeCloseTimer = null;
        }, VOLUME_POPOVER_CLOSE_DELAY_MS);
    }

    toggleMute(): void {
        const current = this.volume();
        if (current > 0) {
            this.mutedVolume = current;
            this.applyVolume(0);
            this.feedback.flash('volume_off', 'Muted');
        } else {
            const restored = this.mutedVolume || 0.5;
            this.applyVolume(restored);
            this.feedback.flash(
                volumeIcon(restored),
                `${Math.round(restored * 100)}%`
            );
        }
        this.revealControls();
    }

    toggleAudioMenu(): void {
        this.menus.toggle('audio');
        this.revealControls();
    }
    toggleSubtitleMenu(): void {
        this.menus.toggle('subtitle');
        this.revealControls();
    }
    toggleSpeedMenu(): void {
        this.menus.toggle('speed');
        this.revealControls();
    }
    toggleAspectMenu(): void {
        this.menus.toggle('aspect');
        this.revealControls();
    }

    async selectAudioTrack(trackId: number): Promise<void> {
        this.revealControls(false);
        await this.controller.setAudioTrack(trackId);
        this.menus.close('audio');
        this.scheduleControlsHide();
    }

    async selectSubtitleTrack(trackId: number): Promise<void> {
        this.revealControls(false);
        await this.controller.setSubtitleTrack(trackId);
        this.menus.close('subtitle');
        this.scheduleControlsHide();
    }

    async selectSpeed(speed: number): Promise<void> {
        this.revealControls(false);
        await this.controller.setSpeed(speed);
        this.menus.close('speed');
        this.scheduleControlsHide();
    }

    async selectAspect(aspect: string): Promise<void> {
        this.revealControls(false);
        await this.controller.setAspect(aspect);
        this.menus.close('aspect');
        this.scheduleControlsHide();
    }

    retry(): void {
        this.controller.retry();
    }

    formatTime = formatTime;
    trackLabel = audioTrackLabel;
    subtitleLabel = subtitleTrackLabel;
    speedLabel = speedLabel;
    aspectLabel = aspectLabel;

    private adjustVolume(delta: number): void {
        const next = Math.max(0, Math.min(1, this.volume() + delta));
        this.applyVolume(next);
        this.revealControls();
        this.feedback.flash(volumeIcon(next), `${Math.round(next * 100)}%`);
    }

    private applyVolume(value: number): void {
        this.volume.set(value);
        persistVolume(value);
        void this.controller.applyVolume(value);
    }

    private closePopovers(): void {
        if (!this.menus.anyOpen()) {
            return;
        }
        this.menus.closeAll();
        this.controller.triggerBoundsSync();
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
            this.menus.anyOpen() ||
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
                !this.menus.anyOpen() &&
                !this.statusLabel()
            ) {
                this.controlsVisible.set(false);
            }
        }, HIDE_CONTROLS_DELAY_MS);
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
}

export type EmbeddedMpvAudioTrackView = EmbeddedMpvAudioTrack;
