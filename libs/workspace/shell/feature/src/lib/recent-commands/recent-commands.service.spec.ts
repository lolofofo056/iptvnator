import {
    EnvironmentInjector,
    Injector,
    createEnvironmentInjector,
    runInInjectionContext,
} from '@angular/core';
import { StorageMap } from '@ngx-pwa/local-storage';
import { of, throwError } from 'rxjs';
import {
    MAX_RECENT_COMMANDS,
    RecentCommandsService,
    type RecentCommandEntry,
} from './recent-commands.service';

interface StorageMapMock {
    get: jest.Mock;
    set: jest.Mock;
}

function createService(storage: StorageMapMock): RecentCommandsService {
    const injector = createEnvironmentInjector(
        [{ provide: StorageMap, useValue: storage }],
        Injector.NULL as unknown as EnvironmentInjector
    );
    return runInInjectionContext(injector, () => new RecentCommandsService());
}

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('RecentCommandsService', () => {
    let storage: StorageMapMock;

    beforeEach(() => {
        storage = {
            get: jest.fn().mockReturnValue(of(undefined)),
            set: jest.fn().mockReturnValue(of(undefined)),
        };
    });

    it('starts with an empty list when storage has no entries', async () => {
        const service = createService(storage);
        await flushMicrotasks();

        expect(service.entries()).toEqual([]);
        expect(storage.get).toHaveBeenCalledWith('recent-commands');
    });

    it('hydrates from storage on construction', async () => {
        const stored: RecentCommandEntry[] = [
            { id: 'open-settings', usedAt: 100 },
            { id: 'switch-player-mpv', usedAt: 200 },
        ];
        storage.get.mockReturnValue(of(stored));

        const service = createService(storage);
        await flushMicrotasks();

        expect(service.entries()).toEqual(stored);
    });

    it('ignores corrupt storage payloads and keeps an empty list', async () => {
        storage.get.mockReturnValue(of({ not: 'an array' }));

        const service = createService(storage);
        await flushMicrotasks();

        expect(service.entries()).toEqual([]);
    });

    it('filters out malformed entries when hydrating', async () => {
        storage.get.mockReturnValue(
            of([
                { id: 'good', usedAt: 1 },
                { id: 42, usedAt: 2 },
                null,
                { id: 'no-timestamp' },
            ])
        );

        const service = createService(storage);
        await flushMicrotasks();

        expect(service.entries()).toEqual([{ id: 'good', usedAt: 1 }]);
    });

    it('survives a storage load failure without crashing', async () => {
        const consoleErrorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
        storage.get.mockReturnValue(throwError(() => new Error('boom')));

        const service = createService(storage);
        await flushMicrotasks();

        expect(service.entries()).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });

    it('records a new entry at the head of the list', async () => {
        const service = createService(storage);
        await flushMicrotasks();

        service.record('open-settings');

        expect(service.entries()[0]?.id).toBe('open-settings');
        expect(storage.set).toHaveBeenCalledWith(
            'recent-commands',
            service.entries()
        );
    });

    it('deduplicates by id when recording an existing command', async () => {
        const service = createService(storage);
        await flushMicrotasks();

        service.record('a');
        service.record('b');
        service.record('a');

        expect(service.entries().map((e) => e.id)).toEqual(['a', 'b']);
    });

    it('caps the list at MAX_RECENT_COMMANDS', async () => {
        const service = createService(storage);
        await flushMicrotasks();

        for (let index = 0; index < MAX_RECENT_COMMANDS + 3; index++) {
            service.record(`cmd-${index}`);
        }

        expect(service.entries()).toHaveLength(MAX_RECENT_COMMANDS);
        expect(service.entries()[0]?.id).toBe(
            `cmd-${MAX_RECENT_COMMANDS + 2}`
        );
    });

    it('ignores empty ids', async () => {
        const service = createService(storage);
        await flushMicrotasks();

        service.record('');

        expect(service.entries()).toEqual([]);
        expect(storage.set).not.toHaveBeenCalled();
    });

    it('prune writes back when the list shrinks', async () => {
        storage.get.mockReturnValue(
            of([
                { id: 'a', usedAt: 1 },
                { id: 'b', usedAt: 2 },
            ])
        );
        const service = createService(storage);
        await flushMicrotasks();
        storage.set.mockClear();

        service.prune((id) => id === 'a');

        expect(service.entries().map((e) => e.id)).toEqual(['a']);
        expect(storage.set).toHaveBeenCalledWith('recent-commands', [
            { id: 'a', usedAt: 1 },
        ]);
    });

    it('prune is a no-op when nothing is removed', async () => {
        storage.get.mockReturnValue(
            of([
                { id: 'a', usedAt: 1 },
                { id: 'b', usedAt: 2 },
            ])
        );
        const service = createService(storage);
        await flushMicrotasks();
        storage.set.mockClear();

        service.prune(() => true);

        expect(storage.set).not.toHaveBeenCalled();
    });
});
