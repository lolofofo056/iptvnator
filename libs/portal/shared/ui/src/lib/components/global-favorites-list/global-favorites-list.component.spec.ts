import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { UnifiedFavoriteChannel } from '@iptvnator/portal/shared/util';
import { GlobalFavoritesListComponent } from './global-favorites-list.component';

describe('GlobalFavoritesListComponent', () => {
    let fixture: ComponentFixture<GlobalFavoritesListComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [
                GlobalFavoritesListComponent,
                NoopAnimationsModule,
                TranslateModule.forRoot(),
            ],
            providers: [
                {
                    provide: MatDialog,
                    useValue: { open: jest.fn() },
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(GlobalFavoritesListComponent);
    });

    it('renders filled favorite stars in favorites mode', () => {
        fixture.componentRef.setInput('channels', [buildChannel('b', 'Beta')]);
        fixture.detectChanges();

        const favoriteIcon = fixture.nativeElement.querySelector(
            '.favorite-button mat-icon'
        );

        expect(favoriteIcon?.textContent?.trim()).toBe('star');
        expect(
            fixture.nativeElement.querySelectorAll('.favorite-button')
        ).toHaveLength(1);
    });

    it('renders favorite state from the supplied favorite ids in recent mode', () => {
        fixture.componentRef.setInput('mode', 'recent');
        fixture.componentRef.setInput(
            'favoriteUids',
            new Set<string>(['b'])
        );
        fixture.componentRef.setInput('channels', [
            buildChannel('a', 'Alpha'),
            buildChannel('b', 'Beta'),
        ]);
        fixture.detectChanges();

        const icons = Array.from(
            fixture.nativeElement.querySelectorAll('.favorite-button mat-icon'),
            (element: Element) => element.textContent?.trim()
        );

        expect(icons).toEqual(['star_outline', 'star']);
    });

    it('preserves incoming recent order when a favorites sort mode is set', () => {
        fixture.componentRef.setInput('mode', 'recent');
        fixture.componentRef.setInput('sortMode', 'name-asc');
        fixture.componentRef.setInput('channels', [
            buildChannel('z', 'Zulu'),
            buildChannel('a', 'Alpha'),
        ]);
        fixture.detectChanges();

        const names = Array.from(
            fixture.nativeElement.querySelectorAll('.channel-name'),
            (element: Element) => element.textContent?.trim()
        );

        expect(names).toEqual(['Zulu', 'Alpha']);
    });
});

function buildChannel(uid: string, name: string): UnifiedFavoriteChannel {
    return {
        uid,
        name,
        logo: null,
        sourceType: 'm3u',
        playlistId: 'playlist-1',
        playlistName: 'Playlist One',
        streamUrl: `https://example.com/${uid}.m3u8`,
        addedAt: '2026-04-30T12:00:00.000Z',
        position: 0,
    };
}
