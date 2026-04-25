import { Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { PlaylistActions } from 'm3u-state';

const M3U_EXTENSIONS = ['.m3u', '.m3u8'];

export type PlaylistFileImportResult =
    | { ok: true; title: string }
    | { ok: false; reason: 'unsupported' | 'empty' | 'read-error' };

@Injectable({ providedIn: 'root' })
export class PlaylistFileImportService {
    private readonly store = inject(Store);

    isSupportedFile(file: File): boolean {
        const lower = file.name.toLowerCase();
        return M3U_EXTENSIONS.some((ext) => lower.endsWith(ext));
    }

    async importFile(file: File): Promise<PlaylistFileImportResult> {
        if (!this.isSupportedFile(file)) {
            return { ok: false, reason: 'unsupported' };
        }

        let playlist: string;
        try {
            playlist = await file.text();
        } catch {
            return { ok: false, reason: 'read-error' };
        }

        if (!playlist.trim()) {
            return { ok: false, reason: 'empty' };
        }

        const title = this.normalizeTitle(file.name);
        this.store.dispatch(
            PlaylistActions.parsePlaylist({
                uploadType: 'FILE',
                playlist,
                title,
                path: (file as File & { path?: string }).path,
            })
        );

        return { ok: true, title };
    }

    private normalizeTitle(filename: string): string {
        const trimmed = filename.trim();
        if (!trimmed) {
            return filename;
        }
        return trimmed.replace(/\.(m3u8?|pls|txt)$/i, '') || trimmed;
    }
}
