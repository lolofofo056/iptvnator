import { CommonModule } from '@angular/common';
import { Component, input, ViewEncapsulation } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule } from '@ngx-translate/core';
import { StreamFormat, VideoPlayer } from 'shared-interfaces';
import { SettingsPlayerOption } from './settings.models';

@Component({
    selector: 'app-settings-playback-section',
    imports: [
        CommonModule,
        MatCheckboxModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatSelectModule,
        ReactiveFormsModule,
        TranslateModule,
    ],
    templateUrl: './settings-playback-section.component.html',
    encapsulation: ViewEncapsulation.None,
    styles: [':host { display: contents; }'],
})
export class SettingsPlaybackSectionComponent {
    readonly form = input.required<FormGroup>();
    readonly activeSection = input.required<string>();
    readonly players = input.required<SettingsPlayerOption[]>();
    readonly streamFormatEnum = input.required<typeof StreamFormat>();
    readonly isDesktop = input(false);

    isExternalPlayerSelected(): boolean {
        const player = this.form().value.player;
        return player === VideoPlayer.MPV || player === VideoPlayer.VLC;
    }
}
