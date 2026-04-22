import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { DatabaseService, PlaylistsService } from 'services';
import {
    Channel,
    M3uRecentlyViewedItem,
    Playlist,
    PlaylistMeta,
} from 'shared-interfaces';
import { UnifiedCollectionItem } from './unified-collection-item.interface';
import { UnifiedRecentDataService } from './unified-recent-data.service';

describe('UnifiedRecentDataService', () => {
    let service: UnifiedRecentDataService;
    let store: { select: jest.Mock; dispatch: jest.Mock };
    let playlistsService: {
        getPlaylistById: jest.Mock;
        addM3uRecentlyViewed: jest.Mock;
        removeFromM3uRecentlyViewed: jest.Mock;
        removeFromPortalRecentlyViewed: jest.Mock;
        clearPlaylistRecentlyViewed: jest.Mock;
        getAllPlaylists: jest.Mock;
    };
    let dbService: {
        getGlobalRecentlyViewed: jest.Mock;
        getRecentItems: jest.Mock;
        removeRecentItem: jest.Mock;
        clearPlaylistRecentItems: jest.Mock;
        clearGlobalRecentlyViewed: jest.Mock;
        addRecentItem: jest.Mock;
        getContentByXtreamId: jest.Mock;
    };

    const playlistMeta = {
        _id: 'm3u-1',
        title: 'M3U List',
        recentlyViewed: [
            {
                source: 'm3u',
                id: 'https://example.com/2.m3u8',
                url: 'https://example.com/2.m3u8',
                title: 'Recent Channel',
                channel_id: 'channel-2',
                tvg_id: 'recent-two',
                category_id: 'live',
                added_at: '2026-03-26T11:00:00.000Z',
            },
        ],
    } satisfies PlaylistMeta;

    const channels: Channel[] = [
        {
            id: 'channel-1',
            name: 'Channel One',
            url: 'https://example.com/1.m3u8',
            group: { title: 'News' },
            tvg: {
                id: 'one',
                name: 'Channel One',
                url: '',
                logo: 'one.png',
                rec: '',
            },
            http: { referrer: '', 'user-agent': '', origin: '' },
            radio: 'false',
            epgParams: '',
        },
        {
            id: 'channel-2',
            name: 'Channel Two',
            url: 'https://example.com/2.m3u8',
            group: { title: 'Sports' },
            tvg: {
                id: '',
                name: 'Channel Two',
                url: '',
                logo: 'two.png',
                rec: '',
            },
            http: { referrer: '', 'user-agent': '', origin: '' },
            radio: 'true',
            epgParams: '',
        },
    ];

    beforeEach(() => {
        store = {
            select: jest.fn(() => of([playlistMeta])),
            dispatch: jest.fn(),
        };
        playlistsService = {
            getPlaylistById: jest.fn().mockReturnValue(
                of({
                    _id: 'm3u-1',
                    playlist: { items: channels },
                } satisfies Partial<Playlist>)
            ),
            addM3uRecentlyViewed: jest.fn().mockReturnValue(
                of({
                    recentlyViewed: [
                        {
                            source: 'm3u',
                            id: 'https://example.com/1.m3u8',
                            url: 'https://example.com/1.m3u8',
                            title: 'Channel One',
                            category_id: 'live',
                            added_at: '2026-03-26T12:00:00.000Z',
                        },
                    ],
                })
            ),
            removeFromM3uRecentlyViewed: jest.fn().mockReturnValue(of({ recentlyViewed: [] })),
            removeFromPortalRecentlyViewed: jest.fn().mockReturnValue(of({ recentlyViewed: [] })),
            clearPlaylistRecentlyViewed: jest.fn().mockReturnValue(of({ recentlyViewed: [] })),
            getAllPlaylists: jest.fn().mockReturnValue(of([])),
        };
        dbService = {
            getGlobalRecentlyViewed: jest.fn().mockResolvedValue([]),
            getRecentItems: jest.fn().mockResolvedValue([]),
            removeRecentItem: jest.fn().mockResolvedValue(true),
            clearPlaylistRecentItems: jest.fn().mockResolvedValue(true),
            clearGlobalRecentlyViewed: jest.fn().mockResolvedValue(undefined),
            addRecentItem: jest.fn().mockResolvedValue(true),
            getContentByXtreamId: jest.fn().mockResolvedValue(null),
        };

        TestBed.configureTestingModule({
            providers: [
                UnifiedRecentDataService,
                { provide: Store, useValue: store },
                { provide: PlaylistsService, useValue: playlistsService },
                { provide: DatabaseService, useValue: dbService },
            ],
        });

        service = TestBed.inject(UnifiedRecentDataService);
    });

    it('rehydrates M3U recent items with stream and channel metadata', async () => {
        const items = await service.getRecentItems('playlist', 'm3u-1', 'm3u');

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            sourceType: 'm3u',
            streamUrl: 'https://example.com/2.m3u8',
            channelId: 'channel-2',
            name: 'Recent Channel',
            tvgId: 'recent-two',
            logo: 'two.png',
            radio: 'true',
        });
    });

    it('records M3U live playback through playlist recently viewed storage', async () => {
        const item = {
            uid: 'm3u::m3u-1::https://example.com/1.m3u8',
            name: 'Channel One',
            contentType: 'live',
            sourceType: 'm3u',
            playlistId: 'm3u-1',
            playlistName: 'M3U List',
            streamUrl: 'https://example.com/1.m3u8',
            channelId: 'channel-1',
            tvgId: 'one',
            logo: 'one.png',
        } satisfies UnifiedCollectionItem;

        const recorded = await service.recordLivePlayback(item);

        expect(playlistsService.addM3uRecentlyViewed).toHaveBeenCalledWith(
            'm3u-1',
            expect.objectContaining<M3uRecentlyViewedItem>({
                source: 'm3u',
                url: 'https://example.com/1.m3u8',
                channel_id: 'channel-1',
                tvg_id: 'one',
            })
        );
        expect(store.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: expect.stringContaining('Update Playlist Meta'),
            })
        );
        expect(recorded.viewedAt).toBeTruthy();
    });

    it('records Xtream playback with a type-aware fallback lookup', async () => {
        dbService.getContentByXtreamId.mockResolvedValue({
            id: 3867578,
            xtream_id: 290,
            type: 'live',
            title: 'SE: V Film Premiere FHD',
        });

        const item = {
            uid: 'xtream::xtream-1::live:290',
            name: 'SE: V Film Premiere FHD',
            contentType: 'live',
            sourceType: 'xtream',
            playlistId: 'xtream-1',
            playlistName: 'Xtream One',
            xtreamId: 290,
        } satisfies UnifiedCollectionItem;

        const recorded = await service.recordLivePlayback(item);

        expect(dbService.getContentByXtreamId).toHaveBeenCalledWith(
            290,
            'xtream-1',
            'live'
        );
        expect(dbService.addRecentItem).toHaveBeenCalledWith(
            3867578,
            'xtream-1'
        );
        expect(recorded).toEqual(
            expect.objectContaining({
                contentId: 3867578,
                viewedAt: expect.any(String),
            })
        );
    });

    it('builds distinct Xtream recent UIDs when live and series share an xtream id', async () => {
        store.select.mockReturnValue(
            of([
                {
                    _id: 'xtream-1',
                    title: 'Xtream One',
                    serverUrl: 'https://example.com',
                } satisfies Partial<PlaylistMeta>,
            ])
        );
        dbService.getRecentItems.mockResolvedValue([
            {
                id: 3867578,
                category_id: 11,
                title: 'SE: V Film Premiere FHD',
                poster_url: 'https://example.com/live.png',
                xtream_id: 290,
                type: 'live',
                viewed_at: '2026-04-21T20:42:27.000Z',
            },
            {
                id: 3941697,
                category_id: 17,
                title: 'Krypton',
                poster_url: 'https://example.com/krypton.png',
                xtream_id: 290,
                type: 'series',
                viewed_at: '2026-04-21T20:43:27.000Z',
            },
        ]);

        const items = await service.getRecentItems('playlist', 'xtream-1', 'xtream');

        expect(items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    uid: 'xtream::xtream-1::live:290',
                    contentType: 'live',
                    contentId: 3867578,
                }),
                expect.objectContaining({
                    uid: 'xtream::xtream-1::series:290',
                    contentType: 'series',
                    contentId: 3941697,
                }),
            ])
        );
    });

    it('normalizes SQLite-style Xtream recent timestamps to ISO before exposing them', async () => {
        store.select.mockReturnValue(
            of([
                playlistMeta,
                {
                    _id: 'xtream-1',
                    title: 'Xtream One',
                    serverUrl: 'https://example.com',
                } satisfies Partial<PlaylistMeta>,
            ])
        );
        dbService.getGlobalRecentlyViewed.mockResolvedValue([
            {
                id: 3940227,
                category_id: 18,
                title: 'Unter Nachbarn - 2011',
                poster_url: 'https://example.com/unter.png',
                xtream_id: 815302,
                type: 'movie',
                playlist_id: 'xtream-1',
                playlist_name: 'Xtream One',
                viewed_at: '2026-04-21 22:49:02',
            },
        ]);

        const items = await service.getRecentItems('all');
        const xtreamItem = items.find((item) => item.sourceType === 'xtream');

        expect(xtreamItem).toEqual(
            expect.objectContaining({
                name: 'Unter Nachbarn - 2011',
                viewedAt: '2026-04-21T22:49:02.000Z',
            })
        );
    });
});
