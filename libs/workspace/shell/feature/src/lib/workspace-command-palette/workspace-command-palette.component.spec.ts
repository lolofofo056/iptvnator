import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { WorkspaceResolvedCommandItem } from '@iptvnator/portal/shared/util';
import { WorkspaceCommandPaletteComponent } from './workspace-command-palette.component';

describe('WorkspaceCommandPaletteComponent', () => {
    let fixture: ComponentFixture<WorkspaceCommandPaletteComponent>;
    let component: WorkspaceCommandPaletteComponent;
    let dialogRef: { close: jest.Mock };
    let commands: WorkspaceResolvedCommandItem[];

    beforeEach(async () => {
        dialogRef = {
            close: jest.fn(),
        };
        commands = [
            {
                id: 'global-search',
                label: 'Search all Xtream playlists',
                description: 'Open global search overlay',
                group: 'global',
                icon: 'search',
                keywords: ['xtream', 'global'],
                priority: 100,
                visible: true,
                enabled: false,
                run: () => undefined,
            },
            {
                id: 'playlist-search',
                label: 'Search this playlist',
                description: 'Open playlist search route',
                group: 'playlist',
                icon: 'playlist_play',
                keywords: ['playlist'],
                priority: 10,
                visible: true,
                enabled: true,
                run: () => undefined,
            },
            {
                id: 'multi-epg',
                label: 'Open Multi-EPG',
                description: '',
                group: 'view',
                icon: 'view_list',
                keywords: ['epg', 'guide'],
                priority: 0,
                visible: true,
                enabled: true,
                run: () => undefined,
            },
            {
                id: 'hidden-command',
                label: 'Hidden command',
                description: 'Should not appear',
                group: 'global',
                icon: 'visibility_off',
                keywords: [],
                priority: 200,
                visible: false,
                enabled: true,
                run: () => undefined,
            },
        ];

        await TestBed.configureTestingModule({
            imports: [WorkspaceCommandPaletteComponent],
            providers: [
                {
                    provide: MatDialogRef,
                    useValue: dialogRef,
                },
                {
                    provide: MAT_DIALOG_DATA,
                    useValue: {
                        query: 'search',
                        commands,
                    },
                },
                {
                    provide: TranslateService,
                    useValue: {
                        instant: (key: string) => key,
                        get: (key: string) => of(key),
                        stream: (key: string) => of(key),
                        onLangChange: of(null),
                        onTranslationChange: of(null),
                        onDefaultLangChange: of(null),
                        currentLang: 'en',
                        defaultLang: 'en',
                    },
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(WorkspaceCommandPaletteComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('creates and applies initial query', () => {
        expect(component).toBeTruthy();
        expect(component.query()).toBe('search');
    });

    it('selects the first enabled command by default', () => {
        expect(component.selectedIndex()).toBe(0);
        expect(component.flatCommands()[0].id).toBe('playlist-search');
    });

    it('hides non-visible commands and omits empty groups', () => {
        expect(component.flatCommands().map((command) => command.id)).toEqual([
            'playlist-search',
            'global-search',
        ]);
        expect(component.commandGroups().map((group) => group.group)).toEqual([
            'playlist',
            'global',
        ]);
    });

    it('filters commands by keywords', () => {
        component.query.set('guide');

        expect(component.flatCommands().map((command) => command.id)).toEqual([
            'multi-epg',
        ]);
    });

    it('skips disabled commands during keyboard navigation', () => {
        component.query.set('');
        fixture.detectChanges();

        expect(component.flatCommands().map((command) => command.id)).toEqual([
            'multi-epg',
            'playlist-search',
            'global-search',
        ]);
        expect(component.selectedIndex()).toBe(0);

        component.onInputKeydown(
            new KeyboardEvent('keydown', { key: 'ArrowDown' })
        );
        expect(component.selectedIndex()).toBe(1);

        component.onInputKeydown(
            new KeyboardEvent('keydown', { key: 'ArrowDown' })
        );
        expect(component.selectedIndex()).toBe(0);
    });

    it('closes with selected command and query on click', () => {
        component.query.set('');
        const command = component.flatCommands()[0];
        component.onCommandClick(command);

        expect(dialogRef.close).toHaveBeenCalledWith({
            commandId: 'multi-epg',
            query: '',
        });
    });
});
