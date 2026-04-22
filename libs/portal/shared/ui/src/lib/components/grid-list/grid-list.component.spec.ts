import {
    formatGridRating,
    resolveGridRating,
} from './grid-list.component';

describe('grid list rating helpers', () => {
    it('rounds numeric ratings to a single decimal place', () => {
        expect(formatGridRating(7.243)).toBe('7.2');
        expect(formatGridRating('6.529')).toBe('6.5');
        expect(formatGridRating('6')).toBe('6.0');
    });

    it('prefers imdb ratings before generic ratings when both are present', () => {
        expect(
            resolveGridRating({
                rating: '6.529',
                rating_imdb: '7.243',
            })
        ).toBe('7.2');
    });

    it('falls back to the generic rating when imdb rating is blank', () => {
        expect(
            resolveGridRating({
                rating: '5.67',
                rating_imdb: '  ',
            })
        ).toBe('5.7');
    });
});
