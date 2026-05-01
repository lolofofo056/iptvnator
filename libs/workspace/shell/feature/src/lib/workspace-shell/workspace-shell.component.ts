import {
    Component,
    inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ExternalPlaybackDockComponent } from 'components';
import {
    PlaylistDropOverlayComponent,
    PlaylistDropZoneDirective,
} from '../playlist-drop-overlay';
import { WorkspaceShellContextSidebarComponent } from './components/workspace-shell-context-sidebar/workspace-shell-context-sidebar.component';
import { WorkspaceShellHeaderComponent } from './components/workspace-shell-header/workspace-shell-header.component';
import { WorkspaceShellRailComponent } from './components/workspace-shell-rail/workspace-shell-rail.component';
import { WorkspaceShellFacade } from './services/workspace-shell.facade';
import { WorkspaceShellXtreamImportService } from './services/workspace-shell-xtream-import.service';
import { WorkspaceShellCommandPaletteService } from './services/workspace-shell-command-palette.service';

@Component({
    selector: 'app-workspace-shell',
    imports: [
        ExternalPlaybackDockComponent,
        MatButtonModule,
        MatProgressBarModule,
        PlaylistDropOverlayComponent,
        PlaylistDropZoneDirective,
        RouterOutlet,
        TranslatePipe,
        WorkspaceShellContextSidebarComponent,
        WorkspaceShellHeaderComponent,
        WorkspaceShellRailComponent,
    ],
    templateUrl: './workspace-shell.component.html',
    styleUrl: './workspace-shell.component.scss',
    providers: [
        WorkspaceShellFacade,
        WorkspaceShellXtreamImportService,
        WorkspaceShellCommandPaletteService,
    ],
})
export class WorkspaceShellComponent {
    readonly facade = inject(WorkspaceShellFacade);
}
