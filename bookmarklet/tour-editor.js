/**
 * Product Tour Generator - Bookmarklet Editor
 * Self-contained tour authoring tool
 * 
 * Usage: Drag the bookmarklet link to your bookmarks bar,
 * then click it on any page to start editing tours.
 */

(function () {
  'use strict';

  // Prevent double-injection
  if (window.__PTG_EDITOR_LOADED__) {
    console.log('[PTG] Editor already loaded, toggling visibility');
    window.__PTG_TOGGLE_EDITOR__();
    return;
  }
  window.__PTG_EDITOR_LOADED__ = true;

  // ============================================
  // STATE
  // ============================================

  let currentTour = null;
  let currentStepIndex = 0;
  let isVisible = true;
  let isPicking = false;
  let currentTab = 'steps';

  // DOM references
  let container = null;
  let shadowRoot = null;
  let editorWindow = null;
  let overlay = null;
  let hoverHighlight = null;
  let targetHighlight = null;

  // ============================================
  // UTILITIES
  // ============================================

  function generateId() {
    return 'ptg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function createEmptyTour(name = 'Untitled Tour') {
    const now = new Date().toISOString();
    return {
      version: '1.0',
      id: generateId(),
      name,
      createdAt: now,
      updatedAt: now,
      theme: {
        tooltipBg: '#1a1a2e',
        tooltipText: '#ffffff',
        overlayColor: '#000000',
        overlayOpacity: 0.7,
        highlightColor: '#4f46e5'
      },
      steps: []
    };
  }

  function createEmptyStep() {
    return {
      id: generateId(),
      title: '',
      body: '',
      target: { primary: null, fallbacks: [] },
      placement: 'auto'
    };
  }

  // ============================================
  // SELECTOR GENERATOR
  // ============================================

  function generateSelectors(element) {
    const candidates = [];

    // Priority 1: data-testid
    const testId = element.getAttribute('data-testid');
    if (testId) {
      candidates.push({ selector: `[data-testid="${testId}"]`, confidence: 95, type: 'testid' });
    }

    // Priority 2: Stable ID
    if (element.id && !isDynamicId(element.id)) {
      candidates.push({ selector: `#${CSS.escape(element.id)}`, confidence: 90, type: 'id' });
    }

    // Priority 3: ARIA attributes
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      candidates.push({ selector: `[aria-label="${CSS.escape(ariaLabel)}"]`, confidence: 80, type: 'aria' });
    }

    // Priority 4: Unique class combination
    const classes = getStableClasses(element);
    if (classes.length > 0) {
      const classSelector = element.tagName.toLowerCase() + '.' + classes.join('.');
      try {
        if (document.querySelectorAll(classSelector).length === 1) {
          candidates.push({ selector: classSelector, confidence: 70, type: 'class' });
        }
      } catch (e) { }
    }

    // Priority 5: DOM path (fallback)
    const path = getDOMPath(element);
    if (path) {
      candidates.push({ selector: path, confidence: 30, type: 'path' });
    }

    return candidates.length > 0 ? candidates : [{ selector: getDOMPath(element), confidence: 20, type: 'path' }];
  }

  function isDynamicId(id) {
    return /^[a-z]*[:_-]?\d+$/i.test(id) || /[a-f0-9]{8,}/i.test(id);
  }

  function getStableClasses(element) {
    return Array.from(element.classList).filter(cls => {
      if (/[a-f0-9]{6,}/i.test(cls)) return false;
      if (/^(css|sc|_)[a-z0-9-_]+$/i.test(cls)) return false;
      return true;
    }).slice(0, 3);
  }

  function getDOMPath(element) {
    const path = [];
    let current = element;
    while (current && current !== document.body && path.length < 5) {
      let selector = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  // ============================================
  // EDITOR UI
  // ============================================

  function init() {
    // Create container with shadow DOM
    container = document.createElement('div');
    container.id = 'ptg-bookmarklet-container';
    container.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;';
    document.body.appendChild(container);

    shadowRoot = container.attachShadow({ mode: 'open' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = getStyles();
    shadowRoot.appendChild(style);

    // Create overlay for highlighting
    overlay = document.createElement('div');
    overlay.className = 'ptg-overlay';
    shadowRoot.appendChild(overlay);

    hoverHighlight = document.createElement('div');
    hoverHighlight.className = 'ptg-hover-highlight';
    overlay.appendChild(hoverHighlight);

    targetHighlight = document.createElement('div');
    targetHighlight.className = 'ptg-target-highlight';
    overlay.appendChild(targetHighlight);

    // Create editor window
    editorWindow = document.createElement('div');
    editorWindow.className = 'ptg-editor';
    editorWindow.style.pointerEvents = 'auto';
    shadowRoot.appendChild(editorWindow);

    // Initialize with empty tour
    currentTour = createEmptyTour();

    // Render and setup
    render();
    setupDrag();
    setupEvents();

    console.log('[PTG] Bookmarklet editor initialized');
  }

  function render() {
    if (!editorWindow) return;

    const steps = currentTour?.steps || [];
    const step = steps[currentStepIndex];

    editorWindow.innerHTML = `
      <div class="ptg-header">
        <div class="ptg-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          Tour Editor
        </div>
        <div class="ptg-controls">
          <button class="ptg-btn-icon" data-action="minimize" title="Minimize">−</button>
          <button class="ptg-btn-icon" data-action="close" title="Close">×</button>
        </div>
      </div>
      
      <div class="ptg-tabs">
        <div class="ptg-tab ${currentTab === 'steps' ? 'active' : ''}" data-action="tab" data-value="steps">Steps</div>
        <div class="ptg-tab ${currentTab === 'settings' ? 'active' : ''}" data-action="tab" data-value="settings">Settings</div>
      </div>

      <div class="ptg-body">
        ${currentTab === 'settings' ? renderSettings() : `
          <div class="ptg-tour-name">
            <input type="text" class="ptg-input" data-field="tourName" value="${escapeHtml(currentTour?.name || '')}" placeholder="Tour name...">
          </div>

          <div class="ptg-steps-header">
            <span>Steps (${steps.length})</span>
            <button class="ptg-btn-small" data-action="add-step">+ Add Step</button>
          </div>

          <div class="ptg-steps-list">
            ${steps.length === 0 ? '<div class="ptg-empty">No steps yet. Click "Add Step" to begin.</div>' :
          steps.map((s, i) => `
                <div class="ptg-step-item ${i === currentStepIndex ? 'active' : ''}" data-index="${i}">
                  <span class="ptg-step-num">${i + 1}</span>
                  <span class="ptg-step-title">${escapeHtml(s.title) || 'Untitled'}</span>
                  <button class="ptg-btn-icon small" data-action="delete-step" data-index="${i}" title="Delete">🗑</button>
                </div>
              `).join('')}
          </div>

          ${step ? `
            <div class="ptg-step-editor">
              <div class="ptg-form-group">
                <label>Title</label>
                <input type="text" class="ptg-input" data-field="title" value="${escapeHtml(step.title)}" placeholder="Step title...">
              </div>
              <div class="ptg-form-group">
                <label>Description</label>
                <textarea class="ptg-textarea" data-field="body" placeholder="Step description...">${escapeHtml(step.body)}</textarea>
              </div>
              <div class="ptg-form-row">
                <div class="ptg-form-group half">
                  <label>Placement</label>
                  <select class="ptg-select" data-field="placement">
                    <option value="auto" ${step.placement === 'auto' ? 'selected' : ''}>Auto</option>
                    <option value="top" ${step.placement === 'top' ? 'selected' : ''}>Top</option>
                    <option value="bottom" ${step.placement === 'bottom' ? 'selected' : ''}>Bottom</option>
                    <option value="left" ${step.placement === 'left' ? 'selected' : ''}>Left</option>
                    <option value="right" ${step.placement === 'right' ? 'selected' : ''}>Right</option>
                  </select>
                </div>
              </div>
              
              <button class="ptg-btn ${isPicking ? 'picking' : ''}" data-action="pick-element">
                ${isPicking ? '🎯 Click an element...' : '🎯 Select Target Element'}
              </button>
              ${step.target?.primary ? `
                <div class="ptg-form-group">
                  <label>Target Selector</label>
                  <input type="text" class="ptg-input" data-target-selector="true" value="${escapeHtml(step.target.primary.selector)}" placeholder="CSS Selector">
                </div>
              ` : ''}
              
              <div class="ptg-section-divider">Interaction</div>
              
              <div class="ptg-form-group">
                <label>Interaction Mode</label>
                <select class="ptg-select" data-interaction="kind">
                  <option value="none" ${(step.interaction?.kind || 'none') === 'none' ? 'selected' : ''}>None (tooltip only)</option>
                  <option value="guided" ${step.interaction?.kind === 'guided' ? 'selected' : ''}>Guided (wait for user)</option>
                  <option value="real" ${step.interaction?.kind === 'real' ? 'selected' : ''}>Automated (perform action)</option>
                </select>
              </div>
              
              ${(step.interaction?.kind === 'guided' || step.interaction?.kind === 'real') ? `
                <div class="ptg-form-group">
                  <label>Action Type</label>
                  <select class="ptg-select" data-interaction="actionType">
                    <option value="click" ${(step.interaction?.action?.type || 'click') === 'click' ? 'selected' : ''}>Click</option>
                    <option value="input" ${step.interaction?.action?.type === 'input' ? 'selected' : ''}>Type/Input</option>
                    <option value="select" ${step.interaction?.action?.type === 'select' ? 'selected' : ''}>Select Option</option>
                    <option value="scroll" ${step.interaction?.action?.type === 'scroll' ? 'selected' : ''}>Scroll</option>
                    <option value="keydown" ${step.interaction?.action?.type === 'keydown' ? 'selected' : ''}>Key Press</option>
                    <option value="navigate" ${step.interaction?.action?.type === 'navigate' ? 'selected' : ''}>Navigate</option>
                  </select>
                </div>
                
                ${renderActionOptions(step)}
              ` : ''}
            </div>
          ` : ''}
        `}
      </div>

      <div class="ptg-footer">
        <button class="ptg-btn" data-action="preview">▶ Preview</button>
        <button class="ptg-btn" data-action="import">📂 Import</button>
        <button class="ptg-btn primary" data-action="export">💾 Export JS</button>
      </div>
    `;
  }

  function renderActionOptions(step) {
    const actionType = step.interaction?.action?.type || 'click';
    const action = step.interaction?.action || {};

    switch (actionType) {
      case 'input':
        return `
          <div class="ptg-form-group">
            <label>Text to Type</label>
            <input type="text" class="ptg-input" data-interaction="value" value="${escapeHtml(action.value || '')}" placeholder="Enter text...">
          </div>
          <div class="ptg-form-group">
            <label>
              <input type="checkbox" data-interaction="clearFirst" ${action.clearFirst ? 'checked' : ''}> Clear field first
            </label>
          </div>
        `;

      case 'select':
        return `
          <div class="ptg-form-group">
            <label>Value to Select</label>
            <input type="text" class="ptg-input" data-interaction="value" value="${escapeHtml(action.value || '')}" placeholder="Option value...">
          </div>
        `;

      case 'keydown':
        return `
          <div class="ptg-form-group">
            <label>Key</label>
            <input type="text" class="ptg-input" data-interaction="key" value="${escapeHtml(action.key || '')}" placeholder="e.g., Enter, Tab, Escape...">
          </div>
        `;

      case 'scroll':
        return `
          <div class="ptg-form-group">
            <label>Scroll Y (pixels)</label>
            <input type="number" class="ptg-input" data-interaction="y" value="${action.y || 0}" placeholder="0">
          </div>
        `;

      case 'navigate':
        return `
          <div class="ptg-form-group">
            <label>URL</label>
            <input type="text" class="ptg-input" data-interaction="url" value="${escapeHtml(action.url || '')}" placeholder="https://...">
          </div>
        `;

      case 'wait':
        return `
          <div class="ptg-form-group">
            <label>Wait Duration (ms)</label>
            <input type="number" class="ptg-input" data-interaction="duration" value="${action.duration || 1000}" min="100" step="100">
          </div>
        `;

      default:
        return '';
    }
  }

  function renderSettings() {
    const theme = currentTour.theme || {};
    return `
      <div class="ptg-section-divider" style="margin-top: 0">Theme Customization</div>
      
      <div class="ptg-form-group">
        <label>Primary Color</label>
        <div class="ptg-form-row">
          <input type="color" class="ptg-color-input" data-theme="highlightColor" value="${theme.highlightColor || '#4f46e5'}">
          <input type="text" class="ptg-input" data-theme="highlightColor" value="${theme.highlightColor || '#4f46e5'}">
        </div>
      </div>
      
      <div class="ptg-form-group">
        <label>Tooltip Background</label>
        <div class="ptg-form-row">
          <input type="color" class="ptg-color-input" data-theme="tooltipBg" value="${theme.tooltipBg || '#1a1a2e'}">
          <input type="text" class="ptg-input" data-theme="tooltipBg" value="${theme.tooltipBg || '#1a1a2e'}">
        </div>
      </div>
      
      <div class="ptg-form-group">
        <label>Tooltip Text Color</label>
        <div class="ptg-form-row">
          <input type="color" class="ptg-color-input" data-theme="tooltipText" value="${theme.tooltipText || '#ffffff'}">
          <input type="text" class="ptg-input" data-theme="tooltipText" value="${theme.tooltipText || '#ffffff'}">
        </div>
      </div>
      
      <div class="ptg-form-group">
        <label>Font Family</label>
        <input type="text" class="ptg-input" data-theme="fontFamily" value="${escapeHtml(theme.fontFamily || 'system-ui, -apple-system, sans-serif')}" placeholder="font-family...">
      </div>
      
      <div class="ptg-form-group">
        <label>Overlay Opacity (0-1)</label>
        <input type="number" class="ptg-input" data-theme="overlayOpacity" value="${theme.overlayOpacity || 0.7}" step="0.1" min="0" max="1">
      </div>
      
      <div class="ptg-form-group">
        <label>Tooltip Corner Radius (px)</label>
        <input type="number" class="ptg-input" data-theme="tooltipRadius" value="${theme.tooltipRadius || 8}" step="1">
      </div>
    `;
  }

  function setupEvents() {
    // Click handler
    editorWindow.addEventListener('click', (e) => {
      const action = e.target.dataset?.action;
      const index = e.target.dataset?.index;

      if (action) {
        e.preventDefault();
        e.stopPropagation();

        // Tab switching
        if (action === 'tab') {
          const tab = e.target.dataset.value;
          currentTab = tab;
          render();
          return;
        }

        handleAction(action, index !== undefined ? parseInt(index) : undefined);
        return;
      }

      // Step selection
      const stepItem = e.target.closest('.ptg-step-item');
      if (stepItem && !e.target.dataset?.action) {
        currentStepIndex = parseInt(stepItem.dataset.index);
        render();
        updateTargetHighlight();
      }
    });

    // Input handler
    editorWindow.addEventListener('input', (e) => {
      const field = e.target.dataset?.field;
      const interactionField = e.target.dataset?.interaction;
      const themeField = e.target.dataset?.theme;
      const targetSelector = e.target.dataset?.targetSelector;

      if (field) {
        if (field === 'tourName') {
          currentTour.name = e.target.value;
        } else if (currentTour?.steps?.[currentStepIndex]) {
          currentTour.steps[currentStepIndex][field] = e.target.value;
        }
        currentTour.updatedAt = new Date().toISOString();
      } else if (targetSelector) {
        if (currentTour?.steps?.[currentStepIndex]?.target?.primary) {
          currentTour.steps[currentStepIndex].target.primary.selector = e.target.value;
          currentTour.updatedAt = new Date().toISOString();
          updateTargetHighlight();
        }
      } else if (interactionField && currentTour?.steps?.[currentStepIndex]) {
        updateInteractionField(interactionField, e.target.value, e.target.type === 'checkbox' ? e.target.checked : null);
      } else if (themeField) {
        if (!currentTour.theme) currentTour.theme = {};
        currentTour.theme[themeField] = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
        currentTour.updatedAt = new Date().toISOString();

        // If color input, update sibling text input and vice versa (simple sync)
        if (e.target.type === 'color') {
          e.target.nextElementSibling.value = e.target.value;
        } else if (e.target.type === 'text' && e.target.previousElementSibling?.type === 'color') {
          e.target.previousElementSibling.value = e.target.value;
        }
      }
    });

    // Change handler
    editorWindow.addEventListener('change', (e) => {
      const field = e.target.dataset?.field;
      const interactionField = e.target.dataset?.interaction;

      if (field && currentTour?.steps?.[currentStepIndex]) {
        currentTour.steps[currentStepIndex][field] = e.target.value;
        currentTour.updatedAt = new Date().toISOString();
      } else if (interactionField && currentTour?.steps?.[currentStepIndex]) {
        updateInteractionField(interactionField, e.target.value, e.target.type === 'checkbox' ? e.target.checked : null);
      }
    });
  }

  function updateInteractionField(field, value, checkedValue = null) {
    const step = currentTour.steps[currentStepIndex];
    if (!step) return;

    // Initialize interaction if needed
    if (!step.interaction) {
      step.interaction = { kind: 'none' };
    }

    if (field === 'kind') {
      step.interaction.kind = value;
      if (value !== 'none' && !step.interaction.action) {
        step.interaction.action = { type: 'click' };
      }
      render(); // Re-render to show/hide action options
      return;
    }

    if (field === 'actionType') {
      if (!step.interaction.action) step.interaction.action = {};
      step.interaction.action.type = value;
      render(); // Re-render to show action-specific fields
      return;
    }

    // Handle action-specific fields
    if (!step.interaction.action) step.interaction.action = { type: 'click' };

    if (checkedValue !== null) {
      step.interaction.action[field] = checkedValue;
    } else if (field === 'y' || field === 'duration') {
      step.interaction.action[field] = parseInt(value) || 0;
    } else {
      step.interaction.action[field] = value;
    }

    currentTour.updatedAt = new Date().toISOString();
  }

  function handleAction(action, index) {
    switch (action) {
      case 'close':
        destroy();
        break;

      case 'minimize':
        editorWindow.classList.toggle('minimized');
        break;

      case 'add-step':
        currentTour.steps.push(createEmptyStep());
        currentStepIndex = currentTour.steps.length - 1;
        render();
        break;

      case 'delete-step':
        if (index !== undefined) {
          currentTour.steps.splice(index, 1);
          if (currentStepIndex >= currentTour.steps.length) {
            currentStepIndex = Math.max(0, currentTour.steps.length - 1);
          }
          render();
          updateTargetHighlight();
        }
        break;

      case 'pick-element':
        togglePicking();
        break;

      case 'preview':
        startPreview();
        break;

      case 'export':
        exportTour();
        break;

      case 'import':
        importTour();
        break;
    }
  }

  function setupDrag() {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    const header = editorWindow.querySelector('.ptg-header');
    if (!header) return;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = editorWindow.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      editorWindow.style.left = `${startLeft + dx}px`;
      editorWindow.style.top = `${startTop + dy}px`;
      editorWindow.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  // ============================================
  // ELEMENT PICKING
  // ============================================

  function togglePicking() {
    isPicking = !isPicking;

    if (isPicking) {
      document.addEventListener('mousemove', handlePickerMove);
      document.addEventListener('click', handlePickerClick, true);
      document.addEventListener('keydown', handlePickerKeydown);
      document.body.style.cursor = 'crosshair';
    } else {
      document.removeEventListener('mousemove', handlePickerMove);
      document.removeEventListener('click', handlePickerClick, true);
      document.removeEventListener('keydown', handlePickerKeydown);
      document.body.style.cursor = '';
      hoverHighlight.style.display = 'none';
    }

    render();
  }

  function handlePickerMove(e) {
    if (!isPicking) return;
    if (e.target.closest('#ptg-bookmarklet-container')) {
      hoverHighlight.style.display = 'none';
      return;
    }

    const rect = e.target.getBoundingClientRect();
    hoverHighlight.style.display = 'block';
    hoverHighlight.style.left = `${rect.left}px`;
    hoverHighlight.style.top = `${rect.top}px`;
    hoverHighlight.style.width = `${rect.width}px`;
    hoverHighlight.style.height = `${rect.height}px`;
  }

  function handlePickerClick(e) {
    if (!isPicking) return;
    if (e.target.closest('#ptg-bookmarklet-container')) return;

    e.preventDefault();
    e.stopPropagation();

    const selectors = generateSelectors(e.target);
    if (currentTour?.steps?.[currentStepIndex]) {
      currentTour.steps[currentStepIndex].target = {
        primary: selectors[0],
        fallbacks: selectors.slice(1)
      };
    }

    togglePicking();
    updateTargetHighlight();
  }

  function handlePickerKeydown(e) {
    if (e.key === 'Escape' && isPicking) {
      togglePicking();
    }
  }

  function updateTargetHighlight() {
    const step = currentTour?.steps?.[currentStepIndex];
    if (!step?.target?.primary?.selector) {
      targetHighlight.style.display = 'none';
      return;
    }

    try {
      const el = document.querySelector(step.target.primary.selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        targetHighlight.style.display = 'block';
        targetHighlight.style.left = `${rect.left}px`;
        targetHighlight.style.top = `${rect.top}px`;
        targetHighlight.style.width = `${rect.width}px`;
        targetHighlight.style.height = `${rect.height}px`;
      } else {
        targetHighlight.style.display = 'none';
      }
    } catch (e) {
      targetHighlight.style.display = 'none';
    }
  }

  // ============================================
  // IMPORT/EXPORT
  // ============================================

  function exportTour() {
    const tourJson = JSON.stringify(currentTour);
    const escaped = tourJson.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const js = `/**
 * Product Tour Generator - Exported Tour
 * Tour: ${currentTour.name}
 * Generated: ${new Date().toISOString()}
 */

/* PTG_TOUR_DATA_START */
window.ProductTourGeneratorTours = window.ProductTourGeneratorTours || {};
window.ProductTourGeneratorTours["${currentTour.id}"] = JSON.parse('${escaped}');
/* PTG_TOUR_DATA_END */

// To start this tour, include the runtime and call:
// ProductTourGenerator.start("${currentTour.id}");
`;

    download(`${currentTour.name.replace(/[^a-z0-9]/gi, '_')}.js`, js, 'application/javascript');
  }

  function importTour() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js,.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const content = await file.text();
      try {
        let tour;
        if (file.name.endsWith('.json') || content.trim().startsWith('{')) {
          tour = JSON.parse(content);
        } else {
          // Extract from JS
          const match = content.match(/JSON\.parse\('(.+?)'\)/s);
          if (match) {
            const json = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
            tour = JSON.parse(json);
          }
        }

        if (tour && tour.id) {
          currentTour = tour;
          currentStepIndex = 0;
          render();
          alert(`Imported: ${tour.name}`);
        } else {
          alert('Invalid tour file');
        }
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    input.click();
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================
  // PREVIEW RUNTIME
  // ============================================

  function startPreview() {
    if (!currentTour) return;

    // Hide editor
    if (editorWindow) editorWindow.style.display = 'none';
    if (hoverHighlight) hoverHighlight.style.display = 'none';
    if (targetHighlight) targetHighlight.style.display = 'none';

    // Start runtime
    PreviewRuntime.start(JSON.parse(JSON.stringify(currentTour)), { // Deep copy to avoid mutation issues
      onEnd: () => {
        // Show editor
        if (editorWindow && isVisible) editorWindow.style.display = 'flex';
      }
    });
  }

  const PreviewRuntime = (function () {
    let state = {
      tour: null,
      currentStep: 0,
      isPlaying: false,
      options: {},
      elements: {
        container: null,
        overlay: null,
        tooltip: null
      }
    };

    const styles = `
      :host { all: initial; font-family: var(--ptg-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); }
      .ptg-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483640; }
      .ptg-blocker { position: fixed; z-index: 2147483645; background: transparent; pointer-events: auto; }
      .ptg-cutout { position: absolute; box-shadow: 0 0 0 9999px rgba(0,0,0,var(--ptg-overlay-opacity, 0.7)); border-radius: 4px; border: 2px solid var(--ptg-highlight-color, #4f46e5); pointer-events: none; transition: all 0.3s ease; }
      .ptg-tooltip { position: absolute; max-width: 320px; min-width: 240px; background: var(--ptg-tooltip-bg, #1a1a2e); color: var(--ptg-tooltip-text, #fff); border-radius: var(--ptg-tooltip-radius, 8px); box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 2147483646; pointer-events: auto; padding: 16px; transition: all 0.2s ease; }
      .ptg-tooltip-arrow { position: absolute; width: 12px; height: 12px; background: var(--ptg-tooltip-bg, #1a1a2e); transform: rotate(45deg); z-index: -1; }
      .ptg-tooltip[data-placement="top"] .ptg-tooltip-arrow { bottom: -6px; left: 50%; margin-left: -6px; }
      .ptg-tooltip[data-placement="bottom"] .ptg-tooltip-arrow { top: -6px; left: 50%; margin-left: -6px; }
      .ptg-tooltip[data-placement="left"] .ptg-tooltip-arrow { right: -6px; top: 50%; margin-top: -6px; }
      .ptg-tooltip[data-placement="right"] .ptg-tooltip-arrow { left: -6px; top: 50%; margin-top: -6px; }
      .ptg-tooltip[data-placement="center"] .ptg-tooltip-arrow { display: none; }
      .ptg-tooltip h3 { margin: 0 0 8px 0; font-size: 16px; font-weight: 600; }
      .ptg-tooltip p { margin: 0 0 16px 0; font-size: 14px; line-height: 1.5; opacity: 0.9; }
      .ptg-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; }
      .ptg-progress { font-size: 12px; opacity: 0.7; }
      .ptg-btn { padding: 6px 12px; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; margin-left: 8px; }
      .ptg-btn-primary { background: var(--ptg-highlight-color, #4f46e5); color: white; }
      .ptg-btn-secondary { background: rgba(255,255,255,0.1); color: white; }
      .ptg-close { position: absolute; top: 8px; right: 8px; background: none; border: none; color: var(--ptg-tooltip-text, #fff); opacity: 0.5; cursor: pointer; font-size: 18px; line-height: 1; padding: 4px; border-radius: 4px; }
      .ptg-close:hover { background: rgba(255,255,255,0.1); opacity: 1; }
    `;

    function start(tour, options = {}) {
      if (state.isPlaying) stop();

      // Lock scroll (html + body)
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';

      state = { ...state, tour, options, isPlaying: true, currentStep: 0, originalOverflow: { body: originalBodyOverflow, html: originalHtmlOverflow } };
      createContainer();
      showStep(0);
    }

    function stop() {
      if (!state.isPlaying) return;

      // Restore scroll
      if (state.originalOverflow) {
        document.body.style.overflow = state.originalOverflow.body;
        document.documentElement.style.overflow = state.originalOverflow.html;
      }

      state.isPlaying = false;
      if (state.elements.container) state.elements.container.remove();
      state.elements = { container: null, overlay: null, tooltip: null };
      if (state.options.onEnd) state.options.onEnd();
    }

    function createContainer() {
      const container = document.createElement('div');
      container.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;';
      const shadow = container.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = styles;
      shadow.appendChild(style);
      document.body.appendChild(container);
      state.elements.container = container;
      state.elements.shadow = shadow;

      // Apply theme
      applyTheme(state.tour.theme || {}, container);

      // Create overlay
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

      // Create tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'ptg-tooltip';
      shadow.appendChild(tooltip);
      state.elements.tooltip = tooltip;
    }

    function applyTheme(theme, container) {
      const vars = {
        '--ptg-highlight-color': theme.highlightColor || '#4f46e5',
        '--ptg-tooltip-bg': theme.tooltipBg || '#1a1a2e',
        '--ptg-tooltip-text': theme.tooltipText || '#ffffff',
        '--ptg-font-family': theme.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        '--ptg-overlay-opacity': theme.overlayOpacity || 0.7,
        '--ptg-tooltip-radius': (theme.tooltipRadius || 8) + 'px',
      };
      Object.entries(vars).forEach(([k, v]) => container.style.setProperty(k, v));
    }

    function showStep(index) {
      if (index < 0 || index >= state.tour.steps.length) {
        stop();
        return;
      }
      state.currentStep = index;
      const step = state.tour.steps[index];
      const target = resolveTarget(step);

      if (target) {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
      }

      updateOverlay(target);
      updateTooltip(step, target);
      handleInteraction(step, target);
    }

    function resolveTarget(step) {
      if (!step.target?.primary) return null;
      // Simple resolution for preview
      try {
        return document.querySelector(step.target.primary.selector);
      } catch (e) { return null; }
    }

    function updateOverlay(element) {
      const overlay = state.elements.overlay;
      if (!overlay) return;

      const cutout = overlay.querySelector('.ptg-cutout');
      const bTop = overlay.querySelector('#ptg-b-top');
      const bBottom = overlay.querySelector('#ptg-b-bottom');
      const bLeft = overlay.querySelector('#ptg-b-left');
      const bRight = overlay.querySelector('#ptg-b-right');

      if (!cutout || !bTop) return;

      if (element) {
        const rect = element.getBoundingClientRect();

        // Cutout visuals
        cutout.style.display = 'block';
        cutout.style.left = (rect.left - 4) + 'px';
        cutout.style.top = (rect.top - 4) + 'px';
        cutout.style.width = (rect.width + 8) + 'px';
        cutout.style.height = (rect.height + 8) + 'px';

        // Position blockers
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

      } else {
        // Full screen block
        cutout.style.display = 'block';
        cutout.style.left = '50%';
        cutout.style.top = '50%';
        cutout.style.width = '0';
        cutout.style.height = '0';

        bTop.style.cssText = 'display:block; top:0; left:0; width:100%; height:100%';
        bBottom.style.display = 'none';
        bLeft.style.display = 'none';
        bRight.style.display = 'none';
      }
    }

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

    function updateTooltip(step, target) {
      const tooltip = state.elements.tooltip;
      const isLast = state.currentStep === state.tour.steps.length - 1;

      tooltip.innerHTML = `
        <button class="ptg-close">×</button>
        <div class="ptg-tooltip-arrow"></div>
        <h3>${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.body)}</p>
        <div class="ptg-footer">
          <span class="ptg-progress">${state.currentStep + 1} of ${state.tour.steps.length}</span>
          <div>
            ${state.currentStep > 0 ? '<button class="ptg-btn ptg-btn-secondary" data-action="prev">Back</button>' : ''}
            <button class="ptg-btn ptg-btn-primary" data-action="next">${isLast ? 'Finish' : 'Next'}</button>
          </div>
        </div>
      `;

      if (target) {
        tooltip.style.transform = '';
        const tRect = target.getBoundingClientRect();
        const ttRect = tooltip.getBoundingClientRect();
        const viewport = { w: window.innerWidth, h: window.innerHeight };
        const padding = 10;
        const margin = 12;

        const checkWrap = (p) => {
          if (p === 'top') return tRect.top - ttRect.height - margin >= padding;
          if (p === 'bottom') return tRect.bottom + ttRect.height + margin <= viewport.h - padding;
          if (p === 'left') return tRect.left - ttRect.width - margin >= padding;
          if (p === 'right') return tRect.right + ttRect.width + margin <= viewport.w - padding;
          return false;
        };

        let placement = step.placement === 'auto' ? 'bottom' : step.placement;

        if (step.placement === 'auto') {
          const order = ['bottom', 'top', 'right', 'left'];
          const best = order.find(p => checkWrap(p));
          if (best) placement = best;
        } else if (!checkWrap(placement)) {
          const flip = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
          if (checkWrap(flip[placement])) placement = flip[placement];
        }

        let top = 0, left = 0;
        if (placement === 'top') {
          top = tRect.top - ttRect.height - margin;
          left = tRect.left + (tRect.width - ttRect.width) / 2;
        } else if (placement === 'bottom') {
          top = tRect.bottom + margin;
          left = tRect.left + (tRect.width - ttRect.width) / 2;
        } else if (placement === 'left') {
          top = tRect.top + (tRect.height - ttRect.height) / 2;
          left = tRect.left - ttRect.width - margin;
        } else if (placement === 'right') {
          top = tRect.top + (tRect.height - ttRect.height) / 2;
          left = tRect.right + margin;
        }

        // Clamp to viewport
        if (placement === 'top' || placement === 'bottom') {
          left = Math.max(padding, Math.min(left, viewport.w - ttRect.width - padding));
        } else {
          top = Math.max(padding, Math.min(top, viewport.h - ttRect.height - padding));
        }

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        tooltip.setAttribute('data-placement', placement);

        // Adjust arrow
        const arrow = tooltip.querySelector('.ptg-tooltip-arrow');
        if (arrow) {
          arrow.style.left = ''; arrow.style.top = ''; arrow.style.marginLeft = ''; arrow.style.marginTop = '';
          if (placement === 'top' || placement === 'bottom') {
            const center = tRect.left + tRect.width / 2;
            let arrowLeft = center - left;
            arrowLeft = Math.max(12, Math.min(arrowLeft, ttRect.width - 12));
            arrow.style.left = (arrowLeft - 6) + 'px';
            arrow.style.marginLeft = '0';
          } else {
            const center = tRect.top + tRect.height / 2;
            let arrowTop = center - top;
            arrowTop = Math.max(12, Math.min(arrowTop, ttRect.height - 12));
            arrow.style.top = (arrowTop - 6) + 'px';
            arrow.style.marginTop = '0';
          }
        }
      } else {
        tooltip.style.left = '50%';
        tooltip.style.top = '50%';
        tooltip.style.transform = 'translate(-50%, -50%)';
      }

      // Events
      tooltip.querySelector('.ptg-close').onclick = stop;
      const nextBtn = tooltip.querySelector('[data-action="next"]');

      if (nextBtn) {
        if (step.interaction?.kind === 'guided') {
          nextBtn.disabled = true;
          nextBtn.style.opacity = '0.5';
          nextBtn.style.cursor = 'not-allowed';
          nextBtn.title = 'Please complete the highlighted action to proceed';
        } else if (step.interaction?.kind === 'real') {
          nextBtn.onclick = () => {
            performAction(step, target);
            setTimeout(() => showStep(state.currentStep + 1), 500);
          };
        } else {
          nextBtn.onclick = () => showStep(state.currentStep + 1);
        }
      }

      const prevBtn = tooltip.querySelector('[data-action="prev"]');
      if (prevBtn) prevBtn.onclick = () => showStep(state.currentStep - 1);
    }

    function handleInteraction(step, target) {
      if (!step.interaction || step.interaction.kind === 'none') return;

      const kind = step.interaction.kind;
      const action = step.interaction.action;

      if (kind === 'guided') {
        // Wait for user interaction
        if (action.type === 'click' && target) {
          target.addEventListener('click', function handler() {
            target.removeEventListener('click', handler);
            setTimeout(() => showStep(state.currentStep + 1), 500);
          });
        }
        // Input guided interaction could be added here
        if (action.type === 'input' && target) {
          target.addEventListener('change', function handler() {
            target.removeEventListener('change', handler);
            setTimeout(() => showStep(state.currentStep + 1), 500);
          });
        }
      }
    }

    return { start, stop };
  })();

  // ============================================
  // CLEANUP
  // ============================================

  function destroy() {
    PreviewRuntime.stop();
    if (isPicking) togglePicking();
    if (container) {
      container.remove();
      container = null;
    }
    window.__PTG_EDITOR_LOADED__ = false;
    console.log('[PTG] Editor closed');
  }

  window.__PTG_TOGGLE_EDITOR__ = function () {
    if (editorWindow) {
      isVisible = !isVisible;
      editorWindow.style.display = isVisible ? 'flex' : 'none';
    }
  };

  // ============================================
  // STYLES
  // ============================================

  function getStyles() {
    return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      .ptg-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .ptg-hover-highlight {
        position: fixed;
        border: 2px dashed #22c55e;
        background: rgba(34, 197, 94, 0.1);
        pointer-events: none;
        display: none;
        border-radius: 4px;
      }

      .ptg-target-highlight {
        position: fixed;
        border: 2px solid #4f46e5;
        background: rgba(79, 70, 229, 0.1);
        pointer-events: none;
        display: none;
        border-radius: 4px;
      }

      .ptg-editor {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 340px;
        max-height: 95vh;
        background: #1a1a2e;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        color: #e5e7eb;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        pointer-events: auto;
      }

      .ptg-editor.minimized .ptg-body,
      .ptg-editor.minimized .ptg-footer {
        display: none;
      }

      .ptg-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: linear-gradient(135deg, #4f46e5, #7c3aed);
        cursor: move;
        user-select: none;
      }

      .ptg-logo {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
        color: white;
      }

      .ptg-logo svg {
        width: 20px;
        height: 20px;
      }

      .ptg-controls {
        display: flex;
        gap: 4px;
      }

      .ptg-btn-icon {
        width: 24px;
        height: 24px;
        border: none;
        background: rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }

      .ptg-btn-icon:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .ptg-btn-icon.small {
        width: 20px;
        height: 20px;
        font-size: 11px;
        background: transparent;
      }

      .ptg-body {
        padding: 16px;
        overflow-y: auto;
        flex: 1;
      }

      .ptg-tour-name {
        margin-bottom: 16px;
      }

      .ptg-input, .ptg-textarea, .ptg-select {
        width: 100%;
        padding: 8px 12px;
        background: #2a2a4a;
        border: 1px solid #3a3a5a;
        border-radius: 6px;
        color: #e5e7eb;
        font-size: 13px;
        outline: none;
      }

      .ptg-input:focus, .ptg-textarea:focus, .ptg-select:focus {
        border-color: #4f46e5;
      }

      .ptg-textarea {
        min-height: 60px;
        resize: vertical;
      }

      .ptg-steps-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-weight: 500;
        color: #9ca3af;
        font-size: 12px;
      }

      .ptg-btn-small {
        padding: 4px 8px;
        background: #4f46e5;
        border: none;
        border-radius: 4px;
        color: white;
        font-size: 11px;
        cursor: pointer;
      }

      .ptg-btn-small:hover {
        background: #4338ca;
      }

      .ptg-steps-list {
        margin-bottom: 16px;
        max-height: 150px;
        overflow-y: auto;
      }

      .ptg-step-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: #2a2a4a;
        border-radius: 6px;
        margin-bottom: 4px;
        cursor: pointer;
      }

      .ptg-step-item:hover {
        background: #3a3a5a;
      }

      .ptg-step-item.active {
        border: 1px solid #4f46e5;
        background: rgba(79, 70, 229, 0.15);
      }

      .ptg-step-num {
        width: 22px;
        height: 22px;
        background: #4f46e5;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
        flex-shrink: 0;
      }

      .ptg-step-title {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .ptg-empty {
        text-align: center;
        padding: 20px;
        color: #6b7280;
        font-size: 12px;
      }

      .ptg-step-editor {
        border-top: 1px solid #3a3a5a;
        padding-top: 16px;
      }

      .ptg-form-group {
        margin-bottom: 12px;
      }

      .ptg-form-group label {
        display: block;
        margin-bottom: 4px;
        font-size: 11px;
        color: #9ca3af;
        text-transform: uppercase;
      }

      .ptg-btn {
        width: 100%;
        padding: 10px;
        background: #2a2a4a;
        border: 1px solid #3a3a5a;
        border-radius: 6px;
        color: #e5e7eb;
        font-size: 13px;
        cursor: pointer;
        margin-top: 8px;
        transition: all 0.2s;
      }

      .ptg-btn:hover {
        background: #3a3a5a;
      }

      .ptg-btn.primary {
        background: linear-gradient(135deg, #4f46e5, #7c3aed);
        border: none;
        color: white;
      }

      .ptg-btn.primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
      }

      .ptg-btn.picking {
        background: #22c55e;
        border-color: #22c55e;
        color: white;
      }

      .ptg-form-row {
        display: flex;
        gap: 8px;
      }

      .ptg-form-group.half {
        flex: 1;
      }

      .ptg-section-divider {
        margin: 16px 0 12px;
        padding-bottom: 4px;
        border-bottom: 1px solid #3a3a5a;
        font-size: 11px;
        font-weight: 600;
        color: #9ca3af;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .ptg-tabs { display: flex; border-bottom: 1px solid #3a3a5a; margin-bottom: 12px; }
      .ptg-tab { padding: 8px 12px; cursor: pointer; opacity: 0.7; border-bottom: 2px solid transparent; font-size: 13px; font-weight: 500; }
      .ptg-tab:hover { opacity: 1; }
      .ptg-tab.active { opacity: 1; border-bottom-color: #4f46e5; color: #4f46e5; }
      .ptg-color-input { width: 100%; height: 36px; padding: 2px; border: 1px solid #3a3a5a; background: #1a1a2e; border-radius: 4px; cursor: pointer; }
      .ptg-target-info {
        margin-top: 8px;
        padding: 8px;
        background: #2a2a4a;
        border-radius: 4px;
        font-size: 11px;
        color: #9ca3af;
        word-break: break-all;
      }

      .ptg-footer {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #3a3a5a;
        background: #1a1a2e;
      }

      .ptg-footer .ptg-btn {
        flex: 1;
        margin: 0;
      }
    `;
  }

  // Initialize
  init();

})();
