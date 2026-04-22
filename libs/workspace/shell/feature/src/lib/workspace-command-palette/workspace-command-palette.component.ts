import {
    AfterViewInit,
    Component,
    ElementRef,
    computed,
    effect,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import {
    MAT_DIALOG_DATA,
    MatDialogModule,
    MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import {
    WorkspaceCommandGroup,
    WorkspaceCommandSelection,
    WorkspaceResolvedCommandItem,
} from '@iptvnator/portal/shared/util';

interface WorkspaceCommandPaletteData {
    commands: WorkspaceResolvedCommandItem[];
    query?: string;
}

interface WorkspaceCommandGroupSection {
    group: WorkspaceCommandGroup;
    items: WorkspaceResolvedCommandItem[];
}

@Component({
    selector: 'app-workspace-command-palette',
    imports: [MatDialogModule, MatIconModule, TranslatePipe],
    templateUrl: './workspace-command-palette.component.html',
    styleUrl: './workspace-command-palette.component.scss',
})
export class WorkspaceCommandPaletteComponent implements AfterViewInit {
    private readonly dialogRef = inject(
        MatDialogRef<
            WorkspaceCommandPaletteComponent,
            WorkspaceCommandSelection | undefined
        >
    );
    private readonly data =
        inject<WorkspaceCommandPaletteData>(MAT_DIALOG_DATA);

    private readonly queryInputRef =
        viewChild<ElementRef<HTMLInputElement>>('queryInput');

    readonly query = signal(this.data?.query ?? '');
    readonly selectedIndex = signal(0);

    readonly visibleCommands = computed(() =>
        this.data.commands.filter((command) => command.visible)
    );

    readonly filteredCommands = computed(() => {
        const term = this.query().trim().toLowerCase();
        const commands = this.visibleCommands();

        if (!term) {
            return commands;
        }

        return commands.filter((command) => {
            const haystack = [
                command.label,
                command.description,
                ...(command.keywords ?? []),
            ]
                .join(' ')
                .toLowerCase();

            return haystack.includes(term);
        });
    });

    readonly commandGroups = computed<WorkspaceCommandGroupSection[]>(() => {
        const commands = this.filteredCommands();
        const sections: WorkspaceCommandGroupSection[] = [];

        const buildSection = (
            group: WorkspaceCommandGroup
        ): WorkspaceCommandGroupSection | null => {
            const items = commands.filter((command) => command.group === group);

            if (items.length === 0) {
                return null;
            }

            return { group, items };
        };

        const groups = [
            buildSection('view'),
            buildSection('playlist'),
            buildSection('global'),
        ].filter(
            (group): group is WorkspaceCommandGroupSection => group !== null
        );

        sections.push(...groups);
        return sections;
    });

    readonly flatCommands = computed(() =>
        this.commandGroups().reduce<WorkspaceResolvedCommandItem[]>(
            (items, group) => items.concat(group.items),
            []
        )
    );

    readonly selectableIndices = computed(() =>
        this.flatCommands()
            .map((command, index) => (command.enabled ? index : -1))
            .filter((index) => index >= 0)
    );

    constructor() {
        effect(() => {
            const items = this.flatCommands();
            if (items.length === 0) {
                this.selectedIndex.set(-1);
                return;
            }

            const selectableIndices = this.selectableIndices();
            if (selectableIndices.length === 0) {
                this.selectedIndex.set(-1);
                return;
            }

            const currentIndex = this.selectedIndex();
            if (!selectableIndices.includes(currentIndex)) {
                this.selectedIndex.set(selectableIndices[0]);
            }
        });
    }

    ngAfterViewInit(): void {
        queueMicrotask(() => {
            this.queryInputRef()?.nativeElement.focus();
            this.queryInputRef()?.nativeElement.select();
        });
    }

    onQueryInput(event: Event): void {
        const target = event.target as HTMLInputElement | null;
        this.query.set(target?.value ?? '');
    }

    onInputKeydown(event: KeyboardEvent): void {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.moveSelection(1);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.moveSelection(-1);
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            this.selectCurrent();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            this.dialogRef.close();
        }
    }

    onCommandHover(command: WorkspaceResolvedCommandItem): void {
        if (!command.enabled) {
            return;
        }

        const index = this.flatCommands().findIndex(
            (item) => item.id === command.id
        );
        if (index >= 0) {
            this.selectedIndex.set(index);
        }
    }

    onCommandClick(command: WorkspaceResolvedCommandItem): void {
        if (!command.enabled) {
            return;
        }

        this.dialogRef.close({
            commandId: command.id,
            query: this.query().trim(),
        });
    }

    isCommandSelected(command: WorkspaceResolvedCommandItem): boolean {
        const index = this.flatCommands().findIndex(
            (item) => item.id === command.id
        );
        return index >= 0 && this.selectedIndex() === index;
    }

    getGroupTitleKey(group: WorkspaceCommandGroup): string {
        if (group === 'view') {
            return 'WORKSPACE.COMMAND_PALETTE.GROUP_VIEW';
        }
        if (group === 'playlist') {
            return 'WORKSPACE.COMMAND_PALETTE.GROUP_PLAYLIST';
        }
        return 'WORKSPACE.COMMAND_PALETTE.GROUP_GLOBAL';
    }

    private moveSelection(direction: 1 | -1): void {
        const selectableIndices = this.selectableIndices();
        if (selectableIndices.length === 0) {
            return;
        }

        const currentPosition = selectableIndices.indexOf(this.selectedIndex());
        const nextPosition =
            currentPosition === -1
                ? direction === 1
                    ? 0
                    : selectableIndices.length - 1
                : (currentPosition + direction + selectableIndices.length) %
                  selectableIndices.length;

        this.selectedIndex.set(selectableIndices[nextPosition]);
    }

    private selectCurrent(): void {
        const items = this.flatCommands();
        if (items.length === 0) {
            return;
        }

        const index = this.selectedIndex();
        if (index < 0 || index >= items.length) {
            return;
        }

        this.onCommandClick(items[index]);
    }
}
