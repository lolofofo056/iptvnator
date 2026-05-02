import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { startWith } from 'rxjs';
import { XtreamStore } from '@iptvnator/portal/xtream/data-access';
import { XtreamImportPhaseTone } from './helpers/workspace-shell-constants';
import {
    buildXtreamImportDetailLabel,
    buildXtreamImportPhaseLabel,
    buildXtreamImportPhaseTone,
    buildXtreamImportProgressLabel,
    buildXtreamImportSourceLabel,
    buildXtreamImportTypeLabel,
    formatLocalizedNumber,
} from './helpers/workspace-shell-import-labels';

@Injectable()
export class WorkspaceShellXtreamImportService {
    private readonly xtreamStore = inject(XtreamStore);
    private readonly translate = inject(TranslateService);
    private readonly isElectron = !!window.electron;

    private readonly languageTick = toSignal(
        this.translate.onLangChange.pipe(startWith(null)),
        { initialValue: null }
    );

    private readonly translateText = (
        key: string,
        params?: Record<string, string | number>
    ): string => this.translate.instant(key, params);

    readonly xtreamImportCount = this.xtreamStore.getImportCount;
    readonly xtreamItemsToImport = this.xtreamStore.itemsToImport;
    readonly xtreamActiveImportCount =
        this.xtreamStore.activeImportCurrentCount;
    readonly xtreamActiveItemsToImport =
        this.xtreamStore.activeImportTotalCount;
    readonly xtreamImportPhase = this.xtreamStore.currentImportPhase;
    readonly isCancellingXtreamImport = this.xtreamStore.isCancellingImport;

    readonly canCancelXtreamImport = computed(
        () =>
            this.isElectron &&
            this.xtreamStore.isImporting() &&
            Boolean(this.xtreamStore.activeImportSessionId()) &&
            !this.xtreamStore.isCancellingImport()
    );

    readonly xtreamImportTitleLabel = computed(() =>
        this.translateText('WORKSPACE.SHELL.XTREAM_IMPORT_TITLE')
    );

    readonly xtreamImportTypeLabel = computed(() => {
        this.languageTick();
        return buildXtreamImportTypeLabel(
            this.xtreamStore.activeImportContentType(),
            this.translateText
        );
    });

    readonly xtreamImportProgressLabel = computed(() =>
        buildXtreamImportProgressLabel(
            this.xtreamImportTypeLabel(),
            this.xtreamActiveImportCount(),
            this.xtreamActiveItemsToImport(),
            this.translateText,
            (value) =>
                formatLocalizedNumber(
                    value,
                    this.translate.currentLang,
                    this.translate.defaultLang
                )
        )
    );

    readonly xtreamImportPhaseTone = computed<XtreamImportPhaseTone>(() =>
        buildXtreamImportPhaseTone(this.xtreamStore.currentImportPhase())
    );

    readonly xtreamImportSourceLabel = computed(() => {
        this.languageTick();
        return buildXtreamImportSourceLabel(
            this.xtreamImportPhaseTone(),
            this.translateText
        );
    });

    readonly xtreamImportPhaseLabel = computed(() => {
        this.languageTick();
        return buildXtreamImportPhaseLabel(
            this.xtreamStore.currentImportPhase(),
            this.translateText
        );
    });

    readonly xtreamImportDetailLabel = computed(() => {
        this.languageTick();
        return buildXtreamImportDetailLabel(
            this.xtreamImportPhaseTone(),
            this.translateText
        );
    });

    readonly isImportRunning = computed(
        () =>
            !this.xtreamStore.contentInitBlockReason() &&
            this.xtreamStore.isImporting()
    );

    cancelXtreamImport(): void {
        void this.xtreamStore.cancelImport();
    }
}
