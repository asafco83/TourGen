/**
 * Product Tour Generator - Runtime Player
 * Vanilla JS, framework-agnostic tour player
 */

(function (global) {
    'use strict';

    // Avoid double initialization
    if (global.PTGRuntime) return;

    /**
     * Runtime state
     */
    const state = {
        tour: null,
        currentStep: 0,
        isPlaying: false,
        options: {},
        elements: {
            container: null,
            overlay: null,
            tooltip: null,
            missingModal: null
        },
        listeners: [],
        urlWatcher: null
    };

    /**
     * Default options
     */
    const defaults = {
        debug: false,
        themeOverrides: {},
        onStart: null,
        onEnd: null,
        onStepChange: null,
        onError: null,
        actionHandlers: {} // Custom action handlers
    };

    /**
     * CSS styles for runtime (injected into shadow root)
     */
    const styles = `
    :host {
      all: initial;
      font-family: var(--ptg-font-family, system-ui, -apple-system, sans-serif);
    }
    
    *, *::before, *::after {
      box-sizing: border-box;
    }
    
    .ptg-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 2147483640;
    }
    
    /* Using 4-blocker system for reliable interaction blocking */
    .ptg-blocker {
      position: fixed;
      z-index: 2147483645;
      background: transparent;
      pointer-events: auto;
    }
    
    .ptg-cutout {
      position: absolute;
      background: transparent;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, var(--ptg-overlay-opacity, 0.7));
      border-radius: var(--ptg-highlight-radius, 4px);
      border: 2px solid var(--ptg-highlight-color, #4f46e5);
      pointer-events: none;
      transition: all 0.3s ease;
    }
    
    .ptg-tooltip {
      position: absolute;
      max-width: 320px;
      min-width: 240px;
      background: var(--ptg-tooltip-bg, #1a1a2e);
      color: var(--ptg-tooltip-text, #ffffff);
      border-radius: var(--ptg-tooltip-radius, 8px);
      box-shadow: var(--ptg-tooltip-shadow, 0 4px 20px rgba(0, 0, 0, 0.3));
      z-index: 2147483646;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    
    .ptg-tooltip.visible {
      opacity: 1;
    }
    
    .ptg-tooltip.animate-fade {
      transform: translateY(0);
    }
    
    .ptg-tooltip.animate-slide {
      transform: translateY(0);
    }
    
    .ptg-tooltip:not(.visible).animate-fade {
      opacity: 0;
    }
    
    .ptg-tooltip:not(.visible).animate-slide[data-placement="top"] {
      transform: translateY(10px);
    }
    
    .ptg-tooltip:not(.visible).animate-slide[data-placement="bottom"] {
      transform: translateY(-10px);
    }
    
    .ptg-tooltip-arrow {
      position: absolute;
      width: 12px;
      height: 12px;
      background: var(--ptg-tooltip-bg, #1a1a2e);
      transform: rotate(45deg);
    }
    
    .ptg-tooltip[data-placement="top"] .ptg-tooltip-arrow {
      bottom: -6px;
      left: 50%;
      margin-left: -6px;
    }
    
    .ptg-tooltip[data-placement="bottom"] .ptg-tooltip-arrow {
      top: -6px;
      left: 50%;
      margin-left: -6px;
    }
    
    .ptg-tooltip[data-placement="left"] .ptg-tooltip-arrow {
      right: -6px;
      top: 50%;
      margin-top: -6px;
    }
    
    .ptg-tooltip[data-placement="right"] .ptg-tooltip-arrow {
      left: -6px;
      top: 50%;
      margin-top: -6px;
    }
    
    .ptg-tooltip-content {
      padding: 16px;
    }
    
    .ptg-tooltip-title {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 8px 0;
    }
    
    .ptg-tooltip-body {
      font-size: 14px;
      line-height: 1.5;
      opacity: 0.9;
      margin: 0;
    }
    
    .ptg-tooltip-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .ptg-tooltip-progress {
      font-size: 12px;
      opacity: 0.7;
    }
    
    .ptg-tooltip-buttons {
      display: flex;
      gap: 8px;
    }
    
    .ptg-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    
    .ptg-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .ptg-btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }
    
    .ptg-btn-secondary:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.2);
    }
    
    .ptg-btn-primary {
      background: var(--ptg-highlight-color, #4f46e5);
      color: white;
    }
    
    .ptg-btn-primary:hover:not(:disabled) {
      filter: brightness(1.1);
    }
    
    .ptg-btn-close {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      padding: 0;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .ptg-btn-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    /* Missing element modal */
    .ptg-missing-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 360px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
      z-index: 2147483647;
      overflow: hidden;
      pointer-events: auto;
    }
    
    .ptg-missing-header {
      padding: 16px;
      background: #fef2f2;
      color: #dc2626;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .ptg-missing-icon {
      width: 24px;
      height: 24px;
    }
    
    .ptg-missing-title {
      font-weight: 600;
      font-size: 15px;
      margin: 0;
    }
    
    .ptg-missing-body {
      padding: 16px;
    }
    
    .ptg-missing-message {
      font-size: 14px;
      color: #374151;
      margin: 0 0 16px 0;
    }
    
    .ptg-missing-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .ptg-missing-btn {
      flex: 1;
      min-width: 100px;
      padding: 10px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    
    .ptg-missing-retry {
      background: #4f46e5;
      color: white;
    }
    
    .ptg-missing-retry:hover {
      background: #4338ca;
    }
    
    .ptg-missing-skip {
      background: #f3f4f6;
      color: #374151;
    }
    
    .ptg-missing-skip:hover {
      background: #e5e7eb;
    }
    
    .ptg-missing-end {
      background: #fee2e2;
      color: #dc2626;
    }
    
    .ptg-missing-end:hover {
      background: #fecaca;
    }
    
    .ptg-missing-details {
      margin-top: 12px;
      font-size: 12px;
      color: #6b7280;
    }
    
    .ptg-missing-details summary {
      cursor: pointer;
    }
    
    .ptg-missing-details pre {
      margin-top: 8px;
      padding: 8px;
      background: #f9fafb;
      border-radius: 4px;
      font-size: 11px;
      overflow-x: auto;
      color: #374151;
    }
    
    /* Waiting for navigation */
    .ptg-waiting {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--ptg-tooltip-bg, #1a1a2e);
      color: var(--ptg-tooltip-text, #ffffff);
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      z-index: 2147483646;
      pointer-events: auto;
      font-size: 14px;
    }
    `;

    /**
     * Create and inject container with shadow DOM
     */
    function createContainer() {
        if (state.elements.container) return;

        const container = document.createElement('div');
        container.id = 'ptg-runtime-container';
        container.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;';
        document.body.appendChild(container);

        const shadow = container.attachShadow({ mode: 'open' });

        // Inject styles
        const styleEl = document.createElement('style');
        styleEl.textContent = styles;
        shadow.appendChild(styleEl);

        state.elements.container = container;
        state.elements.shadow = shadow;

        log('Container created');
    }

    /**
     * Remove container
     */
    function removeContainer() {
        if (state.elements.container) {
            state.elements.container.remove();
            state.elements.container = null;
            state.elements.shadow = null;
        }
    }

    /**
     * Apply theme variables
     */
    function applyTheme(theme) {
        const merged = { ...theme, ...state.options.themeOverrides };
        const container = state.elements.container;
        if (!container) return;

        const vars = {
            '--ptg-tooltip-bg': merged.tooltipBg || '#1a1a2e',
            '--ptg-tooltip-text': merged.tooltipText || '#ffffff',
            '--ptg-font-family': merged.fontFamily || 'system-ui, -apple-system, sans-serif',
            '--ptg-tooltip-radius': (merged.tooltipRadius || 8) + 'px',
            '--ptg-tooltip-shadow': merged.tooltipShadow || '0 4px 20px rgba(0, 0, 0, 0.3)',
            '--ptg-overlay-opacity': merged.overlayOpacity || 0.7,
            '--ptg-overlay-color': merged.overlayColor || '#000',
            '--ptg-highlight-color': merged.highlightColor || '#4f46e5',
            '--ptg-highlight-radius': (merged.highlightRadius || 4) + 'px'
        };

        Object.entries(vars).forEach(([key, value]) => {
            container.style.setProperty(key, value);
        });
    }

    /**
     * Create overlay with cutout
     */
    function createOverlay() {
        const shadow = state.elements.shadow;
        if (!shadow) return;

        const overlay = document.createElement('div');
        overlay.className = 'ptg-overlay';
        overlay.innerHTML = `
      <div class="ptg-cutout"></div>
      <div class="ptg-blocker" id="ptg-b-top"></div>
      <div class="ptg-blocker" id="ptg-b-bottom"></div>
      <div class="ptg-blocker" id="ptg-b-left"></div>
      <div class="ptg-blocker" id="ptg-b-right"></div>
    `;
        shadow.appendChild(overlay);
        state.elements.overlay = overlay;

        log('Overlay created');
    }

    /**
     * Update cutout position and blockers
     */
    function updateOverlay(element) {
        const overlay = state.elements.overlay;
        if (!overlay) return;

        const cutout = overlay.querySelector('.ptg-cutout');
        const bTop = overlay.querySelector('#ptg-b-top');
        const bBottom = overlay.querySelector('#ptg-b-bottom');
        const bLeft = overlay.querySelector('#ptg-b-left');
        const bRight = overlay.querySelector('#ptg-b-right');

        if (!element) {
            // Cover everything
            cutout.style.display = 'block';
            cutout.style.left = '50%';
            cutout.style.top = '50%';
            cutout.style.width = '0';
            cutout.style.height = '0';

            bTop.style.cssText = 'display:block; top:0; left:0; width:100%; height:100%';
            bBottom.style.display = 'none';
            bLeft.style.display = 'none';
            bRight.style.display = 'none';
            return;
        }

        const rect = element.getBoundingClientRect();

        // Cutout
        cutout.style.display = 'block';
        cutout.style.left = (rect.left - 4) + 'px';
        cutout.style.top = (rect.top - 4) + 'px';
        cutout.style.width = (rect.width + 8) + 'px';
        cutout.style.height = (rect.height + 8) + 'px';

        // Blockers
        const topH = Math.max(0, rect.top - 4);
        bTop.style.cssText = `display:block; top:0; left:0; width:100%; height:${topH}px`;

        const bottomTop = rect.bottom + 4;
        bBottom.style.cssText = `display:block; top:${bottomTop}px; left:0; width:100%; height:calc(100vh - ${bottomTop}px)`;

        const leftW = Math.max(0, rect.left - 4);
        const midH = (rect.height + 8);
        const midTop = (rect.top - 4);
        bLeft.style.cssText = `display:block; top:${midTop}px; left:0; width:${leftW}px; height:${midH}px`;

        const rightLeft = rect.right + 4;
        bRight.style.cssText = `display:block; top:${midTop}px; left:${rightLeft}px; width:calc(100vw - ${rightLeft}px); height:${midH}px`;
    }

    /**
     * Create tooltip
     */
    function createTooltip() {
        const shadow = state.elements.shadow;
        if (!shadow) return;

        const tooltip = document.createElement('div');
        tooltip.className = 'ptg-tooltip animate-' + (state.tour?.theme?.animation || 'fade');
        tooltip.innerHTML = `
      <div class="ptg-tooltip-arrow"></div>
      <button class="ptg-btn-close" data-action="close">✕</button>
      <div class="ptg-tooltip-content">
        <h3 class="ptg-tooltip-title"></h3>
        <p class="ptg-tooltip-body"></p>
      </div>
      <div class="ptg-tooltip-footer">
        <span class="ptg-tooltip-progress"></span>
        <div class="ptg-tooltip-buttons">
          <button class="ptg-btn ptg-btn-secondary" data-action="prev">Back</button>
          <button class="ptg-btn ptg-btn-primary" data-action="next">Next</button>
        </div>
      </div>
    `;

        // Event listeners
        tooltip.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const step = state.tour.steps[state.currentStep];

            if (action === 'close') stop();
            else if (action === 'prev') prev();
            else if (action === 'next') {
                if (step.interaction?.kind === 'real') {
                    const target = resolveTarget(step);
                    performAction(step, target);
                    setTimeout(() => next(), 500);
                } else {
                    next();
                }
            }
        });

        shadow.appendChild(tooltip);
        state.elements.tooltip = tooltip;

        log('Tooltip created');
    }

    /**
     * Update tooltip content and position
     */
    function updateTooltip(step, targetElement) {
        const tooltip = state.elements.tooltip;
        if (!tooltip) return;

        // Update content
        tooltip.querySelector('.ptg-tooltip-title').textContent = step.title || '';
        tooltip.querySelector('.ptg-tooltip-body').textContent = step.body || '';

        const total = state.tour.steps.length;
        tooltip.querySelector('.ptg-tooltip-progress').textContent = `${state.currentStep + 1} of ${total}`;

        // Update buttons
        const prevBtn = tooltip.querySelector('[data-action="prev"]');
        const nextBtn = tooltip.querySelector('[data-action="next"]');

        prevBtn.style.display = state.currentStep > 0 ? 'block' : 'none';

        // Reset next button
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
        nextBtn.style.cursor = 'pointer';
        nextBtn.title = '';

        if (state.currentStep === total - 1) {
            nextBtn.textContent = 'Finish';
        } else {
            nextBtn.textContent = 'Next';
        }

        // Handle Guided Mode
        if (step.interaction?.kind === 'guided') {
            nextBtn.disabled = true;
            nextBtn.title = 'Complete the action to proceed';
        }

        // Position tooltip
        positionTooltip(tooltip, targetElement, step.placement || 'auto');

        // Show with animation
        requestAnimationFrame(() => {
            tooltip.classList.add('visible');
        });
    }

    /**
     * Position tooltip relative to target element
     */
    function positionTooltip(tooltip, targetElement, placement) {
        if (!targetElement) {
            // Center on screen
            tooltip.style.left = '50%';
            tooltip.style.top = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
            tooltip.setAttribute('data-placement', 'center');
            return;
        }

        const targetRect = targetElement.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const gap = 12;
        const viewportPadding = 16;

        let actualPlacement = placement;

        // Auto placement
        if (placement === 'auto') {
            const spaceAbove = targetRect.top;
            const spaceBelow = window.innerHeight - targetRect.bottom;
            const spaceLeft = targetRect.left;
            const spaceRight = window.innerWidth - targetRect.right;

            const needed = tooltipRect.height + gap;

            if (spaceBelow >= needed) actualPlacement = 'bottom';
            else if (spaceAbove >= needed) actualPlacement = 'top';
            else if (spaceRight >= tooltipRect.width + gap) actualPlacement = 'right';
            else if (spaceLeft >= tooltipRect.width + gap) actualPlacement = 'left';
            else actualPlacement = 'bottom';
        }

        tooltip.setAttribute('data-placement', actualPlacement);
        tooltip.style.transform = '';

        let left, top;

        switch (actualPlacement) {
            case 'top':
                left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
                top = targetRect.top - tooltipRect.height - gap;
                break;
            case 'bottom':
                left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
                top = targetRect.bottom + gap;
                break;
            case 'left':
                left = targetRect.left - tooltipRect.width - gap;
                top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
                break;
            case 'right':
                left = targetRect.right + gap;
                top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
                break;
        }

        // Clamp to viewport
        left = Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding));
        top = Math.max(viewportPadding, Math.min(top, window.innerHeight - tooltipRect.height - viewportPadding));

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    /**
     * Resolve target element from step
     */
    function resolveTarget(step) {
        if (!step.target) return null;

        const candidates = [step.target.primary, ...(step.target.fallbacks || [])].filter(Boolean);

        for (const candidate of candidates) {
            try {
                const element = resolveSelector(candidate);
                if (element && isVisible(element)) {
                    log(`Resolved target with ${candidate.type}: ${candidate.selector}`);
                    return element;
                }
            } catch (err) {
                log(`Failed to resolve ${candidate.selector}: ${err.message}`);
            }
        }

        return null;
    }

    /**
     * Resolve a single selector candidate
     */
    function resolveSelector(candidate) {
        if (!candidate || !candidate.selector) return null;

        switch (candidate.type) {
            case 'css':
            case 'testid':
            case 'id':
            case 'class':
                return document.querySelector(candidate.selector);

            case 'pierceShadow':
                return queryShadowSelector(candidate.selector);

            case 'iframeCss':
                return queryIframeSelector(candidate.selector);

            default:
                return document.querySelector(candidate.selector);
        }
    }

    /**
     * Query selector that pierces shadow DOM
     */
    function queryShadowSelector(selector) {
        const parts = selector.split('>>>').map(s => s.trim());
        let current = document;
        for (let i = 0; i < parts.length; i++) {
            const elements = current.querySelectorAll(parts[i]);
            if (elements.length === 0) return null;
            const el = elements[0];
            if (i === parts.length - 1) return el;
            if (el.shadowRoot) {
                current = el.shadowRoot;
            } else {
                return null;
            }
        }
        return null;
    }

    /**
     * Query selector in same-origin iframes
     */
    function queryIframeSelector(selector) {
        const [iframeSel, elementSel] = selector.split('▸').map(s => s.trim());
        const iframe = document.querySelector(iframeSel);
        if (!iframe || iframe.tagName !== 'IFRAME') return null;
        try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!doc) return null;
            return doc.querySelector(elementSel);
        } catch (err) {
            log(`Cannot access iframe: ${err.message}`);
            return null;
        }
    }

    /**
     * Check if element is visible
     */
    function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    /**
     * Check URL match
     */
    function matchesUrl(stepUrl, matchType) {
        if (!stepUrl) return true;
        const current = window.location.href;
        switch (matchType) {
            case 'exact':
                return current === stepUrl;
            case 'prefix':
                return current.startsWith(stepUrl);
            case 'regex':
                try {
                    return new RegExp(stepUrl).test(current);
                } catch {
                    return false;
                }
            default:
                return current.startsWith(stepUrl);
        }
    }

    /**
     * Perform automated action
     */
    function performAction(step, target) {
        const action = step.interaction?.action;
        if (!action || !target) return;

        if (action.type === 'click') target.click();
        if (action.type === 'input') {
            target.value = action.value || '';
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (action.type === 'scroll') target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /**
     * Handle user interaction for guided mode
     */
    function handleInteraction(step, target) {
        if (!step.interaction || step.interaction.kind === 'none') return;

        const kind = step.interaction.kind;
        const action = step.interaction.action;

        if (kind === 'guided') {
            if (action.type === 'click' && target) {
                target.addEventListener('click', function handler() {
                    target.removeEventListener('click', handler);
                    setTimeout(() => next(), 500);
                });
            }
            if (action.type === 'input' && target) {
                target.addEventListener('change', function handler() {
                    target.removeEventListener('change', handler);
                    setTimeout(() => next(), 500);
                });
            }
        }
    }

    /**
     * Show missing element modal
     */
    function showMissingModal(step) {
        const shadow = state.elements.shadow;
        if (!shadow) return;

        if (state.elements.missingModal) {
            state.elements.missingModal.remove();
        }

        const modal = document.createElement('div');
        modal.className = 'ptg-missing-modal';
        modal.innerHTML = `
      <div class="ptg-missing-header">
        <svg class="ptg-missing-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h3 class="ptg-missing-title">Element Not Found</h3>
      </div>
      <div class="ptg-missing-body">
        <p class="ptg-missing-message">We couldn't find the target element for this step. The page may have changed.</p>
        <div class="ptg-missing-buttons">
          <button class="ptg-missing-btn ptg-missing-retry" data-action="retry">Retry</button>
          <button class="ptg-missing-btn ptg-missing-skip" data-action="skip">Skip Step</button>
          <button class="ptg-missing-btn ptg-missing-end" data-action="end">End Tour</button>
        </div>
        <details class="ptg-missing-details">
          <summary>Diagnostic Info</summary>
          <pre>${escapeHtml(JSON.stringify(step.target, null, 2))}</pre>
        </details>
      </div>
    `;

        modal.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action === 'retry') {
                modal.remove();
                state.elements.missingModal = null;
                showStep(state.currentStep);
            } else if (action === 'skip') {
                modal.remove();
                state.elements.missingModal = null;
                next();
            } else if (action === 'end') {
                stop();
            }
        });

        shadow.appendChild(modal);
        state.elements.missingModal = modal;
    }

    /**
     * Show step
     */
    function showStep(index) {
        if (!state.tour || !state.isPlaying) return;

        if (index < 0 || index >= state.tour.steps.length) {
            stop();
            return;
        }

        const step = state.tour.steps[index];
        if (!step) {
            log(`No step at index ${index}`);
            stop();
            return;
        }

        state.currentStep = index;
        log(`Showing step ${index + 1}: ${step.title}`);

        // Check URL match
        if (step.url && !matchesUrl(step.url, step.urlMatch)) {
            log(`URL mismatch, waiting for navigation to: ${step.url}`);
            showNavigationWaiting(step);
            return;
        }

        // Resolve target
        const targetElement = resolveTarget(step);

        // Handle missing target
        if (!targetElement && step.requireTarget !== false) {
            log('Target not found');
            showMissingModal(step);
            return;
        }

        // Scroll lock
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';

        // Scroll element into view
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'auto', block: 'center' });
        }

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        // Update overlay
        updateOverlay(targetElement);

        // Update tooltip
        setTimeout(() => {
            updateTooltip(step, targetElement);
        }, 100);

        // Handle Interaction Listeners (Guided)
        handleInteraction(step, targetElement);

        // Callback
        if (state.options.onStepChange) {
            state.options.onStepChange(index, step);
        }

        // Set up scroll/resize listeners
        setupPositionListeners(step, targetElement);
    }

    /**
     * Show navigation waiting UI
     */
    function showNavigationWaiting(step) {
        const shadow = state.elements.shadow;
        if (!shadow) return;

        const waiting = document.createElement('div');
        waiting.className = 'ptg-waiting';
        waiting.textContent = `Waiting for navigation to: ${step.url}`;
        shadow.appendChild(waiting);

        // Watch for URL changes
        startUrlWatcher();
    }

    /**
     * Start URL watcher for SPA navigation
     */
    function startUrlWatcher() {
        if (state.urlWatcher) return;
        let lastUrl = window.location.href;
        const checkUrl = () => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                log(`URL changed to: ${lastUrl}`);
                const waiting = state.elements.shadow?.querySelector('.ptg-waiting');
                if (waiting) waiting.remove();
                showStep(state.currentStep);
            }
        };
        window.addEventListener('popstate', checkUrl);
        const origPush = history.pushState;
        const origReplace = history.replaceState;
        history.pushState = function () {
            origPush.apply(this, arguments);
            checkUrl();
        };
        history.replaceState = function () {
            origReplace.apply(this, arguments);
            checkUrl();
        };
        state.urlWatcher = { checkUrl, origPush, origReplace };
    }

    /**
     * Stop URL watcher
     */
    function stopUrlWatcher() {
        if (!state.urlWatcher) return;
        window.removeEventListener('popstate', state.urlWatcher.checkUrl);
        history.pushState = state.urlWatcher.origPush;
        history.replaceState = state.urlWatcher.origReplace;
        state.urlWatcher = null;
    }

    /**
     * Set up position update listeners
     */
    function setupPositionListeners(step, targetElement) {
        cleanupListeners();
        if (!targetElement) return;
        const updatePosition = () => {
            updateOverlay(targetElement); // Using new blocker update logic
            positionTooltip(state.elements.tooltip, targetElement, step.placement || 'auto');
        };
        window.addEventListener('scroll', updatePosition, { passive: true });
        window.addEventListener('resize', updatePosition, { passive: true });
        state.listeners.push(
            () => window.removeEventListener('scroll', updatePosition),
            () => window.removeEventListener('resize', updatePosition)
        );
    }

    /**
     * Clean up event listeners
     */
    function cleanupListeners() {
        state.listeners.forEach(cleanup => cleanup());
        state.listeners = [];
    }

    /**
     * Navigate to next step
     */
    function next() {
        if (!state.isPlaying) return;
        if (state.currentStep >= state.tour.steps.length - 1) {
            stop();
            return;
        }
        state.elements.tooltip?.classList.remove('visible');
        setTimeout(() => showStep(state.currentStep + 1), 150);
    }

    /**
     * Navigate to previous step
     */
    function prev() {
        if (!state.isPlaying || state.currentStep <= 0) return;
        state.elements.tooltip?.classList.remove('visible');
        setTimeout(() => showStep(state.currentStep - 1), 150);
    }

    /**
     * Go to specific step
     */
    function goTo(index) {
        if (!state.isPlaying) return;
        if (index < 0 || index >= state.tour.steps.length) return;
        state.elements.tooltip?.classList.remove('visible');
        setTimeout(() => showStep(index), 150);
    }

    /**
     * Start tour
     */
    function start(tourOrId, options = {}) {
        let tour;
        if (typeof tourOrId === 'string') {
            tour = global.ProductTourGeneratorTours?.[tourOrId];
            if (!tour) {
                console.error(`[PTG] Tour not found: ${tourOrId}`);
                return;
            }
        } else {
            tour = tourOrId;
        }

        if (!tour || !tour.steps || tour.steps.length === 0) {
            console.error('[PTG] Invalid tour or no steps');
            return;
        }

        if (state.isPlaying) stop();

        log('Starting tour:', tour.name);
        state.tour = tour;
        state.options = { ...defaults, ...options };
        state.currentStep = 0;
        state.isPlaying = true;

        // Lock scroll
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        createContainer();
        applyTheme(tour.theme || {});
        createOverlay();
        createTooltip();

        if (state.options.onStart) state.options.onStart(tour);

        showStep(0);
        document.addEventListener('keydown', handleKeyboard);
    }

    /**
     * Stop tour
     */
    function stop() {
        if (!state.isPlaying) return;
        log('Stopping tour');
        if (state.options.onEnd) state.options.onEnd(state.tour, state.currentStep);

        cleanupListeners();
        stopUrlWatcher();
        removeContainer();
        document.removeEventListener('keydown', handleKeyboard);

        // Restore scroll
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';

        state.tour = null;
        state.options = {};
        state.currentStep = 0;
        state.isPlaying = false;
        state.elements = { container: null, overlay: null, tooltip: null, missingModal: null };
    }

    /**
     * Handle keyboard events
     */
    function handleKeyboard(e) {
        if (!state.isPlaying) return;
        if (e.key === 'Escape') stop();
        else if (e.key === 'ArrowRight') next();
        else if (e.key === 'ArrowLeft') prev();
    }

    /**
     * Debug logging
     */
    function log(...args) {
        if (state.options.debug) console.log('[PTG]', ...args);
    }

    /**
     * Escape HTML
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Public API
    const PTGRuntime = {
        start,
        stop,
        next,
        prev,
        goTo,
        get isPlaying() { return state.isPlaying; },
        get currentStep() { return state.currentStep; }
    };

    // Export
    global.PTGRuntime = PTGRuntime;
    global.ProductTourGenerator = PTGRuntime;

})(typeof window !== 'undefined' ? window : this);
