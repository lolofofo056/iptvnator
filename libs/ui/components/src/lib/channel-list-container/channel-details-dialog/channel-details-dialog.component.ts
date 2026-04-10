import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { getM3uArchiveDays, isM3uCatchupPlaybackSupported } from 'm3u-utils';
import { Channel } from 'shared-interfaces';

interface ChannelDetailField {
    readonly empty?: boolean;
    readonly labelKey: string;
    readonly monospace?: boolean;
    readonly translateParams?: Record<string, number>;
    readonly value?: string;
    readonly valueKey?: string;
    readonly wrap?: boolean;
}

@Component({
    selector: 'app-channel-details-dialog',
    templateUrl: './channel-details-dialog.component.html',
    styleUrls: ['./channel-details-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatButtonModule, MatDialogModule, TranslatePipe],
})
export class ChannelDetailsDialogComponent {
    readonly channel = inject<Channel>(MAT_DIALOG_DATA);

    readonly archiveDays = getM3uArchiveDays(this.channel);
    readonly catchupAvailable = this.archiveDays > 0;
    readonly catchupPlaybackSupported = isM3uCatchupPlaybackSupported(
        this.channel
    );

    readonly summaryFields: ChannelDetailField[] = [
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.NAME',
            this.channel.name
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.CHANNEL_ID',
            this.channel.id,
            {
                monospace: true,
            }
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.STREAM_URL',
            this.channel.url,
            {
                monospace: true,
                wrap: true,
            }
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.GROUP',
            this.channel.group?.title
        ),
        this.createBooleanField(
            'CHANNELS.DETAILS_DIALOG.RADIO',
            this.channel.radio === 'true'
        ),
        this.createBooleanField(
            'CHANNELS.DETAILS_DIALOG.CATCHUP_AVAILABLE',
            this.catchupAvailable
        ),
        this.createArchiveWindowField(),
        this.createBooleanField(
            'CHANNELS.DETAILS_DIALOG.PLAYBACK_SUPPORTED',
            this.catchupPlaybackSupported
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.EPG_PARAMS',
            this.channel.epgParams,
            {
                monospace: true,
                wrap: true,
            }
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.TIMESHIFT',
            this.channel.timeshift
        ),
    ];

    readonly tvgFields: ChannelDetailField[] = [
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.TVG_ID',
            this.channel.tvg?.id,
            {
                monospace: true,
            }
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.TVG_NAME',
            this.channel.tvg?.name
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.TVG_URL',
            this.channel.tvg?.url,
            {
                monospace: true,
                wrap: true,
            }
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.TVG_LOGO',
            this.channel.tvg?.logo,
            {
                monospace: true,
                wrap: true,
            }
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.TVG_REC',
            this.channel.tvg?.rec
        ),
    ];

    readonly catchupFields: ChannelDetailField[] = [
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.CATCHUP_TYPE',
            this.channel.catchup?.type
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.CATCHUP_SOURCE',
            this.channel.catchup?.source,
            {
                monospace: true,
                wrap: true,
            }
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.CATCHUP_DAYS',
            this.channel.catchup?.days
        ),
    ];

    readonly httpFields: ChannelDetailField[] = [
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.HTTP_ORIGIN',
            this.channel.http?.origin,
            {
                monospace: true,
                wrap: true,
            }
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.HTTP_REFERRER',
            this.channel.http?.referrer,
            {
                monospace: true,
                wrap: true,
            }
        ),
        this.createTextField(
            'CHANNELS.DETAILS_DIALOG.HTTP_USER_AGENT',
            this.channel.http?.['user-agent'],
            {
                monospace: true,
                wrap: true,
            }
        ),
    ];

    private createArchiveWindowField(): ChannelDetailField {
        if (!this.catchupAvailable) {
            return {
                empty: true,
                labelKey: 'CHANNELS.DETAILS_DIALOG.WINDOW',
                valueKey: 'CHANNELS.DETAILS_DIALOG.NOT_AVAILABLE',
            };
        }

        return {
            labelKey: 'CHANNELS.DETAILS_DIALOG.WINDOW',
            translateParams: {
                count: this.archiveDays,
            },
            valueKey:
                this.archiveDays === 1
                    ? 'CHANNELS.DETAILS_DIALOG.DAYS_ONE'
                    : 'CHANNELS.DETAILS_DIALOG.DAYS_OTHER',
        };
    }

    private createBooleanField(
        labelKey: string,
        value: boolean
    ): ChannelDetailField {
        return {
            labelKey,
            valueKey: value ? 'YES' : 'NO',
        };
    }

    private createTextField(
        labelKey: string,
        value: string | null | undefined,
        options: Pick<ChannelDetailField, 'monospace' | 'wrap'> = {}
    ): ChannelDetailField {
        const normalized = value?.trim() ?? '';

        if (!normalized) {
            return {
                ...options,
                empty: true,
                labelKey,
                valueKey: 'CHANNELS.DETAILS_DIALOG.EMPTY',
            };
        }

        return {
            ...options,
            labelKey,
            value: normalized,
        };
    }
}
