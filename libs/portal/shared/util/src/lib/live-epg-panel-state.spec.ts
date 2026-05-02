import {
    DEFAULT_LIVE_EPG_PANEL_STATE,
    LIVE_EPG_PANEL_STATE_STORAGE_KEY,
    isLiveEpgPanelState,
    persistLiveEpgPanelState,
    restoreLiveEpgPanelState,
} from './live-epg-panel-state';

describe('live EPG panel state', () => {
    afterEach(() => {
        localStorage.removeItem(LIVE_EPG_PANEL_STATE_STORAGE_KEY);
        localStorage.removeItem('custom-live-epg-panel-state');
    });

    it('accepts only known panel states', () => {
        expect(isLiveEpgPanelState('expanded')).toBe(true);
        expect(isLiveEpgPanelState('collapsed')).toBe(true);
        expect(isLiveEpgPanelState('hidden')).toBe(false);
        expect(isLiveEpgPanelState(null)).toBe(false);
    });

    it('restores expanded as the default for missing or invalid storage', () => {
        expect(restoreLiveEpgPanelState()).toBe(DEFAULT_LIVE_EPG_PANEL_STATE);

        localStorage.setItem(LIVE_EPG_PANEL_STATE_STORAGE_KEY, 'hidden');

        expect(restoreLiveEpgPanelState()).toBe(DEFAULT_LIVE_EPG_PANEL_STATE);
    });

    it('restores and persists collapsed state', () => {
        persistLiveEpgPanelState('collapsed');

        expect(localStorage.getItem(LIVE_EPG_PANEL_STATE_STORAGE_KEY)).toBe(
            'collapsed'
        );
        expect(restoreLiveEpgPanelState()).toBe('collapsed');
    });

    it('supports custom storage keys and fallback values', () => {
        expect(
            restoreLiveEpgPanelState('custom-live-epg-panel-state', 'collapsed')
        ).toBe('collapsed');

        persistLiveEpgPanelState('expanded', 'custom-live-epg-panel-state');

        expect(restoreLiveEpgPanelState('custom-live-epg-panel-state')).toBe(
            'expanded'
        );
    });
});
