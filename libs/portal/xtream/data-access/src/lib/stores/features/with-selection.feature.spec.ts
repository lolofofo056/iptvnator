import { TestBed } from '@angular/core/testing';
import { signalStore, withState } from '@ngrx/signals';
import { withSelection } from './with-selection.feature';

const TestSelectionStore = signalStore(
    withState({
        contentLoadStateByType: {
            live: 'ready',
            vod: 'ready',
            series: 'ready',
        },
        liveCategories: [],
        liveStreams: [],
        vodCategories: [
            {
                id: 10,
                category_id: '10',
                category_name: 'Movies',
                type: 'vod',
            },
        ],
        vodStreams: [
            {
                xtream_id: 1,
                category_id: '10',
                title: 'First',
                added: '4',
            },
            {
                xtream_id: 2,
                category_id: '10',
                title: 'Second',
                added: '3',
            },
            {
                xtream_id: 3,
                category_id: '10',
                title: 'Third',
                added: '2',
            },
            {
                xtream_id: 4,
                category_id: '10',
                title: 'Fourth',
                added: '1',
            },
        ],
        serialCategories: [],
        serialStreams: [],
    }),
    withSelection()
);

describe('withSelection', () => {
    let store: InstanceType<typeof TestSelectionStore>;

    beforeEach(() => {
        localStorage.clear();

        TestBed.configureTestingModule({
            providers: [TestSelectionStore],
        });

        store = TestBed.inject(TestSelectionStore);
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('keeps the current page when the category search term is unchanged', () => {
        store.setSelectedContentType('vod');
        store.setSelectedCategory(10);
        store.setLimit(2);
        store.setPage(1);

        store.setCategorySearchTerm('');

        expect(store.page()).toBe(1);
        expect(store.getPaginatedContent().map((item) => item.title)).toEqual([
            'Third',
            'Fourth',
        ]);
    });

    it('resets the current page when the category search term changes', () => {
        store.setSelectedContentType('vod');
        store.setSelectedCategory(10);
        store.setLimit(2);
        store.setPage(1);

        store.setCategorySearchTerm('first');

        expect(store.page()).toBe(0);
        expect(store.getPaginatedContent().map((item) => item.title)).toEqual([
            'First',
        ]);
    });
});
