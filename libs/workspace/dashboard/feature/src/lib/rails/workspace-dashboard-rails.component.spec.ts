import type { PlaylistMeta } from 'shared-interfaces';
import { buildDashboardSourceActions } from './workspace-dashboard-rails.component';

describe('buildDashboardSourceActions', () => {
    const basePlaylist = {
        _id: 'playlist-1',
        title: 'Playlist',
        importDate: '2026-04-24T08:00:00.000Z',
        autoRefresh: false,
    } as PlaylistMeta;

    const actionIds = (playlist: PlaylistMeta, canRefresh: boolean) =>
        buildDashboardSourceActions(playlist, canRefresh).map(
            (action) => action.id
        );

    it('exposes refresh, info, and remove for refreshable M3U sources', () => {
        const playlist = {
            ...basePlaylist,
            url: 'https://example.com/playlist.m3u',
        } as PlaylistMeta;

        expect(actionIds(playlist, true)).toEqual([
            'refresh',
            'playlist-info',
            'remove',
        ]);
    });

    it('exposes refresh, info, account, and remove for refreshable Xtream sources', () => {
        const playlist = {
            ...basePlaylist,
            serverUrl: 'https://provider.example.test',
            username: 'demo',
            password: 'secret',
        } as PlaylistMeta;

        expect(actionIds(playlist, true)).toEqual([
            'refresh',
            'playlist-info',
            'account-info',
            'remove',
        ]);
    });

    it('exposes info and remove for Stalker sources', () => {
        const playlist = {
            ...basePlaylist,
            macAddress: '00:1A:79:00:00:01',
            portalUrl: 'https://stalker.example.test',
        } as PlaylistMeta;

        expect(actionIds(playlist, false)).toEqual(['playlist-info', 'remove']);
    });
});
