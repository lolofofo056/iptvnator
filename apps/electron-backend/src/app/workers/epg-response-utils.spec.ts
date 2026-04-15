import { shouldGunzipEpgResponse } from './epg-response-utils';

describe('shouldGunzipEpgResponse', () => {
    it('returns true for original .gz URLs', () => {
        expect(
            shouldGunzipEpgResponse('https://example.com/guide.xml.gz', {
                headers: new Headers(),
                url: 'https://example.com/guide.xml.gz',
            })
        ).toBe(true);
    });

    it('returns true when a redirect lands on a .gz URL', () => {
        expect(
            shouldGunzipEpgResponse('http://epg.vcboy.com', {
                headers: new Headers(),
                url: 'http://iptv-worker.sapireli.workers.dev/epg.xml.gz',
            })
        ).toBe(true);
    });

    it('returns true for gzip content-encoding even without a .gz path', () => {
        expect(
            shouldGunzipEpgResponse('https://example.com/guide', {
                headers: new Headers([['content-encoding', 'gzip']]),
                url: 'https://example.com/guide',
            })
        ).toBe(true);
    });

    it('returns false for plain XML responses', () => {
        expect(
            shouldGunzipEpgResponse('https://example.com/guide.xml', {
                headers: new Headers([['content-type', 'application/xml']]),
                url: 'https://example.com/guide.xml',
            })
        ).toBe(false);
    });
});
