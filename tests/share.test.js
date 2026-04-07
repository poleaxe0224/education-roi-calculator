/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub i18n before importing module under test
vi.mock('../src/i18n/i18n.js', () => ({
  t: (key) => key,
}));

const { renderShareMenu, initShareHandlers } = await import(
  '../src/utils/export-pdf.js'
);

describe('renderShareMenu', () => {
  it('renders native share button when navigator.share exists', () => {
    navigator.share = vi.fn();
    const html = renderShareMenu('msg1');
    expect(html).toContain('data-share="native"');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('data-share="instagram"');
    delete navigator.share;
  });

  it('renders dropdown without Instagram when navigator.share is absent', () => {
    delete navigator.share;
    const html = renderShareMenu('msg2');
    expect(html).toContain('<details');
    expect(html).toContain('data-share="facebook"');
    expect(html).toContain('data-share="line"');
    expect(html).toContain('data-share="copy"');
    expect(html).not.toContain('data-share="native"');
    expect(html).not.toContain('data-share="instagram"');
  });

  it('includes the message element with provided id', () => {
    delete navigator.share;
    const html = renderShareMenu('my-msg');
    expect(html).toContain('id="my-msg"');
  });
});

describe('initShareHandlers', () => {
  let container;
  let msgEl;
  const getHashRoute = () => '#/calculator?soc=15-1252';

  beforeEach(() => {
    container = document.createElement('div');
    msgEl = document.createElement('div');
    // Reset navigator.share
    delete navigator.share;
  });

  describe('native share', () => {
    it('calls navigator.share with title and url', async () => {
      const shareFn = vi.fn().mockResolvedValue(undefined);
      navigator.share = shareFn;

      container.innerHTML = '<button data-share="native">Share</button>';
      initShareHandlers(container, getHashRoute, msgEl);

      container.querySelector('[data-share="native"]').click();
      await vi.waitFor(() => expect(shareFn).toHaveBeenCalledTimes(1));

      const arg = shareFn.mock.calls[0][0];
      expect(arg).toHaveProperty('url');
      expect(arg.url).toContain('#/calculator?soc=15-1252');
      expect(arg).toHaveProperty('title');

      delete navigator.share;
    });

    it('silently ignores AbortError (user cancelled)', async () => {
      const abort = new DOMException('cancelled', 'AbortError');
      navigator.share = vi.fn().mockRejectedValue(abort);

      container.innerHTML = '<button data-share="native">Share</button>';
      initShareHandlers(container, getHashRoute, msgEl);

      container.querySelector('[data-share="native"]').click();
      // Should NOT show error message
      await vi.waitFor(() =>
        expect(navigator.share).toHaveBeenCalledTimes(1)
      );
      expect(msgEl.textContent).toBe('');

      delete navigator.share;
    });

    it('shows error on non-AbortError failure', async () => {
      navigator.share = vi.fn().mockRejectedValue(new Error('fail'));

      container.innerHTML = '<button data-share="native">Share</button>';
      initShareHandlers(container, getHashRoute, msgEl);

      container.querySelector('[data-share="native"]').click();
      await vi.waitFor(() =>
        expect(msgEl.textContent).toBe('share.copy_fail')
      );

      delete navigator.share;
    });

    it('does not attach dropdown handlers when native button exists', () => {
      navigator.share = vi.fn().mockResolvedValue(undefined);
      container.innerHTML = `
        <button data-share="native">Share</button>
        <a href="#" data-share="copy">Copy</a>
      `;
      const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
      initShareHandlers(container, getHashRoute, msgEl);

      // Click the copy link — should have no handler (initShareHandlers returned early)
      container.querySelector('[data-share="copy"]').click();
      expect(spy).not.toHaveBeenCalled();

      spy.mockRestore();
      delete navigator.share;
    });
  });

  describe('desktop dropdown fallback', () => {
    it('opens facebook sharer on facebook click', () => {
      const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
      container.innerHTML = '<a href="#" data-share="facebook">FB</a>';
      initShareHandlers(container, getHashRoute, msgEl);

      container.querySelector('[data-share="facebook"]').click();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toContain('facebook.com/sharer');

      spy.mockRestore();
    });

    it('copies link on copy click', async () => {
      const writeFn = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeFn },
      });

      container.innerHTML = '<a href="#" data-share="copy">Copy</a>';
      initShareHandlers(container, getHashRoute, msgEl);

      container.querySelector('[data-share="copy"]').click();
      await vi.waitFor(() => expect(writeFn).toHaveBeenCalledTimes(1));
      expect(writeFn.mock.calls[0][0]).toContain('#/calculator?soc=15-1252');
      expect(msgEl.textContent).toBe('share.copied');
    });

    it('closes dropdown after action', () => {
      const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
      container.innerHTML = `
        <details class="dropdown share-dropdown" open>
          <summary>Share</summary>
          <ul><li><a href="#" data-share="twitter">X</a></li></ul>
        </details>
      `;
      initShareHandlers(container, getHashRoute, msgEl);

      container.querySelector('[data-share="twitter"]').click();
      expect(container.querySelector('.share-dropdown').open).toBe(false);

      spy.mockRestore();
    });
  });
});
