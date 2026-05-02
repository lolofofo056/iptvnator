import { app } from 'electron';
import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import App from '../app';
import {
    EmbeddedMpvAudioTrack,
    EmbeddedMpvBounds,
    EmbeddedMpvSession,
    EmbeddedMpvSessionStatus,
    EmbeddedMpvSupport,
    EMBEDDED_MPV_SESSION_UPDATE,
    ResolvedPortalPlayback,
} from 'shared-interfaces';

interface NativeEmbeddedMpvSessionSnapshot {
    status: EmbeddedMpvSessionStatus;
    positionSeconds: number;
    durationSeconds: number | null;
    volume: number;
    streamUrl: string;
    audioTracks?: EmbeddedMpvAudioTrack[];
    selectedAudioTrackId?: number | null;
    error?: string;
}

interface NativeEmbeddedMpvAddon {
    isSupported(): boolean;
    createSession(
        windowHandle: Buffer,
        bounds: EmbeddedMpvBounds,
        title?: string,
        initialVolume?: number
    ): string;
    loadPlayback(sessionId: string, playback: ResolvedPortalPlayback): void;
    setBounds(sessionId: string, bounds: EmbeddedMpvBounds): void;
    setPaused(sessionId: string, paused: boolean): void;
    seek(sessionId: string, seconds: number): void;
    setVolume(sessionId: string, volume: number): void;
    setAudioTrack(sessionId: string, trackId: number): void;
    getSessionSnapshot(
        sessionId: string
    ): NativeEmbeddedMpvSessionSnapshot | null;
    disposeSession(sessionId: string): void;
}

interface EmbeddedMpvRuntimeSession {
    id: string;
    title: string;
    streamUrl: string;
    startedAt: string;
    updatedAt: string;
    lastPayloadKey: string;
}

const EMBEDDED_MPV_EXPERIMENT_ENV =
    'IPTVNATOR_ENABLE_EMBEDDED_MPV_EXPERIMENT';

function dedupePaths(paths: Array<string | undefined>): string[] {
    return [...new Set(paths.filter((value): value is string => Boolean(value)))];
}

export class EmbeddedMpvNativeService {
    private addon: NativeEmbeddedMpvAddon | null = null;
    private addonLoadError: Error | null = null;
    private readonly sessions = new Map<string, EmbeddedMpvRuntimeSession>();
    private pollingTimer: NodeJS.Timeout | null = null;
    private readonly loadAddonModule = createRequire(__filename);

    getSupport(): EmbeddedMpvSupport {
        if (process.platform !== 'darwin') {
            return {
                supported: false,
                platform: process.platform,
                reason: 'Embedded MPV is currently available on macOS only.',
            };
        }

        if (!this.isEmbeddedMpvEnabled()) {
            return {
                supported: false,
                platform: process.platform,
                reason: `Embedded MPV is a macOS-only experimental player. Set ${EMBEDDED_MPV_EXPERIMENT_ENV}=1 to enable it for local development builds.`,
            };
        }

        if (this.addon) {
            try {
                if (!this.addon.isSupported()) {
                    return {
                        supported: false,
                        platform: process.platform,
                        reason: 'The native embedded MPV addon reported itself as unsupported.',
                    };
                }

                return {
                    supported: true,
                    platform: process.platform,
                };
            } catch (error) {
                return {
                    supported: false,
                    platform: process.platform,
                    reason:
                        error instanceof Error
                            ? error.message
                            : String(error),
                };
            }
        }

        if (this.addonLoadError) {
            return {
                supported: false,
                platform: process.platform,
                reason: this.addonLoadError.message,
            };
        }

        const candidatePaths = this.getAddonCandidatePaths();
        const existingCandidatePath = candidatePaths.find((candidatePath) =>
            existsSync(candidatePath)
        );

        if (!existingCandidatePath) {
            return {
                supported: false,
                platform: process.platform,
                reason:
                    this.readUnavailableReason(candidatePaths) ??
                    [
                        'Unable to locate the embedded MPV native addon.',
                        ...candidatePaths.map(
                            (candidatePath) => `- ${candidatePath}`
                        ),
                    ].join('\n'),
            };
        }

        const missingRuntimeReason =
            this.getMissingRuntimeReason(existingCandidatePath);
        if (missingRuntimeReason) {
            return {
                supported: false,
                platform: process.platform,
                reason: missingRuntimeReason,
            };
        }

        return {
            supported: true,
            platform: process.platform,
        };
    }

    prepareAddon(): EmbeddedMpvSupport {
        const support = this.getSupport();
        if (!support.supported) {
            return support;
        }

        try {
            const addon = this.getAddon();
            if (!addon.isSupported()) {
                return {
                    supported: false,
                    platform: process.platform,
                    reason: 'The native embedded MPV addon reported itself as unsupported.',
                };
            }

            return {
                supported: true,
                platform: process.platform,
            };
        } catch (error) {
            return {
                supported: false,
                platform: process.platform,
                reason:
                    error instanceof Error
                        ? error.message
                        : String(error),
            };
        }
    }

