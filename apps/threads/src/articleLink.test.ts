import { describe, expect, it } from 'vitest';
import { articleLink, parseArticleLink } from './articleLink';

describe('articleLink', () => {
  it('shares the app path and explicit AID, without unrelated query or fragment', () => {
    const link = articleLink({ board: 'Gossiping', aid: '#FAKEGOSSIP' }, 'https://example.com/threads/?token=secret#old', false);
    expect(link).toBe('https://example.com/threads/?board=Gossiping&aid=FAKEGOSSIP');
    expect(parseArticleLink(link!)).toEqual({ board: 'Gossiping', aid: 'FAKEGOSSIP' });
  });

  it('does not publish a mutable index as a persistent share link', () => {
    expect(articleLink({ board: 'Test_1-2', index: 123 }, 'http://localhost:5182/?preview=home', true)).toBeUndefined();
    expect(parseArticleLink('http://localhost:5182/?board=Test_1-2&index=123')).toEqual({ board: 'Test_1-2', index: 123 });
  });

  it('retains preview mode with a stable aid', () => {
    expect(articleLink({ board: 'Test', aid: 'Ab_12-xy' }, 'http://localhost:5182/', true)).toBe('http://localhost:5182/?board=Test&aid=Ab_12-xy&preview=1');
  });

  it('rejects malformed ids instead of publishing unusable links', () => {
    expect(articleLink({ board: 'Test', aid: '##abc' }, 'https://example.com', false)).toBeUndefined();
  });
});

describe('parseArticleLink', () => {
  it('accepts a hash-prefixed AID and strips the prefix', () => {
    expect(parseArticleLink('https://example.com/?board=Gossiping&aid=%23Ab_12-xy')).toEqual({ board: 'Gossiping', aid: 'Ab_12-xy' });
  });

  it.each([
    'not a URL',
    'https://example.com/',
    'https://example.com/?board=Gossiping',
    'https://example.com/?aid=ABC',
    ...['', 'bad board', '../Gossiping', '中文', 'a'.repeat(65)].map(board => `https://example.com/?board=${encodeURIComponent(board)}&index=1`),
    ...['', '#', '##abc', 'bad aid', 'a'.repeat(33)].map(aid => `https://example.com/?board=Gossiping&aid=${encodeURIComponent(aid)}`),
    ...['0', '-1', '01', '1.0', '1e2', '+1', 'NaN', '9007199254740992', ''].map(index => `https://example.com/?board=Gossiping&index=${encodeURIComponent(index)}`),
    'https://example.com/?board=Gossiping&aid=ABC&index=1',
    'https://example.com/?board=Gossiping&aid=ABC&index=',
    'https://example.com/?board=Gossiping&board=Test&aid=ABC',
    'https://example.com/?board=Gossiping&aid=ABC&aid=DEF',
    'https://example.com/?board=Gossiping&index=1&index=2',
  ])('ignores invalid or ambiguous links: %s', href => {
    expect(parseArticleLink(href)).toBeUndefined();
  });

  it('accepts maximum valid lengths and the largest safe index', () => {
    expect(parseArticleLink(`https://example.com/?board=${'a'.repeat(64)}&aid=${'b'.repeat(32)}`)).toEqual({ board: 'a'.repeat(64), aid: 'b'.repeat(32) });
    expect(parseArticleLink('https://example.com/?board=Test&index=9007199254740991')).toEqual({ board: 'Test', index: Number.MAX_SAFE_INTEGER });
  });
});
