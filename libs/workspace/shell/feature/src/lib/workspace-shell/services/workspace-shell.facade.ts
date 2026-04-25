import {
    computed,
    DestroyRef,
    effect,
    inject,
    Injectable,
    signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NavigationEnd, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { filter, firstValueFrom, startWith } from 'rxjs';
import { PlaylistInfoComponent } from '@iptvnator/playlist/shared/ui';
import {
    PlaylistContextFacade,
    PlaylistRefreshActionService,
} from '@iptvnator/playlist/shared/util';
import {
    buildPortalRailLinks,
    PORTAL_EXTERNAL_PLAYBACK,
    PortalRailLink,
    PortalRailSection,
    WorkspaceCommandContribution,
    WorkspaceCommandSelection,
    WorkspaceHeaderAction,
    WorkspaceHeaderContextService,
    WorkspaceResolvedCommandItem,
    WorkspaceViewCommandService,
} from '@iptvnator/portal/shared/util';
import { XtreamStore } from '@iptvnator/portal/xtream/data-access';
import { StalkerStore } from '@iptvnator/portal/stalker/data-access';
import {
    parseWorkspaceShellRoute,
    WorkspacePortalContext,
    WorkspaceShellPageKind,
    WorkspaceSearchCapability,
    WorkspaceStartupPreferencesService,
} from '@iptvnator/workspace/shell/util';
import { DownloadsService, PlaylistsService, SettingsStore } from 'services';
import { PlaylistActions, selectAllPlaylistsMeta } from 'm3u-state';
import { PlaylistMeta } from 'shared-interfaces';
import {
    WorkspaceAccountInfoData,
    WORKSPACE_SHELL_ACTIONS,
} from '@iptvnator/workspace/shell/util';
import { WorkspaceCommandPaletteComponent } from '../../workspace-command-palette/workspace-command-palette.component';

export interface WorkspaceHeaderBulkAction {
    icon: string;
    tooltip: string;
    ariaLabel: string;
    disabled: boolean;
}

type XtreamImportPhaseTone = 'remote' | 'local' | null;

const SEARCH_INPUT_DEBOUNCE_MS = 350;
const SEARCH_PLAYLIST_PLACEHOLDER =
    'WORKSPACE.SHELL.SEARCH_PLAYLIST_PLACEHOLDER';
const SEARCH_SECTION_PLACEHOLDER = 'WORKSPACE.SHELL.SEARCH_SECTION_PLACEHOLDER';
const FILTER_SECTION_PLACEHOLDER = 'WORKSPACE.SHELL.FILTER_SECTION_PLACEHOLDER';
const SEARCH_SOURCES_PLACEHOLDER = 'WORKSPACE.SHELL.SEARCH_SOURCES_PLACEHOLDER';
const SEARCH_LOADED_ONLY_STATUS = 'WORKSPACE.SHELL.SEARCH_STATUS_LOADED_ONLY';
const CLEAR_RECENTLY_VIEWED_TOOLTIP =
    'WORKSPACE.SHELL.CLEAR_RECENTLY_VIEWED_SECTION';
const CLEAR_RECENTLY_VIEWED_ARIA =
    'WORKSPACE.SHELL.CLEAR_RECENTLY_VIEWED_SECTION_ARIA';

const RAIL_TOOLTIP_KEYS: Readonly<Partial<Record<PortalRailSection, string>>> =
    {
        vod: 'WORKSPACE.SHELL.RAIL_MOVIES',
        live: 'WORKSPACE.SHELL.RAIL_LIVE',
        itv: 'WORKSPACE.SHELL.RAIL_LIVE',
        series: 'WORKSPACE.SHELL.RAIL_SERIES',
        'recently-added': 'WORKSPACE.SHELL.RAIL_RECENTLY_ADDED',
        search: 'WORKSPACE.SHELL.RAIL_SEARCH',
        recent: 'WORKSPACE.SHELL.RAIL_RECENT',
        favorites: 'WORKSPACE.SHELL.RAIL_FAVORITES',
        downloads: 'WORKSPACE.SHELL.RAIL_DOWNLOADS',
        all: 'WORKSPACE.SHELL.RAIL_ALL_CHANNELS',
        groups: 'WORKSPACE.SHELL.RAIL_GROUPS',
    };

@Injectable()
export class WorkspaceShellFacade {
    private readonly router = inject(Router);
    private readonly store = inject(Store);
    private readonly xtreamStore = inject(XtreamStore);
    private readonly stalkerStore = inject(StalkerStore);
    private readonly destroyRef = inject(DestroyRef);
    readonly externalPlayback = inject(PORTAL_EXTERNAL_PLAYBACK);
    private readonly settingsStore = inject(SettingsStore);
    private readonly playlistsService = inject(PlaylistsService);
    private readonly workspaceActions = inject(WORKSPACE_SHELL_ACTIONS);
    private readonly translate = inject(TranslateService);
    private readonly dialog = inject(MatDialog);
    private readonly playlistContext = inject(PlaylistContextFacade);
    private readonly startupPreferences = inject(
        WorkspaceStartupPreferencesService
    );
    readonly headerContext = inject(WorkspaceHeaderContextService);
    private readonly viewCommands = inject(WorkspaceViewCommandService);
    private readonly playlistRefreshAction = inject(
        PlaylistRefreshActionService
    );
    private readonly downloadsService = inject(DownloadsService);
    readonly hasActiveDownloads = computed(
        () => this.isElectron && this.downloadsService.activeCount() > 0
    );
    private readonly languageTick = toSignal(
        this.translate.onLangChange.pipe(startWith(null)),
        { initialValue: null }
    );

    private searchDebounceTimeoutId: ReturnType<typeof setTimeout> | null =
        null;
    private commandPaletteRef: MatDialogRef<
        WorkspaceCommandPaletteComponent,
        WorkspaceCommandSelection | undefined
    > | null = null;
    private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
        if (!(event.ctrlKey || event.metaKey)) {
            return;
        }

        if (event.key.toLowerCase() === 'k') {
            event.preventDefault();
            this.openCommandPalette();
        }
    };

    readonly playlistTitle = computed(() => {
        const playlist = this.playlistContext.activePlaylist();

        return (
            playlist?.title ||
            playlist?.filename ||
            playlist?.url ||
            playlist?.portalUrl ||
            'Untitled playlist'
        );
    });
    private readonly activePlaylist = this.playlistContext.activePlaylist;
    private readonly playlists = this.store.selectSignal(
        selectAllPlaylistsMeta
    );
    readonly hasNoPlaylists = computed(() => this.playlists().length === 0);

    readonly searchQuery = signal('');
    readonly appliedSearchQuery = signal('');
    readonly isElectron = !!window.electron;
    readonly isMacOS = window.electron?.platform === 'darwin';
    readonly currentUrl = signal(this.router.url);
    readonly currentRoute = computed(() =>
        parseWorkspaceShellRoute(this.currentUrl())
    );
    readonly showDashboard = computed(() =>
        this.startupPreferences.showDashboard()
    );
    readonly brandLink = computed(() =>
        this.startupPreferences.getFirstAvailableWorkspacePath(
            this.showDashboard()
        )
    );
    readonly brandTooltipKey = computed(() =>
        this.showDashboard()
            ? 'WORKSPACE.SHELL.RAIL_DASHBOARD'
            : 'WORKSPACE.SHELL.RAIL_SOURCES'
    );
    readonly brandAriaLabelKey = computed(() =>
        this.showDashboard()
            ? 'WORKSPACE.SHELL.OPEN_DASHBOARD'
            : 'WORKSPACE.SHELL.OPEN_SOURCES'
    );
    readonly currentContext = computed(() => this.currentRoute().context);
    readonly currentSection = computed(() => this.currentRoute().section);
    readonly commandPaletteCommands = computed<WorkspaceResolvedCommandItem[]>(
        () => this.getCommandPaletteItems()
    );
    readonly workspaceLinks = computed<PortalRailLink[]>(() => {
        this.languageTick();

        const links: PortalRailLink[] = [];

        if (this.showDashboard()) {
            links.push({
                icon: 'dashboard',
                tooltip: this.translateText('WORKSPACE.SHELL.RAIL_DASHBOARD'),
                path: ['/workspace/dashboard'],
                exact: true,
            });
        }

        links.push({
            icon: 'library_books',
            tooltip: this.translateText('WORKSPACE.SHELL.RAIL_SOURCES'),
            path: ['/workspace/sources'],
        });

        links.push({
            icon: 'favorite',
            tooltip: this.translateText(
                'WORKSPACE.SHELL.RAIL_GLOBAL_FAVORITES'
            ),
            path: ['/workspace/global-favorites'],
            exact: true,
        });

        links.push({
            icon: 'history',
            tooltip: this.translateText('WORKSPACE.SHELL.RAIL_GLOBAL_RECENT'),
            path: ['/workspace/global-recent'],
            exact: true,
        });

        return links;
    });
    readonly isDashboardRoute = computed(
        () => this.currentRoute().kind === 'dashboard'
    );
    readonly isSourcesRoute = computed(
        () => this.currentRoute().kind === 'sources'
    );
    readonly isSettingsRoute = computed(
        () => this.currentRoute().kind === 'settings'
    );
    readonly isGlobalDownloadsRoute = computed(
        () => this.currentRoute().kind === 'downloads'
    );
    readonly railContext = computed<WorkspacePortalContext | null>(() => {
        const routeContext = this.currentContext();
        if (routeContext) {
            return routeContext;
        }

        const currentRoute = this.currentRoute();
        if (
            currentRoute.kind !== 'dashboard' &&
            currentRoute.kind !== 'sources' &&
            currentRoute.kind !== 'settings' &&
            currentRoute.kind !== 'global-favorites' &&
            currentRoute.kind !== 'global-recent' &&
            currentRoute.kind !== 'downloads'
        ) {
            return null;
        }

        const activePlaylist = this.activePlaylist();
        if (!activePlaylist?._id) {
            return null;
        }

        return {
            provider: this.getProviderFromPlaylist(activePlaylist),
            playlistId: activePlaylist._id,
        };
    });
    readonly externalPlaybackSession = this.externalPlayback.visibleSession;
    readonly showExternalPlaybackBar = computed(
        () => this.settingsStore.showExternalPlaybackBar?.() ?? true
    );
    readonly dashboardXtreamContext = computed<WorkspacePortalContext | null>(
        () => {
            if (!this.isDashboardRoute()) {
                return null;
            }

            const context = this.railContext();
            if (!context || context.provider !== 'xtreams') {
                return null;
            }

            return context;
        }
    );
    readonly contextPanel = computed(() => this.currentRoute().contextPanel);
    readonly showContextPanel = computed(
        () => this.currentRoute().contextPanel !== 'none'
    );
    readonly xtreamImportCount = this.xtreamStore.getImportCount;
    readonly xtreamItemsToImport = this.xtreamStore.itemsToImport;
    readonly xtreamActiveImportCount = this.xtreamStore.activeImportCurrentCount;
    readonly xtreamActiveItemsToImport =
        this.xtreamStore.activeImportTotalCount;
    readonly xtreamImportPhase = this.xtreamStore.currentImportPhase;
    readonly isCancellingXtreamImport = this.xtreamStore.isCancellingImport;
    readonly canCancelXtreamImport = computed(
        () =>
            this.isElectron &&
            this.xtreamStore.isImporting() &&
            Boolean(this.xtreamStore.activeImportSessionId()) &&
            !this.xtreamStore.isCancellingImport()
    );
    readonly xtreamImportTitleLabel = computed(() =>
        this.translateText('WORKSPACE.SHELL.XTREAM_IMPORT_TITLE')
    );
    readonly xtreamImportTypeLabel = computed(() => {
        this.languageTick();

        switch (this.xtreamStore.activeImportContentType()) {
            case 'live':
                return this.translateText('WORKSPACE.SHELL.RAIL_LIVE');
            case 'vod':
                return this.translateText('WORKSPACE.SHELL.RAIL_MOVIES');
            case 'series':
                return this.translateText('WORKSPACE.SHELL.RAIL_SERIES');
            default:
                return '';
        }
    });
    readonly xtreamImportProgressLabel = computed(() => {
        const type = this.xtreamImportTypeLabel();
        const total = this.xtreamActiveItemsToImport();

        if (!type || total === 0) {
            return '';
        }

        return this.translateText('WORKSPACE.SHELL.XTREAM_IMPORT_PROGRESS', {
            type,
            current: this.formatLocalizedNumber(this.xtreamActiveImportCount()),
            total: this.formatLocalizedNumber(total),
        });
    });
    readonly xtreamImportPhaseTone = computed<XtreamImportPhaseTone>(() => {
        switch (this.xtreamStore.currentImportPhase()) {
            case 'loading-categories':
            case 'loading-live':
            case 'loading-movies':
            case 'loading-series':
                return 'remote';
            case 'preparing-content':
            case 'saving-categories':
            case 'saving-content':
            case 'restoring-favorites':
            case 'restoring-recently-viewed':
                return 'local';
            default:
                return null;
        }
    });
    readonly xtreamImportSourceLabel = computed(() => {
        this.languageTick();

        return this.xtreamImportPhaseTone() === 'remote'
            ? this.translateText('WORKSPACE.SHELL.XTREAM_IMPORT_REMOTE_BADGE')
            : this.xtreamImportPhaseTone() === 'local'
              ? this.translateText('WORKSPACE.SHELL.XTREAM_IMPORT_LOCAL_BADGE')
              : '';
    });
    readonly xtreamImportPhaseLabel = computed(() => {
        this.languageTick();

        switch (this.xtreamStore.currentImportPhase()) {
            case 'preparing-content':
                return this.translateText(
                    'WORKSPACE.SHELL.XTREAM_IMPORT_PREPARING'
                );
            case 'loading-categories':
                return this.translateText(
                    'WORKSPACE.SHELL.XTREAM_IMPORT_LOADING'
                );
            case 'saving-categories':
                return this.translateText(
                    'WORKSPACE.SHELL.XTREAM_IMPORT_SAVING'
                );
            case 'loading-live':
            case 'loading-movies':
            case 'loading-series':
                return this.translateText(
                    'WORKSPACE.SHELL.XTREAM_IMPORT_LOADING'
                );
            case 'saving-content':
                return this.translateText(
                    'WORKSPACE.SHELL.XTREAM_IMPORT_SAVING'
                );
            case 'restoring-favorites':
                return this.translateText(
                    'WORKSPACE.SHELL.XTREAM_IMPORT_RESTORING_FAVORITES'
                );
            case 'restoring-recently-viewed':
                return this.translateText(
                    'WORKSPACE.SHELL.XTREAM_IMPORT_RESTORING_RECENT'
                );
            default:
                return '';
        }
    });
    readonly xtreamImportDetailLabel = computed(() => {
        this.languageTick();

        return this.xtreamImportPhaseTone() === 'remote'
            ? this.translateText('WORKSPACE.SHELL.XTREAM_IMPORT_DETAIL_REMOTE')
            : this.xtreamImportPhaseTone() === 'local'
              ? this.translateText('WORKSPACE.SHELL.XTREAM_IMPORT_DETAIL_LOCAL')
              : '';
    });
    readonly showXtreamImportOverlay = computed(() => {
        const context = this.currentContext();
        const section = this.currentSection();

        if (context?.provider !== 'xtreams') {
            return false;
        }

        return (
            !this.xtreamStore.contentInitBlockReason() &&
            this.xtreamStore.isImporting() &&
            (section === 'vod' ||
                section === 'live' ||
                section === 'series' ||
                section === 'search' ||
                section === 'recently-added')
        );
    });
    readonly searchCapability = computed<WorkspaceSearchCapability>(() => {
        this.languageTick();

        const route = this.currentRoute();
        const context = route.context;
        const section = route.section;
        const appliedQuery = this.appliedSearchQuery().trim();

        if (route.kind === 'settings') {
            return {
                enabled: false,
                behavior: 'disabled',
                context: null,
                section: null,
                searchMode: 'none',
                placeholderKey: SEARCH_PLAYLIST_PLACEHOLDER,
                scopeLabel: '',
                statusLabel: '',
                minLength: 0,
                advancedRouteTarget: null,
            };
        }

        if (route.kind === 'dashboard') {
            const dashboardContext = this.dashboardXtreamContext();

            return {
                enabled: Boolean(dashboardContext),
                behavior: dashboardContext ? 'advanced-only' : 'disabled',
                context: dashboardContext,
                section: section,
                searchMode: dashboardContext ? 'advanced-only' : 'none',
                placeholderKey: SEARCH_PLAYLIST_PLACEHOLDER,
                scopeLabel: dashboardContext
                    ? this.translateText('WORKSPACE.SHELL.RAIL_SEARCH')
                    : '',
                statusLabel: '',
                minLength: dashboardContext ? 1 : 0,
                advancedRouteTarget: dashboardContext
                    ? [
                          '/workspace',
                          'xtreams',
                          dashboardContext.playlistId,
                          'search',
                      ]
                    : null,
            };
        }

        if (route.searchMode === 'none') {
            return {
                enabled: false,
                behavior: 'disabled',
                context,
                section,
                searchMode: route.searchMode,
                placeholderKey: SEARCH_PLAYLIST_PLACEHOLDER,
                scopeLabel: '',
                statusLabel: '',
                minLength: 0,
                advancedRouteTarget: null,
            };
        }

        const isDegradedStalkerItv =
            context?.provider === 'stalker' &&
            section === 'itv' &&
            appliedQuery.length > 0;
        const behavior = isDegradedStalkerItv
            ? 'degraded-loaded-only'
            : route.searchMode;

        return {
            enabled: true,
            behavior,
            context,
            section,
            searchMode: route.searchMode,
            placeholderKey: this.resolveSearchPlaceholderKey(
                route.kind,
                context,
                section
            ),
            scopeLabel: this.resolveSearchScopeLabel(
                route.kind,
                context,
                section
            ),
            statusLabel: isDegradedStalkerItv
                ? this.translateText(SEARCH_LOADED_ONLY_STATUS)
                : '',
            minLength: route.searchMode === 'remote-search' ? 3 : 1,
            advancedRouteTarget: null,
        };
    });
    readonly canUseSearch = computed(() => this.searchCapability().enabled);
    readonly searchPlaceholder = computed(
        () => this.searchCapability().placeholderKey
    );
    readonly searchScopeLabel = computed(
        () => this.searchCapability().scopeLabel
    );
    readonly searchStatusLabel = computed(
        () => this.searchCapability().statusLabel
    );
    readonly railProviderClass = computed(() => {
        const context = this.railContext();
        if (!context) {
            return 'rail-context-region';
        }

        return `rail-context-region rail-context-region--${context.provider}`;
    });
    readonly primaryContextLinks = computed<PortalRailLink[]>(() => {
        this.languageTick();

        const context = this.railContext();
        if (!context) {
            return [];
        }

        return this.translateRailLinks(
            buildPortalRailLinks({
                provider: context.provider,
                playlistId: context.playlistId,
                isElectron: this.isElectron,
                workspace: true,
            }).primary,
            context.provider
        );
    });
    readonly secondaryContextLinks = computed<PortalRailLink[]>(() => {
        this.languageTick();

        const context = this.railContext();
        if (!context) {
            return [];
        }

        return this.translateRailLinks(
            buildPortalRailLinks({
                provider: context.provider,
                playlistId: context.playlistId,
                isElectron: this.isElectron,
                workspace: true,
            }).secondary.filter((link) => link.section !== 'downloads'),
            context.provider
        );
    });
    readonly isDownloadsView = computed(
        () =>
            this.currentSection() === 'downloads' ||
            this.isGlobalDownloadsRoute()
    );
    readonly headerShortcut = computed<WorkspaceHeaderAction | null>(() => {
        const context = this.currentContext();
        const action = this.headerContext.action();

        if (!action || context?.provider !== 'playlists') {
            return null;
        }

        return action;
    });
    readonly canOpenPlaylistInfo = computed(() =>
        Boolean(this.activePlaylist())
    );
    readonly canOpenAccountInfo = computed(() =>
        Boolean(this.activePlaylist()?.serverUrl)
    );
    readonly canRefreshPlaylist = computed(() =>
        this.playlistRefreshAction.canRefresh(this.activePlaylist())
    );
    readonly isRefreshingPlaylist = this.playlistRefreshAction.isRefreshing;
    readonly headerBulkAction = computed<WorkspaceHeaderBulkAction | null>(
        () => {
            this.languageTick();

            const context = this.currentContext();
            const section = this.currentSection();

            if (!context || section !== 'recent') {
                return null;
            }

            if (
                context.provider !== 'xtreams' &&
                context.provider !== 'stalker' &&
                context.provider !== 'playlists'
            ) {
                return null;
            }

            return {
                icon: 'delete_sweep',
                tooltip: this.translateText(CLEAR_RECENTLY_VIEWED_TOOLTIP),
                ariaLabel: this.translateText(CLEAR_RECENTLY_VIEWED_ARIA),
                disabled: this.isRecentCleanupDisabled(context.provider),
            };
        }
    );
    readonly playlistSubtitle = computed(() => {
        this.languageTick();

        const active = this.activePlaylist();
        if (active?.serverUrl) {
            return this.translateText('WORKSPACE.SHELL.XTREAM_CODE');
        }
        if (active?.macAddress) {
            return this.translateText('WORKSPACE.SHELL.STALKER_PORTAL');
        }
        if (active?.count) {
            return this.translateText('WORKSPACE.SHELL.CHANNELS_COUNT', {
                count: active.count,
            });
        }

        const sourcesCount = this.playlists().length;
        if (sourcesCount === 0) {
            return this.translateText('WORKSPACE.SHELL.NO_SOURCES_AVAILABLE');
        }
        if (sourcesCount === 1) {
            return this.translateText('WORKSPACE.SHELL.ONE_SOURCE_AVAILABLE');
        }
        return this.translateText('WORKSPACE.SHELL.SOURCES_AVAILABLE', {
            count: sourcesCount,
        });
    });

    constructor() {
        this.destroyRef.onDestroy(() => {
            if (this.searchDebounceTimeoutId !== null) {
                clearTimeout(this.searchDebounceTimeoutId);
                this.searchDebounceTimeoutId = null;
            }

            document.removeEventListener('keydown', this.onDocumentKeydown);
        });

        document.addEventListener('keydown', this.onDocumentKeydown);

        this.router.events
            .pipe(
                filter(
                    (event): event is NavigationEnd =>
                        event instanceof NavigationEnd
                ),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe((event) => {
                this.currentUrl.set(event.urlAfterRedirects);
                this.startupPreferences.persistLastRestorablePath(
                    event.urlAfterRedirects
                );
                this.syncSearchFromRoute();
            });

        this.syncSearchFromRoute();

        effect(() => {
            const context = this.currentContext();
            const section = this.currentSection();
            const term = this.appliedSearchQuery();

            if (!context || context.provider !== 'xtreams') {
                return;
            }

            if (section === 'search') {
                this.xtreamStore.setSearchTerm(term);
                return;
            }

            if (section === 'vod' || section === 'series') {
                this.xtreamStore.setCategorySearchTerm(term);
            }
        });

        effect(() => {
            const context = this.currentContext();
            const section = this.currentSection();
            const term = this.appliedSearchQuery();

            if (
                context?.provider !== 'stalker' ||
                !section ||
                (section !== 'vod' && section !== 'series' && section !== 'itv')
            ) {
                return;
            }

            this.stalkerStore.setSearchPhrase(term);
        });

        effect(() => {
            if (!this.currentRoute().usesQuerySearch) {
                return;
            }

            this.syncSearchQueryParam(this.appliedSearchQuery());
        });
    }

    closeActiveExternalSession(): void {
        void this.externalPlayback.closeSession(
            this.externalPlayback.activeSession()
        );
    }

    openActiveExternalSessionTarget(): void {
        const playlistId = this.externalPlaybackSession()?.contentInfo
            ?.playlistId;
        if (!playlistId) return;

        const playlist = this.playlists().find((p) => p._id === playlistId);
        if (!playlist) return;

        if (playlist.serverUrl) {
            void this.router.navigate(['/workspace', 'xtreams', playlistId]);
        } else if (playlist.macAddress) {
            void this.router.navigate(['/workspace', 'stalker', playlistId]);
        } else {
            void this.router.navigate(['/workspace', 'playlists', playlistId]);
        }
    }

    onSearchInput(value: string): void {
        this.searchQuery.set(value);
        this.scheduleSearchApply(value);
    }

    onSearchEnter(value: string): void {
        const trimmedValue = value.trim();
        this.searchQuery.set(trimmedValue);

        if (this.searchCapability().behavior === 'advanced-only') {
            const advancedRouteTarget =
                this.searchCapability().advancedRouteTarget;
            if (!advancedRouteTarget) {
                this.applySearchQuery(trimmedValue);
                return;
            }

            this.xtreamStore.setSearchTerm(trimmedValue);
            this.applySearchQuery(trimmedValue);
            void this.router.navigate(advancedRouteTarget, {
                queryParams: trimmedValue ? { q: trimmedValue } : {},
            });
            return;
        }

        this.applySearchQuery(trimmedValue);
    }

    openAddPlaylistDialog(): void {
        this.workspaceActions.openAddPlaylistDialog();
    }

    openCommandPalette(): void {
        if (this.commandPaletteRef) {
            this.commandPaletteRef.close();
            return;
        }

        const commands = this.commandPaletteCommands();
        const dialogRef = this.dialog.open<
            WorkspaceCommandPaletteComponent,
            { commands: WorkspaceResolvedCommandItem[]; query: string },
            WorkspaceCommandSelection | undefined
        >(WorkspaceCommandPaletteComponent, {
            width: 'min(760px, 92vw)',
            maxWidth: '92vw',
            panelClass: 'workspace-command-palette-overlay',
            autoFocus: false,
            data: {
                commands,
                query: this.searchQuery(),
            },
        });
        this.commandPaletteRef = dialogRef;

        dialogRef
            .afterClosed()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((selection) => {
                this.commandPaletteRef = null;
                if (!selection) {
                    return;
                }

                const command = commands.find(
                    (item) =>
                        item.id === selection.commandId &&
                        item.visible &&
                        item.enabled
                );
                command?.run({ query: selection.query.trim() });
            });
    }

    async runHeaderBulkAction(): Promise<void> {
        const context = this.currentContext();
        const section = this.currentSection();

        if (!context || section !== 'recent') {
            return;
        }

        if (context.provider === 'xtreams') {
            this.xtreamStore.clearRecentItems({ id: context.playlistId });
            return;
        }

        if (context.provider === 'stalker') {
            const updatedPlaylist = await firstValueFrom(
                this.playlistsService.clearPortalRecentlyViewed(
                    context.playlistId
                )
            );
            this.store.dispatch(
                PlaylistActions.updatePlaylistMeta({
                    playlist: {
                        _id: context.playlistId,
                        recentlyViewed: updatedPlaylist?.recentlyViewed ?? [],
                    } as PlaylistMeta,
                })
            );
            this.bumpRefreshQueryParam();
            return;
        }

        if (context.provider === 'playlists') {
            const updatedPlaylist = await firstValueFrom(
                this.playlistsService.clearM3uRecentlyViewed(context.playlistId)
            );
            this.store.dispatch(
                PlaylistActions.updatePlaylistMeta({
                    playlist: {
                        _id: context.playlistId,
                        recentlyViewed: updatedPlaylist?.recentlyViewed ?? [],
                    } as PlaylistMeta,
                })
            );
            this.bumpRefreshQueryParam();
        }
    }

    navigateToGlobalFavorites(): void {
        void this.router.navigate(['/workspace/global-favorites']);
    }

    openDownloadsShortcut(): void {
        void this.router.navigate(['/workspace/downloads']);
    }

    runHeaderShortcut(): void {
        this.headerShortcut()?.run();
    }

    openGlobalSearch(initialQuery = ''): void {
        this.workspaceActions.openGlobalSearch(initialQuery);
    }

    openGlobalRecent(): void {
        this.workspaceActions.openGlobalRecent();
    }

    openPlaylistInfo(): void {
        const playlist = this.activePlaylist();
        if (!playlist) {
            return;
        }

        this.dialog.open(PlaylistInfoComponent, {
            data: playlist,
        });
    }

    cancelXtreamImport(): void {
        void this.xtreamStore.cancelImport();
    }

    openAccountInfo(): void {
        if (!this.canOpenAccountInfo()) {
            return;
        }

        const data: WorkspaceAccountInfoData = {
            vodStreamsCount: this.xtreamStore.vodStreams().length,
            liveStreamsCount: this.xtreamStore.liveStreams().length,
            seriesCount: this.xtreamStore.serialStreams().length,
        };
        this.workspaceActions.openAccountInfo(data);
    }

    refreshCurrentPlaylist(): void {
        const playlist = this.activePlaylist();

        if (!playlist || !this.canRefreshPlaylist()) {
            return;
        }

        this.playlistRefreshAction.refresh(playlist);
    }

    private getCommandPaletteItems(): WorkspaceResolvedCommandItem[] {
        this.languageTick();

        return [
            ...this.getViewCommandDefinitions(),
            ...this.getPlaylistCommandDefinitions(),
            ...this.getGlobalCommandDefinitions(),
            ...this.viewCommands.commands(),
        ]
            .map((command) => this.resolveCommand(command))
            .filter((command) => command.visible)
            .sort((left, right) => this.comparePaletteCommands(left, right));
    }

    private getViewCommandDefinitions(): WorkspaceCommandContribution[] {
        const context = this.currentContext();
        const section = this.currentSection();

        if (!context || !section) {
            return [];
        }

        if (context.provider === 'playlists') {
            return this.getM3uNavigationCommands(context, section);
        }

        if (context.provider === 'xtreams' || context.provider === 'stalker') {
            return this.getPortalNavigationCommands(context, section);
        }

        return [];
    }

    private getPlaylistCommandDefinitions(): WorkspaceCommandContribution[] {
        const route = this.currentRoute();
        const context = route.context;

        if (
            !context ||
            (context.provider !== 'xtreams' &&
                context.provider !== 'stalker' &&
                context.provider !== 'playlists')
        ) {
            return [];
        }

        const hasActivePlaylist = !!this.activePlaylist();
        const canOpenPlaylistSearch =
            context.provider === 'xtreams' || context.provider === 'stalker';

        return [
            {
                id: 'playlist-search',
                group: 'playlist',
                icon: 'playlist_play',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.PLAYLIST_SEARCH_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.PLAYLIST_SEARCH_DESCRIPTION',
                priority: 10,
                visible: canOpenPlaylistSearch,
                run: ({ query }) => this.openPlaylistSearchFromPalette(query),
            },
            {
                id: 'refresh-playlist',
                group: 'playlist',
                icon: 'sync',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.REFRESH_PLAYLIST_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.REFRESH_PLAYLIST_DESCRIPTION',
                priority: 20,
                visible: this.canRefreshPlaylist(),
                run: () => this.refreshCurrentPlaylist(),
            },
            {
                id: 'playlist-info',
                group: 'playlist',
                icon: 'info',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.PLAYLIST_INFO_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.PLAYLIST_INFO_DESCRIPTION',
                priority: 30,
                visible: hasActivePlaylist,
                run: () => this.openPlaylistInfo(),
            },
            {
                id: 'account-info',
                group: 'playlist',
                icon: 'account_circle',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.ACCOUNT_INFO_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.ACCOUNT_INFO_DESCRIPTION',
                priority: 40,
                visible: context.provider === 'xtreams',
                run: () => this.openAccountInfo(),
            },
        ];
    }

    private getGlobalCommandDefinitions(): WorkspaceCommandContribution[] {
        const route = this.currentRoute();
        const hasXtreamPlaylists = this.playlists().some(
            (playlist) => !!playlist.serverUrl
        );

        return [
            {
                id: 'global-search',
                group: 'global',
                icon: 'search',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.GLOBAL_SEARCH_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.GLOBAL_SEARCH_DESCRIPTION',
                priority: 10,
                visible: hasXtreamPlaylists,
                keywords: ['xtream'],
                run: ({ query }) => this.openGlobalSearch(query),
            },
            {
                id: 'open-global-favorites',
                group: 'global',
                icon: 'star',
                labelKey:
                    'WORKSPACE.SHELL.COMMANDS.OPEN_GLOBAL_FAVORITES_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.OPEN_GLOBAL_FAVORITES_DESCRIPTION',
                priority: 20,
                visible: route.kind !== 'global-favorites',
                run: () => this.navigateToGlobalFavorites(),
            },
            {
                id: 'open-global-recent',
                group: 'global',
                icon: 'history',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_GLOBAL_RECENT_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.OPEN_GLOBAL_RECENT_DESCRIPTION',
                priority: 30,
                visible: route.kind !== 'global-recent',
                run: () => this.openGlobalRecent(),
            },
            {
                id: 'open-downloads',
                group: 'global',
                icon: 'download',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_DOWNLOADS_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.OPEN_DOWNLOADS_DESCRIPTION',
                priority: 40,
                visible: this.isElectron && route.kind !== 'downloads',
                run: () => this.openDownloadsShortcut(),
            },
            {
                id: 'open-settings',
                group: 'global',
                icon: 'settings',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_SETTINGS_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.OPEN_SETTINGS_DESCRIPTION',
                priority: 50,
                visible: route.kind !== 'settings',
                run: () => {
                    void this.router.navigate(['/workspace', 'settings']);
                },
            },
            {
                id: 'open-sources',
                group: 'global',
                icon: 'library_books',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_SOURCES_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.OPEN_SOURCES_DESCRIPTION',
                priority: 60,
                visible: route.kind !== 'sources',
                run: () => {
                    void this.router.navigate(['/workspace', 'sources']);
                },
            },
            {
                id: 'open-dashboard',
                group: 'global',
                icon: 'dashboard',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_DASHBOARD_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.OPEN_DASHBOARD_DESCRIPTION',
                priority: 70,
                visible: this.showDashboard() && route.kind !== 'dashboard',
                run: () => {
                    void this.router.navigate(['/workspace', 'dashboard']);
                },
            },
            {
                id: 'add-playlist',
                group: 'global',
                icon: 'add_circle_outline',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_DESCRIPTION',
                priority: 80,
                run: () => this.openAddPlaylistDialog(),
            },
            {
                id: 'add-playlist-m3u',
                group: 'global',
                icon: 'folder_open',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_M3U_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_M3U_DESCRIPTION',
                keywords: ['m3u', 'm3u8', 'file', 'url', 'add', 'import'],
                priority: 79,
                run: () => this.workspaceActions.openAddPlaylistDialog('url'),
            },
            {
                id: 'add-playlist-xtream',
                group: 'global',
                icon: 'cloud',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_XTREAM_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_XTREAM_DESCRIPTION',
                keywords: ['xtream', 'codes', 'iptv', 'add', 'import'],
                priority: 78,
                run: () =>
                    this.workspaceActions.openAddPlaylistDialog('xtream'),
            },
            {
                id: 'add-playlist-stalker',
                group: 'global',
                icon: 'cast',
                labelKey: 'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_STALKER_LABEL',
                descriptionKey:
                    'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_STALKER_DESCRIPTION',
                keywords: ['stalker', 'portal', 'mac', 'ministra', 'add'],
                priority: 77,
                run: () =>
                    this.workspaceActions.openAddPlaylistDialog('stalker'),
            },
        ];
    }

    private getPortalNavigationCommands(
        context: WorkspacePortalContext,
        section: PortalRailSection
    ): WorkspaceCommandContribution[] {
        const liveSection = context.provider === 'stalker' ? 'itv' : 'live';

        return [
            this.createNavigationCommand({
                id: 'go-to-vod',
                context,
                targetSection: 'vod',
                currentSection: section,
                icon: 'movie',
                labelKey: 'WORKSPACE.SHELL.RAIL_MOVIES',
                priority: 100,
            }),
            this.createNavigationCommand({
                id: 'go-to-live',
                context,
                targetSection: liveSection,
                currentSection: section,
                icon: 'live_tv',
                labelKey: 'WORKSPACE.SHELL.RAIL_LIVE',
                priority: 110,
            }),
            this.createNavigationCommand({
                id: 'go-to-series',
                context,
                targetSection: 'series',
                currentSection: section,
                icon: 'video_library',
                labelKey: 'WORKSPACE.SHELL.RAIL_SERIES',
                priority: 120,
            }),
        ].filter(
            (command): command is WorkspaceCommandContribution => command !== null
        );
    }

    private getM3uNavigationCommands(
        context: WorkspacePortalContext,
        section: PortalRailSection
    ): WorkspaceCommandContribution[] {
        return [
            this.createNavigationCommand({
                id: 'go-to-all',
                context,
                targetSection: 'all',
                currentSection: section,
                icon: 'format_list_bulleted',
                labelKey: 'WORKSPACE.SHELL.RAIL_ALL_CHANNELS',
                priority: 100,
            }),
            this.createNavigationCommand({
                id: 'go-to-groups',
                context,
                targetSection: 'groups',
                currentSection: section,
                icon: 'folder_open',
                labelKey: 'WORKSPACE.SHELL.RAIL_GROUPS',
                priority: 110,
            }),
            this.createNavigationCommand({
                id: 'go-to-favorites',
                context,
                targetSection: 'favorites',
                currentSection: section,
                icon: 'star',
                labelKey: 'WORKSPACE.SHELL.RAIL_FAVORITES',
                priority: 120,
            }),
            this.createNavigationCommand({
                id: 'go-to-recent',
                context,
                targetSection: 'recent',
                currentSection: section,
                icon: 'history',
                labelKey: 'WORKSPACE.SHELL.RAIL_RECENT',
                priority: 130,
            }),
        ].filter(
            (command): command is WorkspaceCommandContribution => command !== null
        );
    }

    private createNavigationCommand(config: {
        id: string;
        context: WorkspacePortalContext;
        targetSection: string;
        currentSection: PortalRailSection;
        icon: string;
        labelKey: string;
        priority: number;
    }): WorkspaceCommandContribution | null {
        if (config.currentSection === config.targetSection) {
            return null;
        }

        return {
            id: config.id,
            group: 'view',
            icon: config.icon,
            labelKey: config.labelKey,
            descriptionKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_VIEW_DESCRIPTION',
            descriptionParams: () => ({
                view: this.translateText(config.labelKey),
            }),
            priority: config.priority,
            run: () => {
                void this.router.navigate([
                    '/workspace',
                    config.context.provider,
                    config.context.playlistId,
                    config.targetSection,
                ]);
            },
        };
    }

    private resolveCommand(
        command: WorkspaceCommandContribution
    ): WorkspaceResolvedCommandItem {
        const labelParams = this.resolveCommandValue(command.labelParams);
        const descriptionParams = this.resolveCommandValue(
            command.descriptionParams
        );

        return {
            id: command.id,
            group: command.group,
            icon: command.icon,
            label: this.translateText(command.labelKey, labelParams),
            description: command.descriptionKey
                ? this.translateText(command.descriptionKey, descriptionParams)
                : '',
            keywords: this.resolveCommandValue(command.keywords) ?? [],
            priority: command.priority ?? 100,
            visible: this.resolveCommandValue(command.visible) ?? true,
            enabled: this.resolveCommandValue(command.enabled) ?? true,
            run: command.run,
        };
    }

    private comparePaletteCommands(
        left: WorkspaceResolvedCommandItem,
        right: WorkspaceResolvedCommandItem
    ): number {
        const groupOrder =
            this.getCommandGroupOrder(left.group) -
            this.getCommandGroupOrder(right.group);

        if (groupOrder !== 0) {
            return groupOrder;
        }

        if (left.priority !== right.priority) {
            return left.priority - right.priority;
        }

        return left.label.localeCompare(right.label);
    }

    private getCommandGroupOrder(group: WorkspaceResolvedCommandItem['group']) {
        switch (group) {
            case 'view':
                return 0;
            case 'playlist':
                return 1;
            default:
                return 2;
        }
    }

    private resolveCommandValue<T>(
        value: T | (() => T | undefined) | undefined
    ): T | undefined {
        if (typeof value === 'function') {
            return (value as () => T | undefined)();
        }

        return value;
    }

    private openPlaylistSearchFromPalette(query: string): void {
        const effectiveContext =
            this.dashboardXtreamContext() ?? this.currentContext();

        if (!effectiveContext) {
            return;
        }

        this.searchQuery.set(query);
        this.appliedSearchQuery.set(query);

        if (effectiveContext.provider === 'xtreams') {
            this.xtreamStore.setSearchTerm(query);
            void this.router.navigate(
                [
                    '/workspace',
                    'xtreams',
                    effectiveContext.playlistId,
                    'search',
                ],
                {
                    queryParams: query ? { q: query } : {},
                }
            );
            return;
        }

        if (effectiveContext.provider === 'stalker') {
            void this.router.navigate(
                [
                    '/workspace',
                    'stalker',
                    effectiveContext.playlistId,
                    'search',
                ],
                {
                    queryParams: query ? { q: query } : {},
                }
            );
        }
    }

    private syncSearchFromRoute(): void {
        if (this.currentRoute().usesQuerySearch) {
            this.setSearchState(this.getRouteQueryParam('q'));
            return;
        }

        this.setSearchState('');
    }

    private setSearchState(value: string): void {
        if (this.searchDebounceTimeoutId !== null) {
            clearTimeout(this.searchDebounceTimeoutId);
            this.searchDebounceTimeoutId = null;
        }

        this.searchQuery.set(value);
        this.appliedSearchQuery.set(value);
    }

    private scheduleSearchApply(value: string): void {
        if (this.searchDebounceTimeoutId !== null) {
            clearTimeout(this.searchDebounceTimeoutId);
        }

        this.searchDebounceTimeoutId = setTimeout(() => {
            this.searchDebounceTimeoutId = null;
            this.applySearchQuery(value);
        }, SEARCH_INPUT_DEBOUNCE_MS);
    }

    private applySearchQuery(value: string): void {
        this.appliedSearchQuery.set(value);
    }

    private syncSearchQueryParam(term: string): void {
        const nextTerm = term.trim();
        const currentTerm = this.getRouteQueryParam('q');
        if (nextTerm === currentTerm) {
            return;
        }

        const routePath = this.currentUrl().split('?')[0];
        const queryParams = {
            ...this.router.parseUrl(this.currentUrl()).queryParams,
        };

        if (nextTerm.length > 0) {
            queryParams['q'] = nextTerm;
        } else {
            delete queryParams['q'];
        }

        const queryString = this.toQueryString(queryParams);
        const nextUrl = queryString ? `${routePath}?${queryString}` : routePath;
        void this.router.navigateByUrl(nextUrl, { replaceUrl: true });
    }

    private getRouteQueryParam(name: string): string {
        const value = this.router.parseUrl(this.currentUrl()).queryParams[name];
        return typeof value === 'string' ? value : '';
    }

    private toQueryString(queryParams: Record<string, unknown>): string {
        const urlSearchParams = new URLSearchParams();

        Object.entries(queryParams).forEach(([key, value]) => {
            if (value == null) {
                return;
            }

            if (Array.isArray(value)) {
                value.forEach((item) =>
                    urlSearchParams.append(key, String(item))
                );
                return;
            }

            urlSearchParams.set(key, String(value));
        });

        return urlSearchParams.toString();
    }

    private bumpRefreshQueryParam(): void {
        const routePath = this.currentUrl().split('?')[0];
        const queryParams = {
            ...this.router.parseUrl(this.currentUrl()).queryParams,
            refresh: Date.now().toString(),
        };

        const queryString = this.toQueryString(queryParams);
        const nextUrl = queryString ? `${routePath}?${queryString}` : routePath;
        void this.router.navigateByUrl(nextUrl, { replaceUrl: true });
    }

    private isRecentCleanupDisabled(
        provider: WorkspacePortalContext['provider']
    ): boolean {
        if (provider === 'xtreams') {
            return this.xtreamStore.recentItems().length === 0;
        }

        if (provider === 'playlists') {
            return (this.activePlaylist()?.recentlyViewed?.length ?? 0) === 0;
        }

        return false;
    }

    private getProviderFromPlaylist(playlist: {
        serverUrl?: string;
        macAddress?: string;
    }): WorkspacePortalContext['provider'] {
        if (playlist.serverUrl) {
            return 'xtreams';
        }
        if (playlist.macAddress) {
            return 'stalker';
        }
        return 'playlists';
    }

    private resolveSearchPlaceholderKey(
        kind: WorkspaceShellPageKind,
        context: WorkspacePortalContext | null,
        section: PortalRailSection | null
    ): string {
        if (kind === 'sources') {
            return SEARCH_SOURCES_PLACEHOLDER;
        }

        if (kind === 'dashboard' || section === 'search') {
            return SEARCH_PLAYLIST_PLACEHOLDER;
        }

        if (
            context &&
            (section === 'vod' ||
                section === 'series' ||
                section === 'live' ||
                section === 'itv')
        ) {
            return SEARCH_SECTION_PLACEHOLDER;
        }

        return FILTER_SECTION_PLACEHOLDER;
    }

    private resolveSearchScopeLabel(
        kind: WorkspaceShellPageKind,
        context: WorkspacePortalContext | null,
        section: PortalRailSection | null
    ): string {
        if (kind === 'sources') {
            return this.translateText('WORKSPACE.SHELL.RAIL_SOURCES');
        }

        if (kind === 'global-favorites') {
            return this.translateText('HOME.PLAYLISTS.GLOBAL_FAVORITES');
        }

        if (kind === 'global-recent') {
            return this.translateText('PORTALS.RECENTLY_VIEWED');
        }

        if (kind === 'downloads') {
            return this.translateText('WORKSPACE.SHELL.RAIL_DOWNLOADS');
        }

        if (kind === 'dashboard' || section === 'search') {
            return this.translateText('WORKSPACE.SHELL.RAIL_SEARCH');
        }

        if (!context || !section) {
            return '';
        }

        if (
            section === 'vod' ||
            section === 'series' ||
            section === 'live' ||
            section === 'itv'
        ) {
            const categoryLabel = this.resolveActiveCategoryLabel(
                context,
                section
            );
            const sectionLabel = this.translateRailSection(section);

            return categoryLabel
                ? `${sectionLabel} / ${categoryLabel}`
                : sectionLabel;
        }

        return this.translateRailSection(section);
    }

    private resolveActiveCategoryLabel(
        context: WorkspacePortalContext,
        section: PortalRailSection
    ): string {
        if (context.provider === 'xtreams') {
            const category = this.xtreamStore.getSelectedCategory();
            return (
                category?.category_name ??
                category?.name ??
                this.translateRailSection(section)
            );
        }

        if (context.provider === 'stalker') {
            return (
                this.stalkerStore.getSelectedCategoryName().trim() ||
                this.translateRailSection(section)
            );
        }

        return this.translateRailSection(section);
    }

    private translateRailSection(section: PortalRailSection): string {
        return this.translateText(this.getRailTooltipKey('playlists', section));
    }

    private formatLocalizedNumber(value: number): string {
        const locale =
            this.translate.currentLang || this.translate.defaultLang || 'en';
        return new Intl.NumberFormat(locale).format(value);
    }

    private translateText(
        key: string,
        params?: Record<string, string | number>
    ): string {
        return this.translate.instant(key, params);
    }

    private translateRailLinks(
        links: PortalRailLink[],
        provider: WorkspacePortalContext['provider']
    ): PortalRailLink[] {
        return links.map((link) => ({
            ...link,
            tooltip: this.translateText(
                this.getRailTooltipKey(provider, link.section)
            ),
        }));
    }

    private getRailTooltipKey(
        provider: WorkspacePortalContext['provider'],
        section?: PortalRailSection
    ): string {
        if (provider === 'xtreams' && section === 'library') {
            return 'WORKSPACE.SHELL.RAIL_LIBRARY';
        }

        return (
            (section ? RAIL_TOOLTIP_KEYS[section] : null) ??
            'WORKSPACE.SHELL.RAIL_CONTEXT_ACTIONS'
        );
    }
}
