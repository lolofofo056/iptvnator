import { Injectable, inject, signal } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';

@Injectable({ providedIn: 'root' })
export class EmbeddedMpvOverlayVisibilityService {
    readonly overlayActive = signal(false);

    private readonly overlayContainer = inject(OverlayContainer);
    private observer: MutationObserver | null = null;

    constructor() {
        if (typeof MutationObserver === 'undefined') {
            return;
        }

        const container = this.overlayContainer.getContainerElement();
        this.observer = new MutationObserver(() => this.recompute(container));
        this.observer.observe(container, { childList: true, subtree: true });
        this.recompute(container);
    }

    private recompute(container: HTMLElement): void {
        const hasBackdrop =
            container.querySelector('.cdk-overlay-backdrop') !== null;
        if (this.overlayActive() !== hasBackdrop) {
            this.overlayActive.set(hasBackdrop);
        }
    }
}