    createSession(
        bounds: EmbeddedMpvBounds,
        title = '',
        initialVolume = 1
    ): EmbeddedMpvSession {
        this.assertEmbeddedMpvEnabled();
        const addon = this.getAddon();
        const windowHandle = this.getMainWindowHandle();
        const startedAt = new Date().toISOString();
        const sessionId = addon.createSession(
            windowHandle,
            bounds,
            title,
            initialVolume
        );

        this.sessions.set(sessionId, {
            id: sessionId,
            title,
            streamUrl: '',
            startedAt,
            updatedAt: startedAt,
            lastPayloadKey: '',
        });

        this.ensurePolling();
        return this.refreshSession(sessionId) ?? {
            id: sessionId,
            title,
            streamUrl: '',
            status: 'idle',
            positionSeconds: 0,
            durationSeconds: null,
            volume: 1,
            audioTracks: [],
            selectedAudioTrackId: null,
            startedAt,
            updatedAt: startedAt,
        };
    }

    loadPlayback(sessionId: string, playback: ResolvedPortalPlayback): void {
        this.assertEmbeddedMpvEnabled();
        const addon = this.getAddon();
        const session = this.getRuntimeSession(sessionId);
        session.title = playback.title ?? session.title;
        session.streamUrl = playback.streamUrl ?? session.streamUrl;
        session.updatedAt = new Date().toISOString();
        addon.loadPlayback(sessionId, playback);
        this.refreshSession(sessionId);
    }

    setBounds(sessionId: string, bounds: EmbeddedMpvBounds): void {
        this.assertEmbeddedMpvEnabled();
        this.getAddon().setBounds(sessionId, bounds);
    }

    setPaused(sessionId: string, paused: boolean): EmbeddedMpvSession | null {
        this.assertEmbeddedMpvEnabled();
        this.getAddon().setPaused(sessionId, paused);
        return this.refreshSession(sessionId);
    }

    seek(sessionId: string, seconds: number): EmbeddedMpvSession | null {
        this.assertEmbeddedMpvEnabled();
        this.getAddon().seek(sessionId, seconds);
        return this.refreshSession(sessionId);
    }

    setVolume(sessionId: string, volume: number): EmbeddedMpvSession | null {
        this.assertEmbeddedMpvEnabled();
        this.getAddon().setVolume(sessionId, volume);
        return this.refreshSession(sessionId);
    }

    setAudioTrack(sessionId: string, trackId: number): EmbeddedMpvSession | null {
        this.assertEmbeddedMpvEnabled();
        this.getAddon().setAudioTrack(sessionId, trackId);
        return this.refreshSession(sessionId);
    }

    disposeSession(sessionId: string): EmbeddedMpvSession | null {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        try {
            this.getAddon().disposeSession(sessionId);
        } finally {
            this.sessions.delete(sessionId);
            const payload: EmbeddedMpvSession = {
                id: session.id,
                title: session.title,
                streamUrl: session.streamUrl,
                status: 'closed',
                positionSeconds: 0,
                durationSeconds: null,
                volume: 1,
                audioTracks: [],
                selectedAudioTrackId: null,
                startedAt: session.startedAt,
                updatedAt: new Date().toISOString(),
            };
            this.sendSessionUpdate(payload);
            this.stopPollingIfIdle();
            return payload;
        }
    }

    shutdown(): void {
        const sessionIds = [...this.sessions.keys()];
        sessionIds.forEach((sessionId) => this.disposeSession(sessionId));
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
    }

    private ensurePolling(): void {
        if (this.pollingTimer) {
            return;
        }

        this.pollingTimer = setInterval(() => {
            [...this.sessions.keys()].forEach((sessionId) => {
                this.refreshSession(sessionId);
            });
        }, 500);
    }

    private stopPollingIfIdle(): void {
        if (this.sessions.size > 0 || !this.pollingTimer) {
            return;
        }

        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
    }

    private refreshSession(sessionId: string): EmbeddedMpvSession | null {
        const addon = this.getAddon();
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        const snapshot = addon.getSessionSnapshot(sessionId);
        if (!snapshot) {
            return null;
        }

        const payload: EmbeddedMpvSession = {
            id: session.id,
            title: session.title,
            streamUrl: snapshot.streamUrl || session.streamUrl,
            status: snapshot.status,
            positionSeconds: Math.max(0, Math.floor(snapshot.positionSeconds)),
            durationSeconds:
                typeof snapshot.durationSeconds === 'number'
                    ? Math.max(0, Math.floor(snapshot.durationSeconds))
                    : null,
            volume: typeof snapshot.volume === 'number' ? snapshot.volume : 1,
            audioTracks: Array.isArray(snapshot.audioTracks)
                ? snapshot.audioTracks
                : [],
            selectedAudioTrackId:
                typeof snapshot.selectedAudioTrackId === 'number'
                    ? snapshot.selectedAudioTrackId
                    : null,
            startedAt: session.startedAt,
            updatedAt: new Date().toISOString(),
            ...(snapshot.error ? { error: snapshot.error } : {}),
        };

        session.streamUrl = payload.streamUrl;
        session.updatedAt = payload.updatedAt;
        const nextPayloadKey = JSON.stringify(payload);
        if (session.lastPayloadKey !== nextPayloadKey) {
            session.lastPayloadKey = nextPayloadKey;
            this.sendSessionUpdate(payload);
        }

        return payload;
    }

