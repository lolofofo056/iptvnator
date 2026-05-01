import { ScrollingModule } from '@angular/cdk/scrolling';

import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { TranslatePipe } from '@ngx-translate/core';
import { resolveChannelEpgLookupKey } from 'm3u-state';
import { Channel, EpgProgram } from 'shared-interfaces';
import { resolveChannelLogo } from '../channel-logo-fallback.util';
import { ChannelDetailsDialogComponent } from '../channel-details-dialog/channel-details-dialog.component';
import { ChannelListItemComponent } from '../channel-list-item/channel-list-item.component';

/**
 * Per-channel EPG metadata stored in a side-car map keyed by EPG lookup key.
 * Replaces the older EnrichedChannel pattern that spread-cloned every channel
 * on every progressTick (~30 s).
 */
export interface ChannelEpgMetadata {
    epgProgram: EpgProgram | null | undefined;
    progressPercentage: number;
}

@Component({
    selector: 'app-all-channels-view',
    templateUrl: './all-channels-view.component.html',
    styleUrls: ['./all-channels-view.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        ChannelListItemComponent,
        MatIconModule,
        MatMenuModule,
        ScrollingModule,
        TranslatePipe,
    ],
})
export class AllChannelsViewComponent {
    private readonly dialog = inject(MatDialog);

    readonly contextMenuTrigger = viewChild.required<MatMenuTrigger>(
        'contextMenuTrigger'
    );

    /** All channels (will be filtered by search) */
    readonly channels = input.required<Channel[]>();
    readonly searchTerm = input('');

    /** EPG map for channel enrichment */
    readonly channelEpgMap = input.required<Map<string, EpgProgram | null>>();
    readonly channelIconMap = input.required<Map<string, string>>();

    /** Progress tick to trigger progress recalculation */
    readonly progressTick = input.required<number>();

    /** Whether to show EPG data */
    readonly shouldShowEpg = input.required<boolean>();

    /** Item size for virtual scroll */
    readonly itemSize = input.required<number>();

    /** Currently active channel URL */
    readonly activeChannelUrl = input<string | undefined>();

    /** Set of favorite channel URLs */
    readonly favoriteIds = input<Set<string>>(new Set());

    /** Emits when a channel is selected */
    readonly channelSelected = output<Channel>();

    /** Emits when favorite is toggled */
    readonly favoriteToggled = output<{
        channel: Channel;
        event: MouseEvent;
    }>();

    readonly contextMenuChannel = signal<Channel | null>(null);
    readonly contextMenuPosition = signal({
        x: '0px',
        y: '0px',
    });

    /**
     * Filtered channels — just a subset reference, no cloning.
     * Recomputes only when the source list or the search term changes.
     */
    readonly filteredChannels = computed(() => {
        const term = this.searchTerm().trim().toLowerCase();
        const channels = this.channels();
        if (!term) {
            return channels;
        }
        return channels.filter((ch) =>
            ch.name?.toLowerCase().includes(term)
        );
    });

    /**
     * Side-car EPG metadata keyed by channel EPG lookup key.
     * Rebuilt every progressTick (~30 s) but only contains entries for channels
     * that actually have EPG data — typically a small fraction of the playlist.
     * Replaces the previous spread-clone-every-channel pattern that allocated
     * ~90K objects per tick on large M3U playlists.
     */
    readonly epgMetadataMap = computed(() => {
        const epgMap = this.channelEpgMap();
        // Read progressTick to create dependency for progress refresh
        this.progressTick();

        const result = new Map<string, ChannelEpgMetadata>();
        epgMap.forEach((program, channelId) => {
            result.set(channelId, {
                epgProgram: program,
                progressPercentage: this.calculateProgress(program),
            });
        });
        return result;
    });

    /** Resolves the EPG lookup key the side-car map is keyed by. */
    getChannelEpgKey(channel: Channel): string {
        return resolveChannelEpgLookupKey(channel) ?? '';
    }

    /**
     * Resolves the channel logo. Called per visible row from the template; under
     * OnPush + virtual scroll only ~50 rows check at a time so direct calls are
     * cheaper than rebuilding a separate logo map per channels/iconMap change.
     */
    getLogoForChannel(channel: Channel): string {
        return resolveChannelLogo(channel, this.channelIconMap());
    }

    /**
     * Calculates progress percentage for an EPG program
     */
    private calculateProgress(
        epgProgram: EpgProgram | null | undefined
    ): number {
        if (!epgProgram) {
            return 0;
        }

        const now = Date.now();
        const start = new Date(epgProgram.start).getTime();
        const stop = new Date(epgProgram.stop).getTime();

        // Validate start/stop are finite numbers
        if (!Number.isFinite(start) || !Number.isFinite(stop)) {
            return 0;
        }

        const total = stop - start;

        // Bail out if duration is zero or negative
        if (total <= 0) {
            return 0;
        }

        // Clamp elapsed to [0, total]
        const elapsed = Math.min(total, Math.max(0, now - start));

        return Math.round((elapsed / total) * 100);
    }

    trackByFn(_: number, channel: Channel): string {
        return channel?.id;
    }

    onChannelClick(channel: Channel): void {
        this.channelSelected.emit(channel);
    }

    onFavoriteToggle(channel: Channel, event: MouseEvent): void {
        this.favoriteToggled.emit({ channel, event });
    }

    onChannelContextMenu(channel: Channel, event: MouseEvent): void {
        this.contextMenuChannel.set(channel);
        this.contextMenuPosition.set({
            x: `${event.clientX}px`,
            y: `${event.clientY}px`,
        });

        const trigger = this.contextMenuTrigger();
        if (trigger.menuOpen) {
            trigger.closeMenu();
        }

        queueMicrotask(() => {
            this.contextMenuTrigger().openMenu();
        });
    }

    openChannelDetails(): void {
        const channel = this.contextMenuChannel();
        if (!channel) {
            return;
        }

        this.contextMenuTrigger().closeMenu();
        this.dialog.open(ChannelDetailsDialogComponent, {
            data: channel,
            maxWidth: '720px',
            width: 'calc(100vw - 32px)',
        });
    }
}
