import { FormControl, Validators } from '@angular/forms';

export const EPG_URL_PATTERN = /^(http|https|file):\/\/[^ "]+$/;

export function createEpgUrlControl(value = ''): FormControl<string | null> {
    return new FormControl(value, [Validators.pattern(EPG_URL_PATTERN)]);
}
