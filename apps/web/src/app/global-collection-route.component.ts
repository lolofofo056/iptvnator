import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PlaylistContextFacade } from '@iptvnator/playlist/shared/util';
import {
    UnifiedCollectionDetailDirective,
    UnifiedCollectionPageComponent,
} from '@iptvnator/portal/shared/ui';
import { CollectionScope, PortalProvider } from '@iptvnator/portal/shared/util';
import { StalkerCollectionDetailComponent } from '@iptvnator/portal/stalker/feature';
import { XtreamCollectionDetailComponent } from '@iptvnator/portal/xtream/feature';

type UnifiedPortalType = 'm3u' | 'xtream' | 'stalker';

function providerToPortalType(provider: PortalProvider): UnifiedPortalType {
    if (provider === 'playlists') return 'm3u';
    if (provider === 'xtreams') return 'xtream';
    return 'stalker';
}

@Component({
    selector: 'app-global-collection-route',
    imports: [
        StalkerCollectionDetailComponent,
        UnifiedCollectionDetailDirective,
        UnifiedCollectionPageComponent,
        XtreamCollectionDetailComponent,
    ],
    template: `
        <app-unified-collection-page
            [mode]="mode()"
            [playlistId]="activePlaylistId() ?? undefined"
            [portalType]="activePortalType() ?? undefined"
            [defaultScope]="effectiveDefaultScope()"
        >
            <ng-template unifiedCollectionDetail let-item let-close="close">
                @if (item.sourceType === 'xtream') {
                    <app-xtream-collection-detail [item]="item" />
                } @else if (item.sourceType === 'stalker') {
                    <app-stalker-collection-detail
                        [item]="item"
                        (closeRequested)="close()"
                    />
                }
            </ng-template>
        </app-unified-collection-page>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalCollectionRouteComponent {
    private readonly playlistContext = inject(PlaylistContextFacade);

    readonly mode = input<'favorites' | 'recent'>('favorites');
    readonly defaultScope = input<CollectionScope | undefined>(undefined);

    readonly activePlaylistId = computed(
        () => this.playlistContext.activePlaylist()?._id ?? null
    );
    readonly activePortalType = computed<UnifiedPortalType | null>(() => {
        const provider = this.playlistContext.activeProvider();
        return provider ? providerToPortalType(provider) : null;
    });
    readonly effectiveDefaultScope = computed<CollectionScope | undefined>(() =>
        this.activePlaylistId() ? 'playlist' : (this.defaultScope() ?? 'all')
    );
}
