import type {
    EmbeddedMpvBounds,
    EmbeddedMpvSessionStatus,
    ResolvedPortalPlayback,
} from 'shared-interfaces';
import type { EmbeddedMpvNativeService as EmbeddedMpvNativeServiceType } from './embedded-mpv-native.service';

const powerSaveBlockerMock = {
    start: jest.fn<number, [string]>(),
    stop: jest.fn<void, [number]>(),
    isStarted: jest.fn<boolean, [number]>(),
};

jest.mock('electron', () => ({
    app: {
        isPackaged: true,
        getAppPath: () => '/mock/app.asar',
    },
    powerSaveBlocker: powerSaveBlockerMock,
}));

const mainWindowSendMock = jest.fn();
const mainWindowMock = {
    isDestroyed: () => false,
    getNativeWindowHandle: () => Buffer.alloc(8),
    webContents: { send: mainWindowSendMock },
};

jest.mock('../app', () => ({
    __esModule: true,
    default: {
        get mainWindow() {
            return mainWindowMock;
        },
    },
}));

interface MockSnapshot {
    status: EmbeddedMpvSessionStatus;
    positionSeconds: number;
    durationSeconds: number | null;
    volume: number;
    streamUrl: string;
    audioTracks?: never[];
    selectedAudioTrackId?: number | null;
    error?: string;
}

interface MockAddon {
    isSupported: jest.Mock<boolean, []>;
    createSession: jest.Mock<
        string,
        [Buffer, EmbeddedMpvBounds, string?, number?]
    >;
    loadPlayback: jest.Mock<void, [string, ResolvedPortalPlayback]>;
    setBounds: jest.Mock<void, [string, EmbeddedMpvBounds]>;
    setPaused: jest.Mock<void, [string, boolean]>;
    seek: jest.Mock<void, [string, number]>;
    setVolume: jest.Mock<void, [string, number]>;
    setAudioTrack: jest.Mock<void, [string, number]>;
    getSessionSnapshot: jest.Mock<MockSnapshot | null, [string]>;
    disposeSession: jest.Mock<void, [string]>;
}

function createMockAddon(): MockAddon {
    return {
        isSupported: jest.fn().mockReturnValue(true),
        createSession: jest.fn(),
        loadPlayback: jest.fn(),
        setBounds: jest.fn(),
        setPaused: jest.fn(),
        seek: jest.fn(),
        setVolume: jest.fn(),
        setAudioTrack: jest.fn(),
        getSessionSnapshot: jest.fn(),
        disposeSession: jest.fn(),
    };
}

const BOUNDS: EmbeddedMpvBounds = { x: 0, y: 0, width: 100, height: 100 };