    private sendSessionUpdate(session: EmbeddedMpvSession): void {
        if (!App.mainWindow || App.mainWindow.isDestroyed()) {
            return;
        }

        App.mainWindow.webContents.send(EMBEDDED_MPV_SESSION_UPDATE, session);
    }

    private getRuntimeSession(sessionId: string): EmbeddedMpvRuntimeSession {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Embedded MPV session "${sessionId}" was not found.`);
        }

        return session;
    }

    private getMainWindowHandle(): Buffer {
        if (!App.mainWindow || App.mainWindow.isDestroyed()) {
            throw new Error('The Electron main window is not available.');
        }

        return App.mainWindow.getNativeWindowHandle();
    }

    private isExperimentEnabled(): boolean {
        return ['1', 'true', 'yes', 'on'].includes(
            (process.env[EMBEDDED_MPV_EXPERIMENT_ENV] ?? '')
                .trim()
                .toLowerCase()
        );
    }

    private isEmbeddedMpvEnabled(): boolean {
        return app.isPackaged || this.isExperimentEnabled();
    }

    private assertEmbeddedMpvEnabled(): void {
        if (!this.isEmbeddedMpvEnabled()) {
            throw new Error(
                `Embedded MPV is disabled. Set ${EMBEDDED_MPV_EXPERIMENT_ENV}=1 to enable the local macOS harness, or use a packaged macOS build with the bundled runtime.`
            );
        }
    }

    private getAddon(): NativeEmbeddedMpvAddon {
        if (this.addon) {
            return this.addon;
        }

        if (this.addonLoadError) {
            throw this.addonLoadError;
        }

        const candidatePaths = this.getAddonCandidatePaths();

        const existingCandidatePaths = candidatePaths.filter((candidatePath) =>
            existsSync(candidatePath)
        );

        if (existingCandidatePaths.length === 0) {
            this.addonLoadError = new Error(
                [
                    'Unable to locate the embedded MPV native addon.',
                    ...candidatePaths.map((candidatePath) => `- ${candidatePath}`),
                ].join('\n')
            );
            throw this.addonLoadError;
        }

        const loadErrors: string[] = [];
        for (const candidatePath of existingCandidatePaths) {
            try {
                this.addon = this.loadAddonModule(
                    candidatePath
                ) as NativeEmbeddedMpvAddon;
                return this.addon;
            } catch (error) {
                loadErrors.push(
                    `${candidatePath}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }

        this.addonLoadError = new Error(
            [
                'Unable to load the embedded MPV native addon.',
                ...loadErrors.map((error) => `- ${error}`),
            ].join('\n')
        );
        throw this.addonLoadError;
    }

    private getAddonCandidatePaths(): string[] {
        const localBuildAddonPath = path.resolve(
            process.cwd(),
            'apps/electron-backend/native/build/Release/embedded_mpv.node'
        );
        const distAddonPaths = [
            path.resolve(__dirname, 'native/embedded_mpv.node'),
            path.resolve(__dirname, '../../native/embedded_mpv.node'),
        ];
        const packagedAddonPaths = [
            path.resolve(
                (process as NodeJS.Process & { resourcesPath?: string })
                    .resourcesPath ?? '',
                'app.asar.unpacked',
                'electron-backend',
                'native',
                'embedded_mpv.node'
            ),
            app.getAppPath()
                ? path.join(
                      path.dirname(app.getAppPath()),
                      'app.asar.unpacked',
                      'electron-backend',
                      'native',
                      'embedded_mpv.node'
                  )
                : undefined,
        ];

        return dedupePaths(
            app.isPackaged
                ? [...packagedAddonPaths, ...distAddonPaths, localBuildAddonPath]
                : [localBuildAddonPath, ...distAddonPaths, ...packagedAddonPaths]
        );
    }

    private readUnavailableReason(candidatePaths: string[]): string | null {
        for (const candidatePath of candidatePaths) {
            const unavailablePath = path.join(
                path.dirname(candidatePath),
                'embedded-mpv-unavailable.txt'
            );

            if (existsSync(unavailablePath)) {
                return readFileSync(unavailablePath, 'utf8').trim();
            }
        }

        return null;
    }

    private getMissingRuntimeReason(addonPath: string): string | null {
        const nativeDir = path.dirname(addonPath);
        const libMpvPath = path.join(nativeDir, 'lib', 'libmpv.2.dylib');

        if (!existsSync(libMpvPath)) {
            return `Embedded MPV runtime is incomplete. Missing ${libMpvPath}.`;
        }

        return null;
    }
}

export const embeddedMpvNativeService = new EmbeddedMpvNativeService();
