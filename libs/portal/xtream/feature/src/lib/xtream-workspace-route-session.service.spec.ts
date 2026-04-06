import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { PlaylistContextFacade } from '@iptvnator/playlist/shared/util';
import {
    PortalStatusType,
    XtreamContentInitBlockReason,
    XtreamPlaylistData,
    XtreamStore,
} from '@iptvnator/portal/xtream/data-access';
import { PlaylistMeta } from 'shared-interfaces';
import { XtreamWorkspaceRouteSession } from './xtream-workspace-route-session.service';

const PLAYLIST_ID = 'playlist-1';
const ACTIVE_PLAYLIST: PlaylistMeta = {
    _id: PLAYLIST_ID,
    filename: 'xtream.m3u',
    password: 'secret',
    serverUrl: 'http://localhost:3211',
    title: 'Test Xtream',
    username: 'user1',
} as PlaylistMeta;
const UPDATED_ACTIVE_PLAYLIST: PlaylistMeta = {
    ...ACTIVE_PLAYLIST,
    serverUrl: 'http://localhost:65530',
} as PlaylistMeta;

const XTREAM_PLAYLIST: XtreamPlaylistData = {
    id: PLAYLIST_ID,
    name: 'Test Xtream',
    title: 'Test Xtream',
    serverUrl: 'http://localhost:3211',
    username: 'user1',
    password: 'secret',
    type: 'xtream',
};

