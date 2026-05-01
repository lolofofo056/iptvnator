import { Component, input, ViewEncapsulation } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-settings-about-section',
    imports: [MatIconModule, TranslateModule],
    templateUrl: './settings-about-section.component.html',
    encapsulation: ViewEncapsulation.None,
    styles: [':host { display: contents; }'],
})
export class SettingsAboutSectionComponent {
    readonly activeSection = input.required<string>();
    readonly isDesktop = input(false);
    readonly version = input<string | undefined>();
    readonly updateMessage = input<string | undefined>();
}
