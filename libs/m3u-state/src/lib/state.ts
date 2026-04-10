import { Channel } from 'shared-interfaces';
import { initialPlaylistMetaState, PlaylistMetaState } from './playlists.state';

import { EpgProgram } from 'shared-interfaces';

export interface PlaylistState {
    active: Channel | undefined;
    activePlaybackUrl: string | null;
    currentEpgProgram: EpgProgram | undefined;
    epgAvailable: boolean;
    channels: Channel[]; // TODO: use entity store
    playlists: PlaylistMetaState;
}

export const initialState: PlaylistState = {
    active: undefined,
    activePlaybackUrl: null,
    currentEpgProgram: undefined,
    epgAvailable: false,
    channels: [],
    playlists: initialPlaylistMetaState,
};
