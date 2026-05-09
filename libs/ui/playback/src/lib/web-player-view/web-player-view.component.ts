import {
    Component,
    EventEmitter,
    Output,
    Signal,
    ViewEncapsulation,
    computed,
    effect,
    inject,
    input,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { StorageMap } from '@ngx-pwa/local-storage';
import { getExtensionFromUrl } from 'm3u-utils';
import {
    ResolvedPortalPlayback,
    Settings,
    STORE_KEY,
    VideoPlayer,
} from 'shared-interfaces';
import { ArtPlayerComponent } from '../art-player/art-player.component';
import { EmbeddedMpvPlayerComponent } from '../embedded-mpv-player/embedded-mpv-player.component';
import { HtmlVideoPlayerComponent } from '../html-video-player/html-video-player.component';
import { VjsPlayerComponent } from '../vjs-player/vjs-player.component';

@Component({
    selector: 'app-web-player-view',
    templateUrl: './web-player-view.component.html',
    styleUrls: ['./web-player-view.component.scss'],
    imports: [
        ArtPlayerComponent,
        EmbeddedMpvPlayerComponent,
        HtmlVideoPlayerComponent,
        VjsPlayerComponent,
    ],
    encapsulation: ViewEncapsulation.None,
})
export class WebPlayerViewComponent {
    storage = inject(StorageMap);

    streamUrl = input.required<string>();
    title = input('');
    playback = input<ResolvedPortalPlayback | null>(null);
    startTime = input<number>(0);
    @Output() timeUpdate = new EventEmitter<{
        currentTime: number;
        duration: number;
    }>();

    settings = toSignal(
        this.storage.get(STORE_KEY.Settings)
    ) as Signal<Settings>;

    channel!: { url: string };
    player!: VideoPlayer;
    vjsOptions!: { sources: { src: string; type: string }[] };
    readonly resolvedPlayback = computed<ResolvedPortalPlayback>(() => {
        const playback = this.playback();
        if (playback) {
            return playback;
        }

        return {
            streamUrl: this.streamUrl(),
            title: this.title() || this.streamUrl(),
            startTime: this.startTime(),
        };
    });

    constructor() {
        effect(() => {
            this.player = this.settings()?.player ?? VideoPlayer.VideoJs;

            const playback = this.resolvedPlayback();
            this.setChannel(playback.streamUrl);
            this.setVjsOptions(playback.streamUrl);
        });
    }

    setVjsOptions(streamUrl: string) {
        const extension = getExtensionFromUrl(streamUrl);
        const mimeType =
            extension === 'm3u' || extension === 'm3u8'
                ? 'application/x-mpegURL'
                : extension === 'ts'
                  ? 'video/mp2t'
                  : 'video/mp4';

        this.vjsOptions = {
            sources: [{ src: streamUrl, type: mimeType }],
        };
    }

    setChannel(streamUrl: string) {
        this.channel = {
            url: streamUrl,
        };
    }
}