async function flushEffects(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function getXtreamSectionFromUrl(url: string): string | null {
    const match = url.match(
        /^\/workspace\/xtreams\/[^/]+\/([^/?]+)(?:\/|$)/
    );

    return match?.[1] ?? null;
}

describe('XtreamWorkspaceRouteSession', () => {
    const routerEvents = new Subject<NavigationEnd>();
    const routeProvider = signal<'xtreams' | null>('xtreams');
    const routePlaylistId = signal<string | null>(PLAYLIST_ID);
    const activePlaylist = signal<PlaylistMeta | null>(ACTIVE_PLAYLIST);
    const currentPlaylist = signal<XtreamPlaylistData | null>(XTREAM_PLAYLIST);
    const playlistId = signal<string | null>(PLAYLIST_ID);
    const portalStatus = signal<PortalStatusType>('active');
    const selectedContentType = signal<'live' | 'vod' | 'series'>('vod');
    const contentInitBlockReason =
        signal<XtreamContentInitBlockReason | null>(null);
    let hasUsableOfflineCache = false;

    const playlistContext = {
        routeProvider,
        routePlaylistId,
        activePlaylist,
        syncFromUrl: jest.fn(),
    };

    const xtreamStore = {
        currentPlaylist,
        playlistId,
        portalStatus,
        resetStore: jest.fn((nextPlaylistId?: string) => {
            playlistId.set(nextPlaylistId ?? null);
            currentPlaylist.set(null);
            selectedContentType.set('vod');
        }),
        setCurrentPlaylist: jest.fn((playlist: XtreamPlaylistData | null) => {
            currentPlaylist.set(playlist);
        }),
        fetchXtreamPlaylist: jest.fn().mockResolvedValue(undefined),
        checkPortalStatus: jest.fn(),
        hasUsableOfflineCache: jest.fn().mockImplementation(async () => {
            return hasUsableOfflineCache;
        }),
        contentInitBlockReason,
        initializeContent: jest.fn().mockResolvedValue(undefined),
        setSelectedContentType: jest.fn(
            (type: 'live' | 'vod' | 'series') => {
                selectedContentType.set(type);
            }
        ),
        setContentInitBlockReason: jest.fn(
            (reason: XtreamContentInitBlockReason | null) => {
                contentInitBlockReason.set(reason);
            }
        ),
    };

    const router = {
        url: `/workspace/xtreams/${PLAYLIST_ID}/vod`,
        events: routerEvents.asObservable(),
    };

    beforeEach(async () => {
        router.url = `/workspace/xtreams/${PLAYLIST_ID}/vod`;
        routeProvider.set('xtreams');
        routePlaylistId.set(PLAYLIST_ID);
        activePlaylist.set(ACTIVE_PLAYLIST);
        currentPlaylist.set(XTREAM_PLAYLIST);
        playlistId.set(PLAYLIST_ID);
        portalStatus.set('active');
        selectedContentType.set('vod');
        contentInitBlockReason.set(null);
        hasUsableOfflineCache = false;

        playlistContext.syncFromUrl.mockImplementation((url: string) => ({
            inWorkspace: true,
            provider: 'xtreams',
            playlistId: PLAYLIST_ID,
            section: getXtreamSectionFromUrl(url) as
                | 'favorites'
                | 'live'
                | 'recently-added'
                | 'search'
                | 'series'
                | 'vod'
                | null,
        }));

        xtreamStore.resetStore.mockClear();
        xtreamStore.setCurrentPlaylist.mockClear();
        xtreamStore.fetchXtreamPlaylist.mockClear();
        xtreamStore.checkPortalStatus.mockReset();
        xtreamStore.hasUsableOfflineCache.mockClear();
        xtreamStore.initializeContent.mockClear();
        xtreamStore.setSelectedContentType.mockClear();
        xtreamStore.setContentInitBlockReason.mockClear();

        await TestBed.configureTestingModule({
            providers: [
                XtreamWorkspaceRouteSession,
                {
                    provide: PlaylistContextFacade,
                    useValue: playlistContext,
                },
                {
                    provide: Router,
                    useValue: router,
                },
                {
                    provide: XtreamStore,
                    useValue: xtreamStore,
                },
            ],
        });
    });

    it('initializes content for active import-driven routes', async () => {
        xtreamStore.checkPortalStatus.mockImplementation(async () => {
            portalStatus.set('active');
            return 'active';
        });

        TestBed.inject(XtreamWorkspaceRouteSession);
        await flushEffects();

        expect(xtreamStore.checkPortalStatus).toHaveBeenCalled();
        expect(xtreamStore.setContentInitBlockReason).toHaveBeenCalledWith(null);
        expect(xtreamStore.setSelectedContentType).toHaveBeenCalledWith('vod');
        expect(xtreamStore.initializeContent).toHaveBeenCalled();
    });

    it('reapplies a live route section after resetStore restores the default selection', async () => {
        router.url = `/workspace/xtreams/${PLAYLIST_ID}/live`;
        xtreamStore.checkPortalStatus.mockImplementation(async () => {
            portalStatus.set('active');
            return 'active';
        });

        TestBed.inject(XtreamWorkspaceRouteSession);
        await flushEffects();

        expect(xtreamStore.resetStore).toHaveBeenCalledWith(PLAYLIST_ID);
        expect(xtreamStore.setSelectedContentType).toHaveBeenCalledWith('live');
        expect(selectedContentType()).toBe('live');
        expect(
            xtreamStore.setSelectedContentType.mock.invocationCallOrder[0]
        ).toBeGreaterThan(xtreamStore.resetStore.mock.invocationCallOrder[0]);
    });

    it.each(['expired', 'inactive', 'unavailable'] as const)(
        'blocks %s portals before import-driven initialization starts',
        async (status) => {
            xtreamStore.checkPortalStatus.mockImplementation(async () => {
                portalStatus.set(status);
                return status;
            });

            TestBed.inject(XtreamWorkspaceRouteSession);
            await flushEffects();

            expect(xtreamStore.checkPortalStatus).toHaveBeenCalled();
            expect(xtreamStore.setContentInitBlockReason).toHaveBeenCalledWith(
                status
            );
            expect(xtreamStore.initializeContent).not.toHaveBeenCalled();
        }
    );

    it('allows unavailable portals to initialize cached content', async () => {
        hasUsableOfflineCache = true;
        activePlaylist.set(UPDATED_ACTIVE_PLAYLIST);
        xtreamStore.checkPortalStatus.mockImplementation(async () => {
            portalStatus.set('unavailable');
            return 'unavailable';
        });

        TestBed.inject(XtreamWorkspaceRouteSession);
        await flushEffects();
        await flushEffects();

        expect(xtreamStore.checkPortalStatus).toHaveBeenCalled();
        expect(xtreamStore.hasUsableOfflineCache).toHaveBeenCalled();
        expect(xtreamStore.setContentInitBlockReason).toHaveBeenCalledWith(
            null
        );
        expect(xtreamStore.initializeContent).toHaveBeenCalled();
    });

    it('rebootstraps the current Xtream playlist when its connection details change', async () => {
        activePlaylist.set(UPDATED_ACTIVE_PLAYLIST);
        xtreamStore.checkPortalStatus.mockImplementation(async () => {
            portalStatus.set('active');
            return 'active';
        });

        TestBed.inject(XtreamWorkspaceRouteSession);
        await flushEffects();
        await flushEffects();

        expect(xtreamStore.resetStore).toHaveBeenCalledWith(PLAYLIST_ID);
        expect(xtreamStore.setCurrentPlaylist).toHaveBeenCalledWith(
            expect.objectContaining({
                id: PLAYLIST_ID,
                serverUrl: UPDATED_ACTIVE_PLAYLIST.serverUrl,
            })
        );
        expect(xtreamStore.checkPortalStatus).toHaveBeenCalled();
    });

    it('does not clear a cancelled block while an active portal bootstrap finishes', async () => {
        xtreamStore.checkPortalStatus.mockImplementation(async () => {
            portalStatus.set('active');
            return 'active';
        });
        contentInitBlockReason.set('cancelled');

        TestBed.inject(XtreamWorkspaceRouteSession);
        await flushEffects();

        expect(xtreamStore.checkPortalStatus).toHaveBeenCalled();
        expect(xtreamStore.setContentInitBlockReason).not.toHaveBeenCalledWith(
            null
        );
    });
});
