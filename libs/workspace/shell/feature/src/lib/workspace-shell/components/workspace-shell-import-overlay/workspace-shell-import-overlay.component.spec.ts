import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { WorkspaceShellXtreamImportService } from '../../services/workspace-shell-xtream-import.service';
import { WorkspaceShellImportOverlayComponent } from './workspace-shell-import-overlay.component';

class MockWorkspaceShellXtreamImportService {
    readonly xtreamImportSourceLabel = signal('');
    readonly xtreamImportPhaseTone = signal<'remote' | 'local' | null>(null);
    readonly xtreamImportTitleLabel = signal('Import title');
    readonly xtreamImportPhaseLabel = signal('');
    readonly xtreamImportDetailLabel = signal('');
    readonly xtreamImportProgressLabel = signal('');
    readonly xtreamActiveImportCount = signal(0);
    readonly xtreamActiveItemsToImport = signal(0);
    readonly canCancelXtreamImport = signal(false);
    readonly isCancellingXtreamImport = signal(false);

    cancelXtreamImport = jest.fn();
}

describe('WorkspaceShellImportOverlayComponent', () => {
    let importService: MockWorkspaceShellXtreamImportService;

    beforeEach(async () => {
        importService = new MockWorkspaceShellXtreamImportService();

        await TestBed.configureTestingModule({
            imports: [
                WorkspaceShellImportOverlayComponent,
                NoopAnimationsModule,
            ],
            providers: [
                {
                    provide: WorkspaceShellXtreamImportService,
                    useValue: importService,
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
    });

    it('renders the title label', () => {
        const fixture = TestBed.createComponent(
            WorkspaceShellImportOverlayComponent
        );
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelector(
                '.workspace-loading-overlay__card h3'
            ).textContent
        ).toContain('Import title');
    });

    it('renders the progress copy when the service exposes one', () => {
        importService.xtreamImportProgressLabel.set('Movies imported: 20 / 12,323');

        const fixture = TestBed.createComponent(
            WorkspaceShellImportOverlayComponent
        );
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelector(
                '.workspace-loading-overlay__progress-copy'
            )?.textContent
        ).toContain('Movies imported: 20 / 12,323');
    });

    it('renders a determinate progress bar when current and total are non-zero', () => {
        importService.xtreamActiveImportCount.set(20);
        importService.xtreamActiveItemsToImport.set(100);

        const fixture = TestBed.createComponent(
            WorkspaceShellImportOverlayComponent
        );
        fixture.detectChanges();

        const progress = fixture.nativeElement.querySelector(
            'mat-progress-bar'
        );
        expect(progress).not.toBeNull();
        expect(progress.getAttribute('mode')).toBe('determinate');
    });

    it('renders an indeterminate progress bar when totals are unknown', () => {
        const fixture = TestBed.createComponent(
            WorkspaceShellImportOverlayComponent
        );
        fixture.detectChanges();

        const progress = fixture.nativeElement.querySelector(
            'mat-progress-bar'
        );
        expect(progress.getAttribute('mode')).toBe('indeterminate');
    });

    it('toggles the remote badge modifier when phase tone is remote', () => {
        importService.xtreamImportSourceLabel.set('REMOTE');
        importService.xtreamImportPhaseTone.set('remote');

        const fixture = TestBed.createComponent(
            WorkspaceShellImportOverlayComponent
        );
        fixture.detectChanges();

        const badge = fixture.nativeElement.querySelector(
            '.workspace-loading-overlay__badge'
        );
        expect(badge).not.toBeNull();
        expect(
            badge.classList.contains('workspace-loading-overlay__badge--remote')
        ).toBe(true);
    });

    it('forwards cancel clicks to the import service', () => {
        importService.canCancelXtreamImport.set(true);

        const fixture = TestBed.createComponent(
            WorkspaceShellImportOverlayComponent
        );
        fixture.detectChanges();

        const button = fixture.nativeElement.querySelector(
            '.workspace-loading-overlay__action'
        ) as HTMLButtonElement;
        button.click();

        expect(importService.cancelXtreamImport).toHaveBeenCalledTimes(1);
    });
});
