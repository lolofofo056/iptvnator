import type { Page } from '@playwright/test';

import {
    addStalkerPortal,
    addXtreamPortal,
    closeElectronApp,
    defaultStalkerPortalName,
    defaultXtreamPortalName,
    expect,
    expectPortalDebugSuccess,
    goToDashboard,
    launchElectronApp,
    resetMockServers,
    stalkerMockServer,
    test,
    waitForStalkerCatalog,
    waitForXtreamCatalog,
} from './electron-test-fixtures';

test.describe('Electron Provider Smoke Tests', () => {
    test('loads Xtream content through the Electron IPC path', async ({
        dataDir,
        request,
    }) => {
        await resetMockServers(request, ['xtream']);

        const app = await launchElectronApp(dataDir);

        try {
            await addXtreamPortal(app.mainWindow);
            await waitForXtreamCatalog(app.mainWindow);
            await expectPortalDebugSuccess(app.mainWindow, 'xtream');

            await goToDashboard(app.mainWindow);
            await expectRecentSourceCard(
                app.mainWindow,
                defaultXtreamPortalName
            );
        } finally {
            await closeElectronApp(app);
        }
    });

    test('loads Stalker content through the Electron IPC path', async ({
        dataDir,
        request,
    }) => {
        await resetMockServers(request, ['stalker']);

        const app = await launchElectronApp(dataDir);

        try {
            await addStalkerPortal(app.mainWindow, {
                portalUrl: `${stalkerMockServer}/portal.php`,
            });
            await waitForStalkerCatalog(app.mainWindow);
            await expectPortalDebugSuccess(app.mainWindow, 'stalker');

            await goToDashboard(app.mainWindow);
            await expectRecentSourceCard(
                app.mainWindow,
                defaultStalkerPortalName
            );
        } finally {
            await closeElectronApp(app);
        }
    });
});

async function expectRecentSourceCard(
    page: Page,
    title: string
): Promise<void> {
    await expect(
        page.getByTestId('dashboard-recent-sources-rail')
    ).toBeVisible({
        timeout: 20000,
    });

    await expect(
        page.getByTestId('dashboard-recent-sources-rail-card').filter({
            hasText: title,
        }).first()
    ).toBeVisible({
        timeout: 20000,
    });
}
