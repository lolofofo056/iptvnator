import {
    XtreamBackupFavoriteItem,
    XtreamBackupHiddenCategory,
    XtreamBackupRecentlyViewedItem,
} from './playlist-backup.interface';
import { PlaybackPositionData } from './playback-position.interface';

export interface XtreamPendingRestoreState {
    hiddenCategories: XtreamBackupHiddenCategory[];
    favorites: XtreamBackupFavoriteItem[];
    recentlyViewed: XtreamBackupRecentlyViewedItem[];
    playbackPositions: PlaybackPositionData[];
}

export function getXtreamPendingRestoreStorageKey(playlistId: string): string {
    return `xtream-restore-${playlistId}`;
}
