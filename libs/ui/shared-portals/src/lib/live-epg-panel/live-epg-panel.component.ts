import { DatePipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    input,
    output,
    signal,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';

export interface LiveEpgPanelSummary {
    readonly title?: string | null;
    readonly start?: string | number | Date | null;
    readonly stop?: string | number | Date | null;
    readonly progress?: number | null;
}

@Component({
    selector: 'app-live-epg-panel',
    imports: [DatePipe, MatIcon, MatIconButton, MatTooltip, TranslatePipe],
    templateUrl: './live-epg-panel.component.html',
    styleUrl: './live-epg-panel.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveEpgPanelComponent {
    readonly collapsed = input(false);
    readonly summary = input<LiveEpgPanelSummary | null>(null);
    readonly loading = input(false);
    readonly collapsedChange = output<boolean>();

    private readonly currentTimeMs = signal(Date.now());

    readonly hasSummary = computed(() => {
        const title = this.summary()?.title;
        return typeof title === 'string' && title.trim().length > 0;
    });

    readonly hasTimeRange = computed(() => {
        const summary = this.summary();
        return !!summary?.start || !!summary?.stop;
    });

    readonly progress = computed(() => {
        const summary = this.summary();
        if (!summary) {
            return null;
        }

        const explicitProgress = Number(summary.progress);
        if (Number.isFinite(explicitProgress)) {
            return clampProgress(explicitProgress);
        }

        const startMs = toTimeMs(summary.start);
        const stopMs = toTimeMs(summary.stop);
        if (startMs === null || stopMs === null || stopMs <= startMs) {
            return null;
        }

        const elapsed = this.currentTimeMs() - startMs;
        return clampProgress((elapsed / (stopMs - startMs)) * 100);
    });

    constructor() {
        effect((onCleanup) => {
            const intervalId = window.setInterval(() => {
                this.currentTimeMs.set(Date.now());
            }, 30_000);

            onCleanup(() => clearInterval(intervalId));
        });
    }

    toggleCollapsed(): void {
        this.collapsedChange.emit(!this.collapsed());
    }
}

function toTimeMs(
    value: string | number | Date | null | undefined
): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed =
        value instanceof Date
            ? value.getTime()
            : typeof value === 'number'
              ? value
              : Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function clampProgress(value: number): number {
    return Math.min(100, Math.max(0, value));
}
