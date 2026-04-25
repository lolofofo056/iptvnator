import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';
import { ContentHeroComponent } from 'components';
import {
    buildStalkerStateItem,
    toStalkerCategoryId,
    UnifiedCollectionItem,
} from '@iptvnator/portal/shared/util';
import {
    buildStalkerSelectedVodItem,
    clearStalkerDetailViewState,
    createPortalFavoritesResource,
    createRefreshTrigger,
    createStalkerDetailViewState,
    createStalkerInlineDetailState,
    isSelectedStalkerVodFavorite,
    isStalkerSeriesFlag,
    StalkerSelectedVodItem,
    StalkerStore,
    toggleStalkerVodFavorite,
} from '@iptvnator/portal/stalker/data-access';
import { PlaylistsService } from 'services';
import { Playlist, StalkerPortalItem, VodDetailsItem } from 'shared-interfaces';
import { firstValueFrom } from 'rxjs';
import { StalkerInlineDetailComponent } from './stalker-inline-detail/stalker-inline-detail.component';

interface StalkerCollectionStateSnapshot {
    currentPlaylist: Playlist | undefined;
    selectedContentType: 'vod' | 'itv' | 'series';
    selectedCategoryId: string | null | undefined;
    selectedItem: unknown;
}

type StalkerDetailCategory = 'vod' | 'series';

interface StalkerCollectionDetailMode {
    category: StalkerDetailCategory;
    selectedContentType: StalkerDetailCategory;
    hasEmbeddedSeries: boolean;
    needsSeriesFetch: boolean;
}

