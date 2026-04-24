import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    OnDestroy,
    effect,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

export interface DashboardRailAction {
    id: string;
    labelKey: string;
    icon: string;
    destructive?: boolean;
    disabled?: boolean;
    separatorBefore?: boolean;
}

export interface DashboardRailCard {
    id: string;
    title: string;
    subtitle?: string;
    imageUrl?: string;
    icon: string;
    link: string[];
    state?: Record<string, unknown>;
    actions?: DashboardRailAction[];
}

export interface DashboardRailActionSelection {
    action: DashboardRailAction;
    card: DashboardRailCard;
}

@Component({
    selector: 'lib-dashboard-rail',
    imports: [
        MatButtonModule,
        MatIcon,
        MatMenuModule,
        RouterLink,
        TranslatePipe,
    ],
    templateUrl: './dashboard-rail.component.html',
    styleUrl: './dashboard-rail.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardRailComponent implements AfterViewInit, OnDestroy {
    readonly label = input.required<string>();
    readonly items = input.required<DashboardRailCard[]>();
    readonly seeAllLink = input<string[] | null>(null);
    readonly aspectRatio = input<string>('2 / 3');
    readonly testId = input<string | null>(null);
    readonly actionSelected = output<DashboardRailActionSelection>();
    /**
     * True total in the underlying dataset. Shown as a count badge next to
     * the rail label. Falls back to `items().length` when not supplied.
     */
    readonly totalCount = input<number | null>(null);

    private readonly track =
        viewChild.required<ElementRef<HTMLDivElement>>('track');

    readonly canScrollLeft = signal(false);
    readonly canScrollRight = signal(false);
    readonly failedImages = signal<Record<string, true>>({});
    private readonly viewReady = signal(false);

    private resizeObserver?: ResizeObserver;
    private resetFrameId: number | null = null;
    private settleFrameId: number | null = null;

    constructor() {
        effect(() => {
            this.items();
            if (!this.viewReady()) return;
            this.scheduleResetToStart();
        });
    }

    ngAfterViewInit(): void {
        this.viewReady.set(true);
        this.updateScrollState();
        this.resizeObserver = new ResizeObserver(() =>
            this.updateScrollState()
        );
        this.resizeObserver.observe(this.track().nativeElement);
    }

    ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
        this.cancelPendingReset();
    }

    onScroll(): void {
        this.updateScrollState();
    }

    scrollBy(direction: 1 | -1): void {
        const el = this.track().nativeElement;
        el.scrollBy({
            left: direction * el.clientWidth * 0.85,
            behavior: 'smooth',
        });
    }

    markFailed(id: string): void {
        this.failedImages.update((state) =>
            state[id] ? state : { ...state, [id]: true }
        );
    }

    stopActionEvent(event: Event): void {
        event.stopPropagation();
    }

    selectAction(
        card: DashboardRailCard,
        action: DashboardRailAction,
        event: Event
    ): void {
        event.stopPropagation();
        this.actionSelected.emit({ card, action });
    }

    private updateScrollState(): void {
        const el = this.track().nativeElement;
        this.canScrollLeft.set(el.scrollLeft > 4);
        this.canScrollRight.set(
            el.scrollLeft + el.clientWidth < el.scrollWidth - 4
        );
    }

    private scheduleResetToStart(): void {
        this.cancelPendingReset();
        this.resetFrameId = requestAnimationFrame(() => {
            this.resetFrameId = null;
            this.settleFrameId = requestAnimationFrame(() => {
                this.settleFrameId = null;
                const el = this.track().nativeElement;
                el.scrollTo({ left: 0, behavior: 'auto' });
                this.updateScrollState();
            });
        });
    }

    private cancelPendingReset(): void {
        if (this.resetFrameId !== null) {
            cancelAnimationFrame(this.resetFrameId);
            this.resetFrameId = null;
        }
        if (this.settleFrameId !== null) {
            cancelAnimationFrame(this.settleFrameId);
            this.settleFrameId = null;
        }
    }
}
