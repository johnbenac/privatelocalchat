// The page's own furniture: the toast, the About modal and promo banner, the sidebar, the small popup menu under a button (conversation and message menus),
// and the nudge that points at the endpoint control. Nothing here knows about chats.
// createPageChrome(host) returns the functions below and `openThreadMenu` / `activeModal` as getters.
//
// host: toast, modalBackdrop, aboutModal, aboutCloseBtn, promoBanner, sidebarEl, closeSidebarBtn, threadList, endpointSelect, desktopMediaQuery

import { toastDuration, createPausableTimer } from './toast-timing.mjs';

export function createPageChrome(host) {
  const { toast, modalBackdrop, aboutModal, aboutCloseBtn, promoBanner, sidebarEl, closeSidebarBtn, threadList, endpointSelect, desktopMediaQuery } = host;


  let activeModal = null;

  let activeModalTrigger = null;

  let openThreadMenu = null;

  function placeMenu(menu, anchor) {
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${window.scrollY + rect.bottom + 4}px`;
    menu.style.left = `${window.scrollX + rect.left}px`;
    const menuRect = menu.getBoundingClientRect(); const viewportWidth = document.documentElement.clientWidth;
    if (menuRect.right > viewportWidth) menu.style.left = `${window.scrollX + Math.max(8, viewportWidth - menuRect.width - 8)}px`;
    if (menuRect.bottom > window.innerHeight) menu.style.top = `${window.scrollY + Math.max(8, rect.top - menuRect.height - 4)}px`;
    const outsideHandler = event => { if (menu.contains(event.target) || anchor.contains(event.target)) return; closeThreadMenu(); };
    const keyHandler = event => { if (event.key === 'Escape') { closeThreadMenu(); anchor.focus(); } };
    document.addEventListener('mousedown', outsideHandler); document.addEventListener('keydown', keyHandler);
    openThreadMenu = { menuEl: menu, anchor, outsideHandler, keyHandler };
    menu.querySelector('button')?.focus();
  }

  function openModal(modalEl, { focusEl, triggerEl } = {}) {
    if (!modalEl || !modalBackdrop) {
      return;
    }
    activeModal = modalEl;
    activeModalTrigger = triggerEl || null;
    modalEl.hidden = false;
    modalBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    if (focusEl) {
      focusEl.focus();
    }
  }

  function closeModal({ returnFocus = true } = {}) {
    if (!modalBackdrop || !activeModal) {
      return;
    }
    activeModal.hidden = true;
    modalBackdrop.hidden = true;
    document.body.style.overflow = '';
    if (returnFocus && activeModalTrigger) {
      activeModalTrigger.focus();
    }
    activeModal = null;
    activeModalTrigger = null;
  }

  function openAbout() {
    if (!aboutModal) return;
    openModal(aboutModal, { focusEl: aboutCloseBtn, triggerEl: document.activeElement });
  }

  function closeAbout({ returnFocus = true } = {}) {
    if (!aboutModal) return;
    if (activeModal === aboutModal) {
      closeModal({ returnFocus });
    } else if (!aboutModal.hidden) {
      aboutModal.hidden = true;
    }
  }

  function maybeShowPromo() {
    if (!promoBanner) return;
    const dismissed = sessionStorage.getItem('promoDismissed') === '1';
    promoBanner.hidden = dismissed;
  }

  function initMarketing() {
    maybeShowPromo();
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('about') === '1') {
      openAbout();
    }
  }

  function hideToast() {
    if (!toast) return;
    toast.classList.remove('visible');
    toast.setAttribute('aria-hidden', 'true');
    toastClock.stop();
    window.setTimeout(() => {
      if (!toast.classList.contains('visible')) {
        toast.hidden = true;
      }
    }, 180);
  }

  // The toast stays as long as its message takes to read (chat/core/toast-timing.mjs), is held while a finger or the pointer is on it or the tab is hidden, and a tap
  // on it (after a moment, so a tap that was meant for something under it does not close it) puts it away.
  const toastClock = createPausableTimer();
  let toastShownAt = 0;
  if (toast) {
    const hold = () => toastClock.pause(), release = () => toastClock.resume();
    for (const name of ['pointerenter', 'touchstart', 'focusin']) toast.addEventListener(name, hold, { passive: true });
    for (const name of ['pointerleave', 'touchend', 'touchcancel', 'focusout']) toast.addEventListener(name, release, { passive: true });
    toast.addEventListener('click', event => { if (!event.target.closest?.('.toast-action') && Date.now() - toastShownAt > 800) hideToast(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') toastClock.pause(); else toastClock.resume(); });
  }

  function showToast(message, duration = 3200, action = null) {
    if (!toast) return;
    toastClock.stop();
    toast.textContent = message;
    if (action) {
      const run = document.createElement('button');
      run.type = 'button'; run.className = 'toast-action'; run.textContent = action.label;
      run.addEventListener('click', event => { event.stopPropagation(); hideToast(); action.run(); });
      toast.append(' ', run);
    }
    toast.hidden = false;
    toast.setAttribute('aria-hidden', 'false');
    toast.classList.remove('visible');
    // Force reflow so the animation retriggers when showToast runs rapidly.
    void toast.offsetWidth;
    toast.classList.add('visible');
    toastShownAt = Date.now();
    toastClock.start(toastDuration(message, duration, { hasAction: Boolean(action) }), hideToast);
  }

  /**
   * Ensure the chat history list is always tall enough to keep the "Start new chat"
   * control visible on compact screens. The minimum height is equal to the combined
   * height of the available items up to a maximum of 2.5 list items.
   */
  function updateThreadListMinHeight() {
    if (!threadList) {
      return;
    }
    const items = threadList.querySelectorAll('li');
    if (!items.length) {
      threadList.style.removeProperty('min-height');
      return;
    }

    const itemHeights = Array.from(items, item => {
      const rect = item.getBoundingClientRect();
      const styles = window.getComputedStyle(item);
      const marginTop = parseFloat(styles.marginTop) || 0;
      const marginBottom = parseFloat(styles.marginBottom) || 0;
      return rect.height + marginTop + marginBottom;
    });

    let minHeight = 0;
    if (itemHeights.length === 1) {
      minHeight = itemHeights[0];
    } else if (itemHeights.length === 2) {
      minHeight = itemHeights[0] + itemHeights[1];
    } else {
      minHeight = itemHeights[0] + itemHeights[1] + itemHeights[2] * 0.5;
    }

    threadList.style.minHeight = `${minHeight}px`;
  }

  /**
   * Open the sidebar. Adds a class to the body that triggers the CSS
   * transform and disables page scrolling on mobile.
   */
  function openSidebar(arg) {
    let options = {};
    if (typeof Event !== 'undefined' && arg instanceof Event) {
      arg.preventDefault();
    } else if (arg && typeof arg === 'object') {
      options = arg;
    }
    // controls that now live on the Settings page: open that page instead of the sidebar
    if (options.focusTarget && window.plcShell?.ownsFocusTarget?.(options.focusTarget)) { window.plcShell.openSettings('models', options.focusTarget); return; }
    document.body.classList.add('sidebar-open');
    closeThreadMenu();
    updateSidebarAria();
    const focusTarget = options.focusTarget;
    const skipDefaultFocus = Boolean(options.skipDefaultFocus || focusTarget);
    if (focusTarget && typeof focusTarget.focus === 'function') {
      setTimeout(() => {
        try {
          focusTarget.focus({ preventScroll: true });
        } catch (err) {
          focusTarget.focus();
        }
      }, 0);
    } else if (!skipDefaultFocus && closeSidebarBtn) {
      setTimeout(() => closeSidebarBtn.focus(), 0);
    }
  }

  /**
   * Close the sidebar and optionally restore focus to the hamburger button.
   * @param {object} options options.restoreFocus when true focuses the open button
   */
  function closeSidebar(options = {}) {
    const wasOpen = document.body.classList.contains('sidebar-open');
    if (wasOpen) {
      document.body.classList.remove('sidebar-open');
      if (options.restoreFocus && !desktopMediaQuery.matches) {
        document.querySelector('.show-panel')?.focus({ preventScroll: true });
      }
    }
    updateSidebarAria();
  }

  function updateSidebarAria() {
    if (!sidebarEl) return;
    const hidden = !desktopMediaQuery.matches && !document.body.classList.contains('sidebar-open');
    sidebarEl.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  }

  // Connection settings live on the Settings page (Models). The shell opens it; focusEl is the field to land on.
  function openProviderSettings(focusEl) { window.plcShell?.openSettings('models', focusEl || null); }

  function guideToEndpointSetup() {
    openProviderSettings(endpointSelect);
    if (!endpointSelect) {
      return;
    }
    const highlightClass = 'highlight-pulse';
    const cleanupHighlight = () => endpointSelect.classList.remove(highlightClass);
    endpointSelect.addEventListener('blur', cleanupHighlight, { once: true });
    window.requestAnimationFrame(() => {
      try {
        endpointSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        // Ignore scroll errors.
      }
      endpointSelect.classList.add(highlightClass);
      window.setTimeout(cleanupHighlight, 1800);
      try {
        if (typeof endpointSelect.showPicker === 'function') {
          endpointSelect.showPicker();
        } else {
          endpointSelect.focus({ preventScroll: true });
        }
      } catch (err) {
        try {
          endpointSelect.focus({ preventScroll: true });
        } catch (focusErr) {
          endpointSelect.focus();
        }
      }
    });
  }

  /**
   * Close the thread action menu if open.
   */
  function closeThreadMenu() {
    if (!openThreadMenu) return;
    document.removeEventListener('mousedown', openThreadMenu.outsideHandler);
    document.removeEventListener('keydown', openThreadMenu.keyHandler);
    if (openThreadMenu.menuEl.parentNode) {
      openThreadMenu.menuEl.parentNode.removeChild(openThreadMenu.menuEl);
    }
    openThreadMenu = null;
  }

  return {
    get openThreadMenu() { return openThreadMenu; }, get activeModal() { return activeModal; },
    showToast, hideToast, openModal, closeModal, openAbout, closeAbout, maybeShowPromo, initMarketing, updateThreadListMinHeight, openSidebar, closeSidebar, updateSidebarAria,
    openProviderSettings, guideToEndpointSetup, closeThreadMenu, placeMenu
  };
}