@Component({
    selector: 'app-stalker-collection-detail',
    imports: [ContentHeroComponent, StalkerInlineDetailComponent],
    template: `
        @if (inlineDetail().categoryId) {
            <app-stalker-inline-detail
                [categoryId]="inlineDetail().categoryId"
                [seriesItem]="inlineDetail().seriesItem"
                [isSeries]="inlineDetail().isSeries"
                [vodDetailsItem]="inlineDetail().vodDetailsItem"
                [isFavorite]="isSelectedVodFavorite()"
                (backClicked)="closeRequested.emit()"
                (playClicked)="onVodPlay($event)"
                (favoriteToggled)="onVodFavoriteToggled($event)"
            />
        } @else {
            <app-content-hero [isLoading]="true" />
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [
        `
            :host {
                display: block;
                width: 100%;
                height: 100%;
                min-height: 0;
            }
        `,
    ],
})
export class StalkerCollectionDetailComponent {
    readonly item = input<UnifiedCollectionItem | null>(null);
    readonly closeRequested = output<void>();

    private readonly playlistsService = inject(PlaylistsService);
    private readonly stalkerStore = inject(StalkerStore);
    private readonly originalState = this.captureStoreState();
    private readonly favoritesRefresh = createRefreshTrigger();

    readonly itemDetails = signal<StalkerSelectedVodItem | null>(null);
    readonly vodDetailsItem = signal<VodDetailsItem | null>(null);
    readonly isSelectedVodFavorite = signal(false);
    readonly detailCategoryOverride = signal<StalkerDetailCategory | null>(
        null
    );
    readonly inlineDetail = computed(() =>
        createStalkerInlineDetailState(
            this.itemDetails(),
            this.vodDetailsItem(),
            this.detailCategoryOverride()
        )
    );

    readonly portalFavorites = createPortalFavoritesResource(
        this.playlistsService,
        () => this.stalkerStore.currentPlaylist()?._id,
        () => this.favoritesRefresh.refreshVersion()
    );

    private initRequestId = 0;

    constructor() {
        effect(() => {
            this.portalFavorites.value();
            this.syncSelectedVodFavorite();
        });

        effect(() => {
            const item = this.item();
            untracked(() => {
                void this.prepareDetail(item);
            });
        });
    }

    ngOnDestroy(): void {
        void this.stalkerStore.setCurrentPlaylist(
            this.originalState.currentPlaylist
        );
        this.stalkerStore.setSelectedContentType(
            this.originalState.selectedContentType
        );
        this.stalkerStore.setSelectedCategory(
            this.originalState.selectedCategoryId
        );
        this.stalkerStore.setSelectedItem(
            this.originalState.selectedItem as never
        );
    }

    onVodPlay(item: VodDetailsItem): void {
        if (item.type === 'stalker') {
            this.stalkerStore.createLinkToPlayVod(
                item.cmd,
                item.data.info?.name,
                item.data.info?.movie_image
            );
        }
    }

    onVodFavoriteToggled(event: {
        item: VodDetailsItem;
        isFavorite: boolean;
    }): void {
        toggleStalkerVodFavorite(event, {
            addToFavorites: (item, onDone) =>
                this.stalkerStore.addToFavorites(
                    item as StalkerPortalItem,
                    onDone
                ),
            removeFromFavorites: (favoriteId, onDone) =>
                this.stalkerStore.removeFromFavorites(favoriteId, onDone),
            onComplete: () => {
                this.favoritesRefresh.refresh();
                this.syncSelectedVodFavorite();
            },
        });
    }

    private async prepareDetail(
        item: UnifiedCollectionItem | null
    ): Promise<void> {
        const requestId = ++this.initRequestId;

        if (!item) {
            this.clearLocalDetailState();
            return;
        }

        const playlist = await this.loadPlaylist(item.playlistId);
        if (requestId !== this.initRequestId) {
            return;
        }

        if (!playlist?.macAddress || !playlist.portalUrl) {
            this.clearLocalDetailState();
            return;
        }

        await this.stalkerStore.setCurrentPlaylist(playlist);
        if (requestId !== this.initRequestId) {
            return;
        }

        const stalkerItem = this.resolveStalkerItem(item);
        const detailMode = this.resolveDetailMode(item, stalkerItem);
        const itemDetails = buildStalkerSelectedVodItem(
            stalkerItem as never,
            detailMode.needsSeriesFetch
        );

        this.detailCategoryOverride.set(detailMode.category);
        this.stalkerStore.setSelectedContentType(detailMode.selectedContentType);
        this.stalkerStore.setSelectedCategory(
            this.resolveSelectedCategory(item, stalkerItem, detailMode)
        );
        this.stalkerStore.setSelectedItem(itemDetails);
        this.itemDetails.set(itemDetails);

        if (
            detailMode.selectedContentType === 'vod' &&
            !detailMode.hasEmbeddedSeries &&
            !detailMode.needsSeriesFetch
        ) {
            const detailViewState = createStalkerDetailViewState(
                itemDetails,
                playlist._id
            );
            this.itemDetails.set(detailViewState.itemDetails);
            this.vodDetailsItem.set(detailViewState.vodDetailsItem);
            this.syncSelectedVodFavorite();
            return;
        }

        const cleared = clearStalkerDetailViewState();
        this.vodDetailsItem.set(cleared.vodDetailsItem);
        this.isSelectedVodFavorite.set(false);
    }

    private captureStoreState(): StalkerCollectionStateSnapshot {
        return {
            currentPlaylist:
                (this.stalkerStore.currentPlaylist() as Playlist | undefined) ??
                undefined,
            selectedContentType: this.stalkerStore.selectedContentType(),
            selectedCategoryId: this.stalkerStore.selectedCategoryId(),
            selectedItem: this.stalkerStore.selectedItem(),
        };
    }

    private async loadPlaylist(playlistId: string): Promise<Playlist | null> {
        try {
            return (
                (await firstValueFrom(
                    this.playlistsService.getPlaylistById(playlistId)
                )) ?? null
            );
        } catch {
            return null;
        }
    }

    private resolveStalkerItem(item: UnifiedCollectionItem): StalkerPortalItem {
        return buildStalkerStateItem(
            item.stalkerItem as StalkerPortalItem | undefined,
            {
                id:
                    item.stalkerId ??
                    item.uid.split('::')[item.uid.split('::').length - 1] ??
                    item.uid,
                title: item.name,
                type: item.contentType,
                category_id: item.categoryId,
                poster_url: item.posterUrl ?? item.logo ?? undefined,
            }
        ) as StalkerPortalItem;
    }

    private resolveDetailMode(
        item: UnifiedCollectionItem,
        stalkerItem: StalkerPortalItem
    ): StalkerCollectionDetailMode {
        const hasEmbeddedSeries = Array.isArray(
            (stalkerItem as { series?: unknown[] }).series
        )
            ? (stalkerItem as { series?: unknown[] }).series!.length > 0
            : false;
        const isVodSeries = isStalkerSeriesFlag(
            (stalkerItem as { is_series?: unknown }).is_series
        );
        const isRegularSeries =
            item.contentType === 'series' && !hasEmbeddedSeries && !isVodSeries;
        const selectedContentType: StalkerDetailCategory = isRegularSeries
            ? 'series'
            : 'vod';

        return {
            category: selectedContentType,
            selectedContentType,
            hasEmbeddedSeries,
            needsSeriesFetch:
                selectedContentType === 'vod' &&
                !hasEmbeddedSeries &&
                isVodSeries,
        };
    }

    private resolveSelectedCategory(
        item: UnifiedCollectionItem,
        stalkerItem: StalkerPortalItem,
        detailMode: StalkerCollectionDetailMode
    ): string | number {
        const categoryId =
            item.categoryId ??
            (stalkerItem as { category_id?: string | number }).category_id;

        if (
            detailMode.selectedContentType === 'vod' &&
            String(categoryId ?? '').toLowerCase() === 'series'
        ) {
            return 'vod';
        }

        return categoryId ?? toStalkerCategoryId(detailMode.selectedContentType);
    }

    private syncSelectedVodFavorite(): void {
        this.isSelectedVodFavorite.set(
            isSelectedStalkerVodFavorite(
                this.vodDetailsItem(),
                this.portalFavorites.value() ?? []
            )
        );
    }

    private clearLocalDetailState(): void {
        const cleared = clearStalkerDetailViewState();
        this.itemDetails.set(cleared.itemDetails);
        this.vodDetailsItem.set(cleared.vodDetailsItem);
        this.detailCategoryOverride.set(null);
        this.isSelectedVodFavorite.set(false);
    }
}
