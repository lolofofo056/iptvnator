import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import {
    LiveEpgPanelComponent,
    LiveEpgPanelSummary,
} from './live-epg-panel.component';

@Component({
    standalone: true,
    imports: [LiveEpgPanelComponent],
    template: `
        <app-live-epg-panel
            [collapsed]="collapsed"
            [summary]="summary"
            [loading]="loading"
            (collapsedChange)="collapsed = $event"
        >
            <div class="projected-content">Projected EPG</div>
        </app-live-epg-panel>
    `,
})
class HostComponent {
    collapsed = false;
    loading = false;
    summary: LiveEpgPanelSummary | null = {
        title: 'Current Show',
        start: '2026-04-05T11:30:00.000Z',
        stop: '2026-04-05T12:30:00.000Z',
    };
}

describe('LiveEpgPanelComponent', () => {
    let fixture: ComponentFixture<HostComponent>;

    beforeEach(async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-05T12:00:00.000Z'));

        await TestBed.configureTestingModule({
            imports: [
                HostComponent,
                NoopAnimationsModule,
                TranslateModule.forRoot(),
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(HostComponent);
    });

    afterEach(() => {
        fixture.destroy();
        jest.useRealTimers();
    });

    it('renders the current program summary and progress', () => {
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelector('.live-epg-panel__title')
                .textContent
        ).toContain('Current Show');
        expect(
            fixture.nativeElement.querySelector(
                '.live-epg-panel__progress-fill'
            ).style.width
        ).toBe('50%');
    });

    it('emits and applies collapsed state from the toggle button', () => {
        fixture.detectChanges();

        fixture.nativeElement.querySelector('button').click();
        fixture.detectChanges();

        expect(fixture.componentInstance.collapsed).toBe(true);
        expect(
            fixture.nativeElement
                .querySelector('.live-epg-panel')
                .classList.contains('live-epg-panel--collapsed')
        ).toBe(true);
    });

    it('keeps projected EPG content mounted while collapsed and makes it inert', () => {
        fixture.componentInstance.collapsed = true;
        fixture.detectChanges();

        const body = fixture.nativeElement.querySelector(
            '.live-epg-panel__body'
        );

        expect(
            fixture.nativeElement.querySelector('.projected-content')
                .textContent
        ).toContain('Projected EPG');
        expect(body.getAttribute('aria-hidden')).toBe('true');
        expect(body.hasAttribute('inert')).toBe(true);
    });

    it('renders the fallback text when there is no current program', () => {
        fixture.componentInstance.summary = null;
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelector('.live-epg-panel__title')
                .textContent
        ).toContain('EPG.NO_PROGRAM_INFO');
    });
});
