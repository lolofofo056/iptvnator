import { ChannelActions } from 'm3u-state';
import { Channel } from 'shared-interfaces';

export function createM3uChannelPlaybackRequest(channel: Channel) {
    return ChannelActions.setActiveChannel({
        channel,
        startPlayback: true,
    });
}
