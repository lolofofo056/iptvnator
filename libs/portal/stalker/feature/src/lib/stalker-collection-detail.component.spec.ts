import { Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ContentHeroComponent } from 'components';
import { UnifiedCollectionItem } from '@iptvnator/portal/shared/util';
import { StalkerStore } from '@iptvnator/portal/stalker/data-access';
import { PlaylistsService } from 'services';
import { Playlist } from 'shared-interfaces';
import { of } from 'rxjs';
import { StalkerCollectionDetailComponent } from './stalker-collection-detail.component';
import { StalkerInlineDetailComponent } from './stalker-inline-detail/stalker-inline-detail.component';

@Component({
    selector: 'app-content-hero',
    standalone: true,
    template: '',
})
class StubContentHeroComponent {
    readonly isLoading = input(false);
}

@Component({
    selector: 'app-stalker-inline-detail',
    standalone: true,
    template: '',
})
class StubStalkerInlineDetailComponent {
    readonly categoryId = input<'vod' | 'series' | null>(null);
    readonly seriesItem = input<unknown>(null);
    readonly isSeries = input(false);
    readonly vodDetailsItem = input<unknown>(null);
    readonly isFavorite = input(false);
    readonly backClicked = output<void>();
    readonly playClicked = output<unknown>();
    readonly favoriteToggled = output<unknown>();
}

describe('StalkerCollectionDetailComponent', () => {
    let fixture: ComponentFixture<StalkerCollectionDetailComponent>;
    let currentPlaylist: ReturnType<typeof signal<Playlist | undefined>>;
    let selectedContentType: ReturnType<
        typeof signal<'vod' | 'itv' | 'series'>
    >;
    let selectedCategoryId: ReturnType<typeof signal<string | null>>;
    let selectedItem: ReturnType<typeof signal<unknown>>;
    let stalkerStore: {
        currentPlaylist: typeof currentPlaylist;
        selectedContentType: typeof selectedContentType;
        selectedCategoryId: typeof selectedCategoryId;
        selectedItem: typeof selectedItem;
        setCurrentPlaylist: jest.Mock;
        setSelectedContentType: jest.Mock;
        setSelectedCategory: jest.Mock;
        setSelectedItem: jest.Mock;
        addToFavorites: jest.Mock;
        removeFromFavorites: jest.Mock;
        createLinkToPlayVod: jest.Mock;
    };

    const playlist = {
        _id: 'stalker-1',
        title: 'Stalker Portal',
        portalUrl: 'http://portal.example/portal.php',
        macAddress: '00:1A:79:00:00:01',
        favorites: [],
    } as unknown as Playlist;

    beforeEach(async () => {
        currentPlaylist = signal<Playlist | undefined>(undefined);
        selectedContentType = signal<'vod' | 'itv' | 'series'>('vod');
        selectedCategoryId = signal<string | null>(null);
        selectedItem = signal<unknown>(null);
        stalkerStore = {
            currentPlaylist,
            selectedContentType,
            selectedCategoryId,
            selectedItem,
            setCurrentPlaylist: jest.fn(async (value: Playlist | undefined) => {
                currentPlaylist.set(value);
            }),
            setSelectedContentType: jest.fn(
                (value: 'vod' | 'itv' | 'series') => {
                    selectedContentType.set(value);
                }
            ),
            setSelectedCategory: jest.fn((value: string | null) => {
                selectedCategoryId.set(value);
            }),
            setSelectedItem: jest.fn((value: unknown) => {
                selectedItem.set(value);
            }),
            addToFavorites: jest.fn(),
            removeFromFavorites: jest.fn(),
            createLinkToPlayVod: jest.fn(),
        };

        await TestBed.configureTestingModule({
            imports: [StalkerCollectionDetailComponent],
            providers: [
                {
                    provide: StalkerStore,
                    useValue: stalkerStore,
                },
                {
                    provide: PlaylistsService,
                    useValue: {
                        getPlaylistById: jest.fn(() => of(playlist)),
                        getPortalFavorites: jest.fn(() => of([])),
                    },
                },
            ],
        })
            .overrideComponent(StalkerCollectionDetailComponent, {
                remove: {
                    imports: [ContentHeroComponent, StalkerInlineDetailComponent],
                },
                add: {
                    imports: [
                        StubContentHeroComponent,
                        StubStalkerInlineDetailComponent,
                    ],
                },
            })
            .compileComponents();

        fixture = TestBed.createComponent(StalkerCollectionDetailComponent);
    });

    afterEach(() => {
        fixture?.destroy();
    });

    it('opens legacy VOD is_series favorites through the lazy VOD-series flow', async () => {
        fixture.componentRef.setInput(
            'item',
            buildCollectionItem({
                contentType: 'series',
                categoryId: 'series',
                stalkerItem: {
                    id: '1507',
                    title: 'Flagged Series',
                    category_id: 'series',
                    cmd: '/media/file_1507.mpg',
                    is_series: '1',
                },
            })
        );

        await settleDetail(fixture);

        expect(stalkerStore.setSelectedContentType).toHaveBeenLastCalledWith(
            'vod'
        );
        expect(stalkerStore.setSelectedCategory).toHaveBeenLastCalledWith('vod');
        expect(stalkerStore.setSelectedItem).toHaveBeenLastCalledWith(
            expect.objectContaining({
                id: '1507',
                is_series: true,
            })
        );
        expect(fixture.componentInstance.inlineDetail()).toEqual(
            expect.objectContaining({
                categoryId: 'vod',
                isSeries: true,
                vodDetailsItem: null,
            })
        );
    });

    it('keeps regular Stalker series favorites in regular series mode', async () => {
        fixture.componentRef.setInput(
            'item',
            buildCollectionItem({
                contentType: 'series',
                categoryId: 'series',
                stalkerItem: {
                    id: '30001',
                    series_id: '30001',
                    title: 'Regular Series',
                    category_id: 'series',
                },
            })
        );

        await settleDetail(fixture);

        expect(stalkerStore.setSelectedContentType).toHaveBeenLastCalledWith(
            'series'
        );
        expect(fixture.componentInstance.inlineDetail()).toEqual(
            expect.objectContaining({
                categoryId: 'series',
                isSeries: false,
                vodDetailsItem: null,
            })
        );
    });

    it('keeps embedded VOD series favorites in the embedded VOD-series path', async () => {
        fixture.componentRef.setInput(
            'item',
            buildCollectionItem({
                contentType: 'series',
                categoryId: 'series',
                stalkerItem: {
                    id: '20001',
                    title: 'Embedded Series',
                    category_id: 'series',
                    cmd: '/media/file_20001.mpg',
                    series: [1, 2],
                },
            })
        );

        await settleDetail(fixture);

        expect(stalkerStore.setSelectedContentType).toHaveBeenLastCalledWith(
            'vod'
        );
        expect(fixture.componentInstance.inlineDetail()).toEqual(
            expect.objectContaining({
                categoryId: 'vod',
                isSeries: false,
                vodDetailsItem: null,
            })
        );
        expect(
            fixture.componentInstance.inlineDetail().seriesItem?.series
        ).toEqual([1, 2]);
    });
});

function buildCollectionItem(
    overrides: Partial<UnifiedCollectionItem>
): UnifiedCollectionItem {
    return {
        uid: 'stalker::stalker-1::item-1',
        name: 'Item',
        contentType: 'movie',
        sourceType: 'stalker',
        playlistId: 'stalker-1',
        playlistName: 'Stalker Portal',
        stalkerId: 'item-1',
        ...overrides,
    };
}

async function settleDetail(
    fixture: ComponentFixture<StalkerCollectionDetailComponent>
): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
}
