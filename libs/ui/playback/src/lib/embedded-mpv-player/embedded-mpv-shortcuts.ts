export interface EmbeddedMpvShortcutHandlers {
    isAvailable: () => boolean;
    onEscape: () => void;
    togglePaused: () => void;
    toggleFullscreen: () => void;
    seekBy: (deltaSeconds: number) => void;
    adjustVolume: (delta: number) => void;
    toggleMute: () => void;
}

export class EmbeddedMpvShortcuts {
    private handlers: EmbeddedMpvShortcutHandlers | null = null;
    private readonly listener = (event: KeyboardEvent) => this.handle(event);

    attach(handlers: EmbeddedMpvShortcutHandlers): void {
        this.handlers = handlers;
        if (typeof document !== 'undefined') {
            document.addEventListener('keydown', this.listener);
        }
    }

    detach(): void {
        if (typeof document !== 'undefined') {
            document.removeEventListener('keydown', this.listener);
        }
        this.handlers = null;
    }

    private handle(event: KeyboardEvent): void {
        const handlers = this.handlers;
        if (!handlers) {
            return;
        }

        if (event.key === 'Escape') {
            handlers.onEscape();
            return;
        }

        if (this.shouldIgnore(event) || !handlers.isAvailable()) {
            return;
        }

        switch (event.key) {
            case ' ':
            case 'k':
            case 'K':
                event.preventDefault();
                handlers.togglePaused();
                return;
            case 'f':
            case 'F':
                event.preventDefault();
                handlers.toggleFullscreen();
                return;
            case 'ArrowLeft':
                event.preventDefault();
                handlers.seekBy(-5);
                return;
            case 'ArrowRight':
                event.preventDefault();
                handlers.seekBy(5);
                return;
            case 'ArrowUp':
                event.preventDefault();
                handlers.adjustVolume(0.05);
                return;
            case 'ArrowDown':
                event.preventDefault();
                handlers.adjustVolume(-0.05);
                return;
            case 'm':
            case 'M':
                event.preventDefault();
                handlers.toggleMute();
                return;
        }
    }

    private shouldIgnore(event: KeyboardEvent): boolean {
        const target = event.target as HTMLElement | null;
        if (!target) {
            return false;
        }
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            return true;
        }
        return target.isContentEditable;
    }
}
