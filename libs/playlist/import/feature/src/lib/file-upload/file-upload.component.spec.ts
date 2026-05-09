import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlaylistFileImportService } from '@iptvnator/playlist/shared/util';
import { FileUploadComponent } from './file-upload.component';

describe('FileUploadComponent', () => {
    let fixture: ComponentFixture<FileUploadComponent>;
    let component: FileUploadComponent;
    let importService: {
        canImportFromNativeDialog: jest.Mock;
        importFile: jest.Mock;
        importFromNativeDialog: jest.Mock;
        isSupportedFile: jest.Mock;
    };

    beforeEach(async () => {
        importService = {
            canImportFromNativeDialog: jest.fn().mockReturnValue(false),
            importFile: jest.fn(),
            importFromNativeDialog: jest.fn(),
            isSupportedFile: jest.fn().mockReturnValue(true),
        };

        await TestBed.configureTestingModule({
            imports: [FileUploadComponent, TranslateModule.forRoot()],
            providers: [
                {
                    provide: PlaylistFileImportService,
                    useValue: importService,
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(FileUploadComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('uses the native Electron picker when it is available', async () => {
        const imported = jest.fn();
        const hiddenInput = {
            value: 'previous',
            click: jest.fn(),
        } as unknown as HTMLInputElement;
        importService.canImportFromNativeDialog.mockReturnValue(true);
        importService.importFromNativeDialog.mockResolvedValue({
            ok: true,
            title: 'Local Source',
        });
        component.imported.subscribe(imported);

        await component.openPicker(hiddenInput);

        expect(hiddenInput.click).not.toHaveBeenCalled();
        expect(importService.importFromNativeDialog).toHaveBeenCalledTimes(1);
        expect(imported).toHaveBeenCalledWith({ title: 'Local Source' });
    });

    it('falls back to the hidden file input outside Electron', async () => {
        const hiddenInput = {
            value: 'previous',
            click: jest.fn(),
        } as unknown as HTMLInputElement;

        await component.openPicker(hiddenInput);

        expect(hiddenInput.value).toBe('');
        expect(hiddenInput.click).toHaveBeenCalledTimes(1);
        expect(importService.importFromNativeDialog).not.toHaveBeenCalled();
    });
});
