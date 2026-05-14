import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { VjsPlayerComponent as VjsPlayerComponentInstance } from './vjs-player.component';

const videoJsMock = jest.fn();
const mpegTsCreatePlayerMock = jest.fn();
const mpegTsIsSupportedMock = jest.fn(() => false);

jest.unstable_mockModule('video.js', () => ({
    default: videoJsMock,
}));

jest.unstable_mockModule('@yangkghjh/videojs-aspect-ratio-panel', () => ({}));
jest.unstable_mockModule('videojs-contrib-quality-levels', () => ({}));
jest.unstable_mockModule('videojs-quality-selector-hls', () => ({}));

jest.unstable_mockModule('mpegts.js', () => ({
    default: {
        createPlayer: mpegTsCreatePlayerMock,
        isSupported: mpegTsIsSupportedMock,
        Events: {
            ERROR: 'error',
        },
    },
}));

describe('VjsPlayerComponent', () => {
    let VjsPlayerComponent: typeof import('./vjs-player.component').VjsPlayerComponent;
    let component: VjsPlayerComponentInstance;
    let player: VjsPlayerComponentInstance['player'];

    type SignalApiShape = {
        options: () => unknown;
        volume: () => number;
        startTime: () => number;
        timeUpdate: { emit: (event: unknown) => void };
        playbackIssue: {
            emit: (event: unknown) => void;
            subscribe: (callback: (event: unknown) => void) => {
                unsubscribe: () => void;
            };
        };
    };

    beforeAll(async () => {
        ({ VjsPlayerComponent } = await import('./vjs-player.component'));
    });

    beforeEach(async () => {
        mpegTsCreatePlayerMock.mockReset();
        mpegTsCreatePlayerMock.mockReturnValue({
            attachMediaElement: jest.fn(),
            pause: jest.fn(),
            unload: jest.fn(),
            detachMediaElement: jest.fn(),
            destroy: jest.fn(),
            on: jest.fn(),
            load: jest.fn(),
            play: jest.fn(),
        });
        await TestBed.configureTestingModule({
            imports: [VjsPlayerComponent],
        }).compileComponents();

        component =
            TestBed.createComponent(VjsPlayerComponent).componentInstance;
        player = {
            error: jest.fn(),
            src: jest.fn(),
            reset: jest.fn(),
            volume: jest.fn(),
            dispose: jest.fn(),
        } as unknown as VjsPlayerComponentInstance['player'];
        component.player = player;
    });

    it('uses signal-based inputs and outputs', () => {
        const signalComponent = component as unknown as SignalApiShape;

        expect(typeof signalComponent.options).toBe('function');
        expect(signalComponent.volume()).toBe(1);
        expect(signalComponent.startTime()).toBe(0);
        expect(typeof signalComponent.timeUpdate.emit).toBe('function');
        expect(typeof signalComponent.playbackIssue.emit).toBe('function');
    });

    it('does not reset VideoJS when options change without changing the source', () => {
        const previousOptions = {
            sources: [
                {
                    src: 'https://example.com/live/playlist.m3u8',
                    type: 'application/x-mpegURL',
                },
            ],
        };
        const currentOptions = {
            sources: [
                {
                    src: 'https://example.com/live/playlist.m3u8',
                    type: 'application/x-mpegURL',
                },
            ],
        };

        component.ngOnChanges({
            options: new SimpleChange(previousOptions, currentOptions, false),
        });

        expect(player.src).not.toHaveBeenCalled();
    });

    it('updates VideoJS when options change to a different source', () => {
        const previousOptions = {
            sources: [
                {
                    src: 'https://example.com/live/playlist.m3u8',
                    type: 'application/x-mpegURL',
                },
            ],
        };
        const currentOptions = {
            sources: [
                {
                    src: 'https://example.com/live/other-playlist.m3u8',
                    type: 'application/x-mpegURL',
                },
            ],
        };

        component.ngOnChanges({
            options: new SimpleChange(previousOptions, currentOptions, false),
        });

        expect(player.src).toHaveBeenCalledWith(currentOptions.sources[0]);
    });

    it('updates volume when options change without changing the source', () => {
        const previousOptions = {
            sources: [
                {
                    src: 'https://example.com/live/playlist.m3u8',
                    type: 'application/x-mpegURL',
                },
            ],
        };
        const currentOptions = {
            sources: [
                {
                    src: 'https://example.com/live/playlist.m3u8',
                    type: 'application/x-mpegURL',
                },
            ],
        };

        component.ngOnChanges({
            options: new SimpleChange(previousOptions, currentOptions, false),
            volume: new SimpleChange(0.5, 0.75, false),
        });

        expect(player.src).not.toHaveBeenCalled();
        expect(player.volume).toHaveBeenCalledWith(0.75);
    });

    it('does not treat query-declared HLS streams as MPEG-TS sources', () => {
        mpegTsIsSupportedMock.mockReturnValue(true);
        const isMpegTsSource = (
            component as unknown as {
                isMpegTsSource: (url?: string) => boolean;
            }
        ).isMpegTsSource.bind(component);

        expect(
            isMpegTsSource('https://example.com/play?extension=m3u8&token=x')
        ).toBe(false);
        expect(
            isMpegTsSource('https://example.com/live.php?extension=ts')
        ).toBe(true);
        expect(isMpegTsSource('https://example.com/live.php?stream=123')).toBe(
            true
        );
    });

    it('emits a playback issue when VideoJS reports an unsupported source', () => {
        const issues: unknown[] = [];
        const videoElement = document.createElement('video');
        const testComponent = component as unknown as SignalApiShape & {
            options: () => {
                sources: Array<{ src: string; type: string }>;
            };
            target: () => { nativeElement: HTMLVideoElement };
            handleVideoJsPlaybackError: () => void;
        };
        testComponent.options = () => ({
            sources: [
                {
                    src: 'https://example.com/archive/movie.mkv',
                    type: 'video/matroska',
                },
            ],
        });
        testComponent.target = () => ({ nativeElement: videoElement });
        jest.mocked(player.error).mockReturnValue({
            code: 4,
            message: 'No compatible source was found',
        });

        const subscription = component.playbackIssue.subscribe((issue) =>
            issues.push(issue)
        );
        testComponent.handleVideoJsPlaybackError();
        subscription.unsubscribe();

        expect(issues).toEqual([
            expect.objectContaining({
                code: 'unsupported-container',
                source: 'native',
                sourceUrl: 'https://example.com/archive/movie.mkv',
                externalFallbackRecommended: true,
            }),
        ]);
    });

    it('tears down mpegts playback when options clear the source', () => {
        const mpegtsPlayer = {
            pause: jest.fn(),
            unload: jest.fn(),
            detachMediaElement: jest.fn(),
            destroy: jest.fn(),
        };
        const componentInternals = component as unknown as {
            mpegtsPlayer: typeof mpegtsPlayer | null;
        };
        componentInternals.mpegtsPlayer = mpegtsPlayer;
        const previousOptions = {
            sources: [
                {
                    src: 'https://example.com/live/stream.ts',
                    type: 'video/mp2t',
                },
            ],
        };

        component.ngOnChanges({
            options: new SimpleChange(previousOptions, { sources: [] }, false),
        });

        expect(mpegtsPlayer.pause).toHaveBeenCalled();
        expect(mpegtsPlayer.unload).toHaveBeenCalled();
        expect(mpegtsPlayer.detachMediaElement).toHaveBeenCalled();
        expect(mpegtsPlayer.destroy).toHaveBeenCalled();
        expect(componentInternals.mpegtsPlayer).toBeNull();
        expect(player.reset).toHaveBeenCalled();
        expect(player.src).not.toHaveBeenCalled();
    });

    it('passes the non-live option to mpegts.js for VOD MPEG-TS playback', () => {
        const videoElement = document.createElement('video');
        const testComponent = component as unknown as {
            options: () => {
                isLive: boolean;
                sources: Array<{ src: string; type: string }>;
            };
            player: {
                tech: () => { el: () => HTMLVideoElement };
                dispose: () => void;
            };
            initMpegTs: (url: string) => void;
        };
        testComponent.options = () => ({
            isLive: false,
            sources: [
                {
                    src: 'https://example.com/movie/123.ts',
                    type: 'video/mp2t',
                },
            ],
        });
        testComponent.player = {
            tech: () => ({ el: () => videoElement }),
            dispose: jest.fn(),
        };

        testComponent.initMpegTs('https://example.com/movie/123.ts');

        expect(mpegTsCreatePlayerMock).toHaveBeenCalledWith({
            type: 'mpegts',
            isLive: false,
            url: 'https://example.com/movie/123.ts',
        });
    });

    it('normalizes VideoJS duration for non-live MPEG-TS VOD when MSE reports infinity', () => {
        const videoElement = document.createElement('video');
        Object.defineProperty(videoElement, 'seekable', {
            value: createTimeRanges([[0, 164.072]]),
        });
        Object.defineProperty(videoElement, 'buffered', {
            value: createTimeRanges([]),
        });
        const testComponent = component as unknown as {
            options: () => {
                isLive: boolean;
                sources: Array<{ src: string; type: string }>;
            };
            player: {
                duration: (duration: number) => void;
                dispose: () => void;
            };
            mpegTsVodDurationTarget: HTMLVideoElement;
            syncMpegTsVodDuration: () => void;
        };
        testComponent.options = () => ({
            isLive: false,
            sources: [
                {
                    src: 'https://example.com/movie/123.ts',
                    type: 'video/mp2t',
                },
            ],
        });
        testComponent.player = {
            duration: jest.fn(),
            dispose: jest.fn(),
        };
        testComponent.mpegTsVodDurationTarget = videoElement;

        testComponent.syncMpegTsVodDuration();

        expect(testComponent.player.duration).toHaveBeenCalledWith(164.072);
    });
});

function createTimeRanges(ranges: Array<[number, number]>): TimeRanges {
    return {
        length: ranges.length,
        start: (index: number) => ranges[index][0],
        end: (index: number) => ranges[index][1],
    } as TimeRanges;
}
