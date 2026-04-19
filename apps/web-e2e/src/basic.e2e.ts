import { expect, test } from '@playwright/test';
import { join } from 'path';

const fixturePath = join(__dirname, 'fixtures/test.m3u');

test('basic test', async ({ page }) => {
    await page.goto('/');

    // Basic checks
    expect(await page.title()).toBe('IPTVnator');

    // Upload playlist test
    await page.getByRole('button', { name: 'Add playlist' }).click();
    const dialog = page.locator('mat-dialog-container');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: 'Add via file upload' }).click();
    await page.setInputFiles('input[type="file"]', fixturePath);
    const addButton = dialog.getByRole('button', {
        name: 'Add playlist',
        exact: true,
    });
    await expect(addButton).toBeEnabled();
    await Promise.all([
        page.waitForURL(/\/workspace\/playlists\/.+\/all$/),
        addButton.click(),
    ]);
    await expect(page.getByText('test', { exact: true })).toBeVisible();
    await expect(page.getByText('4 channels')).toBeVisible();
    await expect(page.getByText('1. Channel 1')).toBeVisible();
    await expect(page.getByText('4. HappyKids TV')).toBeVisible();
});
