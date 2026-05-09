import {
    DEFAULT_LIVE_SIDEBAR_STATE,
    LIVE_SIDEBAR_STATE_STORAGE_KEY,
    isLiveSidebarState,
    persistLiveSidebarState,
    restoreLiveSidebarState,
} from './live-sidebar-state';

describe('live sidebar state', () => {
    afterEach(() => {
        localStorage.removeItem(LIVE_SIDEBAR_STATE_STORAGE_KEY);
        localStorage.removeItem('custom-live-sidebar-state');
    });

    it('accepts only known sidebar states', () => {
        expect(isLiveSidebarState('expanded')).toBe(true);
        expect(isLiveSidebarState('collapsed')).toBe(true);
        expect(isLiveSidebarState('hidden')).toBe(false);
        expect(isLiveSidebarState(null)).toBe(false);
    });

    it('restores expanded as the default for missing or invalid storage', () => {
        expect(restoreLiveSidebarState()).toBe(DEFAULT_LIVE_SIDEBAR_STATE);

        localStorage.setItem(LIVE_SIDEBAR_STATE_STORAGE_KEY, 'hidden');

        expect(restoreLiveSidebarState()).toBe(DEFAULT_LIVE_SIDEBAR_STATE);
    });

    it('restores and persists collapsed state', () => {
        persistLiveSidebarState('collapsed');

        expect(localStorage.getItem(LIVE_SIDEBAR_STATE_STORAGE_KEY)).toBe(
            'collapsed'
        );
        expect(restoreLiveSidebarState()).toBe('collapsed');
    });

    it('supports custom storage keys and fallback values', () => {
        expect(
            restoreLiveSidebarState('custom-live-sidebar-state', 'collapsed')
        ).toBe('collapsed');

        persistLiveSidebarState('expanded', 'custom-live-sidebar-state');

        expect(restoreLiveSidebarState('custom-live-sidebar-state')).toBe(
            'expanded'
        );
    });
});