describe('EmbeddedMpvNativeService power blocker', () => {
    let EmbeddedMpvNativeService: typeof EmbeddedMpvNativeServiceType;
    let service: EmbeddedMpvNativeServiceType;
    let addon: MockAddon;
    let nextBlockerId: number;

    beforeEach(async () => {
        jest.resetModules();
        powerSaveBlockerMock.start.mockReset();
        powerSaveBlockerMock.stop.mockReset();
        powerSaveBlockerMock.isStarted.mockReset();
        mainWindowSendMock.mockReset();

        nextBlockerId = 1;
        powerSaveBlockerMock.start.mockImplementation(() => nextBlockerId++);
        powerSaveBlockerMock.isStarted.mockReturnValue(true);

        ({ EmbeddedMpvNativeService } = await import(
            './embedded-mpv-native.service'
        ));
        service = new EmbeddedMpvNativeService();
        addon = createMockAddon();
        // The addon is normally loaded via createRequire from a vendored .node
        // file. For unit tests we inject a mock implementation directly.
        (service as unknown as { addon: MockAddon }).addon = addon;
    });

    afterEach(() => {
        service.shutdown();
    });

    function startSession(
        sessionId: string,
        snapshot: MockSnapshot
    ): void {
        addon.createSession.mockReturnValueOnce(sessionId);
        addon.getSessionSnapshot.mockReturnValueOnce(snapshot);
        service.createSession(BOUNDS, '', 1);
    }

    function snapshot(
        status: EmbeddedMpvSessionStatus,
        overrides: Partial<MockSnapshot> = {}
    ): MockSnapshot {
        return {
            status,
            positionSeconds: 0,
            durationSeconds: null,
            volume: 1,
            streamUrl: 'mock://stream',
            ...overrides,
        };
    }

    it('does not acquire a blocker for a loading session', () => {
        startSession('s1', snapshot('loading'));
        expect(powerSaveBlockerMock.start).not.toHaveBeenCalled();
    });

    it('acquires a single prevent-display-sleep blocker once a session is playing', () => {
        startSession('s1', snapshot('loading'));

        addon.getSessionSnapshot.mockReturnValueOnce(snapshot('playing'));
        service.setPaused('s1', false);

        expect(powerSaveBlockerMock.start).toHaveBeenCalledTimes(1);
        expect(powerSaveBlockerMock.start).toHaveBeenCalledWith(
            'prevent-display-sleep'
        );

        // Subsequent refreshes while still playing must not start a second blocker.
        addon.getSessionSnapshot.mockReturnValueOnce(snapshot('playing'));
        service.setPaused('s1', false);
        expect(powerSaveBlockerMock.start).toHaveBeenCalledTimes(1);
    });

    it('releases the blocker when the session transitions to paused', () => {
        startSession('s1', snapshot('playing'));
        expect(powerSaveBlockerMock.start).toHaveBeenCalledTimes(1);

        addon.getSessionSnapshot.mockReturnValueOnce(snapshot('paused'));
        service.setPaused('s1', true);

        expect(powerSaveBlockerMock.stop).toHaveBeenCalledTimes(1);
        expect(powerSaveBlockerMock.stop).toHaveBeenCalledWith(1);
    });

    it('keeps the blocker held while any other session is still playing', () => {
        startSession('s1', snapshot('playing'));
        startSession('s2', snapshot('playing'));

        // Only one blocker for both sessions.
        expect(powerSaveBlockerMock.start).toHaveBeenCalledTimes(1);

        // s1 pauses — s2 still playing, so do not release.
        addon.getSessionSnapshot.mockReturnValueOnce(snapshot('paused'));
        service.setPaused('s1', true);
        expect(powerSaveBlockerMock.stop).not.toHaveBeenCalled();

        // s2 pauses — now there is nothing playing.
        addon.getSessionSnapshot.mockReturnValueOnce(snapshot('paused'));
        service.setPaused('s2', true);
        expect(powerSaveBlockerMock.stop).toHaveBeenCalledTimes(1);
    });

    it('releases the blocker when the playing session is disposed', () => {
        startSession('s1', snapshot('playing'));
        expect(powerSaveBlockerMock.start).toHaveBeenCalledTimes(1);

        service.disposeSession('s1');

        expect(addon.disposeSession).toHaveBeenCalledWith('s1');
        expect(powerSaveBlockerMock.stop).toHaveBeenCalledTimes(1);
    });

    it('releases the blocker on shutdown', () => {
        startSession('s1', snapshot('playing'));
        expect(powerSaveBlockerMock.start).toHaveBeenCalledTimes(1);

        service.shutdown();

        expect(powerSaveBlockerMock.stop).toHaveBeenCalled();
    });

    it('skips powerSaveBlocker.stop if the assertion was already cleared externally', () => {
        startSession('s1', snapshot('playing'));
        powerSaveBlockerMock.isStarted.mockReturnValue(false);

        addon.getSessionSnapshot.mockReturnValueOnce(snapshot('paused'));
        service.setPaused('s1', true);

        expect(powerSaveBlockerMock.stop).not.toHaveBeenCalled();
    });
});
