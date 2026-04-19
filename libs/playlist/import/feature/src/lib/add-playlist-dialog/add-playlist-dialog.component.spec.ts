import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { PlaylistActions } from 'm3u-state';
import { DataService } from 'services';
import { PLAYLIST_PARSE_BY_URL } from 'shared-interfaces';
import { AddPlaylistDialogComponent } from './add-playlist-dialog.component';

describe('AddPlaylistDialogComponent', () => {
    let component: AddPlaylistDialogComponent;
    let dataService: { sendIpcEvent: jest.Mock };
    let dialogRef: { close: jest.Mock };
    let store: { dispatch: jest.Mock };

    beforeEach(() => {
        dataService = {
            sendIpcEvent: jest.fn(),
        };
        dialogRef = {
            close: jest.fn(),
        };
        store = {
            dispatch: jest.fn(),
        };

        TestBed.configureTestingModule({
            providers: [
                {
                    provide: DataService,
                    useValue: dataService,
                },
                {
                    provide: MatDialogRef,
                    useValue: dialogRef,
                },
                {
                    provide: Store,
                    useValue: store,
                },
                {
                    provide: MatSnackBar,
                    useValue: {
                        open: jest.fn(),
                    },
                },
                {
                    provide: TranslateService,
                    useValue: {
                        instant: jest.fn((value: string) => value),
                    },
                },
                {
                    provide: MAT_DIALOG_DATA,
                    useValue: null,
                },
            ],
        });

        component = TestBed.runInInjectionContext(
            () => new AddPlaylistDialogComponent()
        );
    });

    it('sends a trimmed custom title for URL playlists', () => {
        (component as { urlUpload: jest.Mock }).urlUpload = jest.fn(() => ({
            form: {
                getRawValue: () => ({
                    playlistName: '  My Playlist  ',
                    playlistUrl: ' https://example.com/list.m3u ',
                }),
            },
        }));

        component.submitUrlPlaylist();

        expect(dataService.sendIpcEvent).toHaveBeenCalledWith(
            PLAYLIST_PARSE_BY_URL,
            {
                title: 'My Playlist',
                url: 'https://example.com/list.m3u',
            }
        );
        expect(dialogRef.close).toHaveBeenCalled();
    });

    it('omits the title when the optional name is blank', () => {
        (component as { urlUpload: jest.Mock }).urlUpload = jest.fn(() => ({
            form: {
                getRawValue: () => ({
                    playlistName: '   ',
                    playlistUrl: 'https://example.com/list.m3u',
                }),
            },
        }));

        component.submitUrlPlaylist();

        expect(dataService.sendIpcEvent).toHaveBeenCalledWith(
            PLAYLIST_PARSE_BY_URL,
            {
                url: 'https://example.com/list.m3u',
            }
        );
        expect(dialogRef.close).toHaveBeenCalled();
    });

    it('strips playlist extensions from uploaded file titles', () => {
        component.handlePlaylist({
            uploadEvent: {
                target: {
                    result: '#EXTM3U',
                },
            } as unknown as Event,
            file: {
                name: 'Local Source.m3u',
                path: '/tmp/Local Source.m3u',
            } as File,
        });

        expect(store.dispatch).toHaveBeenCalledWith(
            PlaylistActions.parsePlaylist({
                uploadType: 'FILE',
                playlist: '#EXTM3U',
                title: 'Local Source',
                path: '/tmp/Local Source.m3u',
            })
        );
        expect(dialogRef.close).toHaveBeenCalled();
    });
});
