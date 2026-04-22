import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { EmptyStateComponent } from '@iptvnator/playlist/shared/ui';
import { WORKSPACE_SHELL_ACTIONS } from '@iptvnator/workspace/shell/util';
import {
    DashboardDataService,
    DashboardFavoriteItem,
    DashboardRecentlyAddedItem,
    GlobalRecentItem,
} from 'workspace-dashboard-data-access';
import {
    DashboardRailCard,
    DashboardRailComponent,
} from './dashboard-rail.component';

// Cap dashboard rails at 20 items. Users get ~3× what's visible at once,
// the DOM stays cheap, and the "Manage all" link is one click away for the
// full list. Matches the single-rail density of Netflix / Apple TV+.
const RAIL_ITEM_LIMIT = 20;

// Six placeholder slots per skeleton rail — fills a typical viewport without
// taking the whole page. Mirrors the recently-added skeleton density.
const SKELETON_CARDS_PER_RAIL = [1, 2, 3, 4, 5, 6] as const;
const SKELETON_RAILS = [1, 2, 3] as const;

interface DashboardHeroModel {
    readonly backdropUrl?: string;
    readonly hasBackdrop: boolean;
    readonly icon: string;
    readonly link: string[];
    readonly posterUrl?: string;
    readonly state?: Record<string, unknown>;
    readonly subtitle: string;
    readonly title: string;
}

@Component({
    selector: 'lib-workspace-dashboard-rails',
    imports: [
        DashboardRailComponent,
        EmptyStateComponent,
        MatButtonModule,
        MatIcon,
        RouterLink,
        TranslatePipe,
    ],
    templateUrl: './workspace-dashboard-rails.component.html',
    styleUrl: './workspace-dashboard-rails.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceDashboardRailsComponent {
    readonly data = inject(DashboardDataService);
    private readonly translate = inject(TranslateService);
    private readonly shellActions = inject(WORKSPACE_SHELL_ACTIONS);

    readonly hasPlaylists = computed(() => this.data.playlists().length > 0);
    readonly ready = this.data.dashboardReady;
    readonly xtreamPlaylistCount = this.data.xtreamPlaylistCount;

    readonly skeletonSlots = SKELETON_CARDS_PER_RAIL;
    readonly skeletonRails = SKELETON_RAILS;

    readonly hero = computed<DashboardHeroModel | null>(() => {
        const item = this.data.globalRecentItems()[0] ?? null;
        if (!item) {
            return null;
        }

        return {
            backdropUrl: item.backdrop_url || item.poster_url,
            hasBackdrop: Boolean(item.backdrop_url),
            icon: this.typeIcon(item.type),
            link: this.data.getRecentItemLink(item),
            posterUrl: item.poster_url,
            state: this.data.getRecentItemNavigationState(item),
            subtitle: this.buildHeroSubtitle(item),
            title: item.title,
        };
    });

    readonly recentlyWatchedCards = computed<DashboardRailCard[]>(() =>
        this.data
            .globalRecentItems()
            .slice(0, RAIL_ITEM_LIMIT)
            .map((item) => this.toRecentCard(item))
    );

    readonly favoriteCards = computed<DashboardRailCard[]>(() =>
        this.data
            .globalFavoriteItems()
            .slice(0, RAIL_ITEM_LIMIT)
            .map((item) => this.toFavoriteCard(item))
    );

    readonly xtreamRecentlyAddedCards = computed<DashboardRailCard[]>(() =>
        this.data
            .xtreamRecentlyAddedItems()
            .slice(0, RAIL_ITEM_LIMIT)
            .map((item) => this.toRecentlyAddedCard(item))
    );

    readonly sourceCards = computed<DashboardRailCard[]>(() =>
        this.data.recentPlaylists().map((playlist) => ({
            id: playlist._id,
            title:
                playlist.title ||
                playlist.filename ||
                this.t('WORKSPACE.DASHBOARD.UNTITLED_SOURCE'),
            subtitle: this.data.getPlaylistProvider(playlist),
            icon: playlist.serverUrl
                ? 'cloud'
                : playlist.macAddress
                  ? 'cast'
                  : 'folder_open',
            link: this.data.getPlaylistLink(playlist),
        }))
    );

    constructor() {
        // Re-entering the dashboard should pick up any DB-backed recent/favorite
        // changes made while viewing details, including newly backfilled
        // backdrops that do not change recency ordering.
        void this.data.reloadGlobalRecentItems();
        void this.data.reloadGlobalFavorites();

        // Refresh when Xtream playlist count changes so a newly added provider
        // populates the rail without a manual dashboard reload.
        effect(() => {
            if (this.xtreamPlaylistCount() === 0) {
                return;
            }

            void this.data.reloadXtreamRecentlyAddedItems(RAIL_ITEM_LIMIT);
        });
    }

    onAddPlaylist(): void {
        this.shellActions.openAddPlaylistDialog();
    }

    private buildHeroSubtitle(item: GlobalRecentItem): string {
        const parts = [
            item.playlist_name,
            this.data.getRecentItemProviderLabel(item),
            this.data.getRecentItemTypeLabel(item),
        ].filter((value): value is string => Boolean(value));
        return parts.join(' · ');
    }

    private toRecentCard(item: GlobalRecentItem): DashboardRailCard {
        return {
            id: `recent-${item.id}-${item.playlist_id}-${item.viewed_at}`,
            title: item.title,
            subtitle: `${this.data.getRecentItemProviderLabel(item)} · ${this.data.getRecentItemTypeLabel(item)}`,
            imageUrl: item.poster_url,
            icon: this.typeIcon(item.type),
            link: this.data.getRecentItemLink(item),
            state: this.data.getRecentItemNavigationState(item),
        };
    }

    private toFavoriteCard(item: DashboardFavoriteItem): DashboardRailCard {
        return {
            id: `fav-${item.id}-${item.playlist_id}-${item.added_at}`,
            title: item.title,
            subtitle: `${this.data.getFavoriteItemProviderLabel(item)} · ${this.data.getFavoriteItemTypeLabel(item)}`,
            imageUrl: item.poster_url,
            icon: this.typeIcon(item.type),
            link: this.data.getGlobalFavoriteLink(item),
            state: this.data.getGlobalFavoriteNavigationState(item),
        };
    }

    private toRecentlyAddedCard(
        item: DashboardRecentlyAddedItem
    ): DashboardRailCard {
        const typeLabel = this.data.getRecentlyAddedItemTypeLabel(item);
        const subtitleParts = [item.playlist_name, typeLabel].filter(
            (value): value is string => Boolean(value)
        );
        return {
            id: `added-${item.id}-${item.playlist_id}-${item.added_at}`,
            title: item.title,
            subtitle: subtitleParts.join(' · '),
            imageUrl: item.poster_url,
            icon: this.typeIcon(item.type),
            link: this.data.getRecentlyAddedLink(item),
            state: this.data.getRecentlyAddedNavigationState(item),
        };
    }

    private typeIcon(type: 'live' | 'movie' | 'series'): string {
        if (type === 'live') return 'live_tv';
        if (type === 'movie') return 'movie';
        return 'video_library';
    }

    private t(key: string): string {
        return this.translate.instant(key);
    }
}
