// Global variables
let currentModalCallback = null;

// Modal functions
function showModal(title, content, callback) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalContent').innerHTML = content;
    document.getElementById('modalOverlay').classList.add('active');
    currentModalCallback = callback;
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    currentModalCallback = null;
}

function confirmModal() {
    if (currentModalCallback) {
        currentModalCallback();
    }
    closeModal();
}

// Task sidebar functions
function closeTaskSidebar() {
    document.getElementById('taskSidebar').classList.remove('active');
}

// Utility functions
function formatDate(date) {
    try {
        if (isNaN(date.getTime())) {
            return '';
        }
        return date.toISOString().split('T')[0];
    } catch (error) {
        console.warn('Invalid date in formatDate:', date);
        return '';
    }
}

function parseDate(dateString) {
    return new Date(dateString);
}

function getDateProperty(page) {
    for (const prop of Object.values(page.properties)) {
        if (prop.type === 'date') {
            return prop;
        }
    }
    return null;
}

function getStatusProperty(page) {
    for (const prop of Object.values(page.properties)) {
        if (prop.type === 'status') {
            return prop;
        }
    }
    return null;
}

// Database functions
function createDatabaseWithProperties(name, properties) {
    const propertyObjects = {};
    
    properties.forEach((prop, index) => {
        const propId = `prop_${index}`;
        propertyObjects[propId] = {
            name: prop.name,
            type: prop.type,
            options: prop.options || []
        };
    });
    
    return fetch('/api/create_database', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: name,
            properties: propertyObjects
        })
    })
    .then(response => response.json());
}

function createPageWithProperties(databaseId, title, properties) {
    const propertyObjects = {};
    Object.keys(properties).forEach(propId => {
        const prop = properties[propId];
        propertyObjects[propId] = {
            name: prop.name,
            type: prop.type,
            value: prop.type === 'rich_text' ? '' : prop.value,
            rich_text_content: prop.type === 'rich_text' ? prop.rich_text_content : undefined
        };
    });
    return fetch('/api/create_page', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            database_id: databaseId,
            title: title,
            properties: propertyObjects
        })
    })
    .then(response => response.json());
}

// Date repetition functions
function calculateRepetitionDates(startDate, repetitionType, repetitionConfig) {
    const start = new Date(startDate);
    const dates = [];
    
    switch (repetitionType) {
        case 'daily':
            for (let i = 0; i < 365; i++) {
                const date = new Date(start);
                date.setDate(start.getDate() + i);
                dates.push(formatDate(date));
            }
            break;
            
        case 'weekly':
            const daysOfWeek = repetitionConfig.days || [0, 1, 2, 3, 4, 5, 6];
            for (let i = 0; i < 365; i++) {
                const date = new Date(start);
                date.setDate(start.getDate() + i);
                if (daysOfWeek.includes(date.getDay())) {
                    dates.push(formatDate(date));
                }
            }
            break;
            
        case 'custom_days':
            const interval = repetitionConfig.interval || 1;
            const days = repetitionConfig.days || [0, 1, 2, 3, 4, 5, 6];
            for (let i = 0; i < 365; i += interval) {
                const date = new Date(start);
                date.setDate(start.getDate() + i);
                if (days.includes(date.getDay())) {
                    dates.push(formatDate(date));
                }
            }
            break;
    }
    
    return dates;
}

// Property rendering functions
function renderPropertyValue(pageProp, propDef) {
    switch (propDef.type) {
        case 'text':
            return `<span>${pageProp.value || ''}</span>`;
        case 'rich_text':
            const richContent = pageProp.rich_text_content || '';
            if (richContent) {
                return `<div class="rich-text-preview">${richContent}</div>`;
            }
            return `<span class="empty-property">-</span>`;
        case 'date':
            if (typeof pageProp.value === 'object') {
                const dateValue = pageProp.value.start_date || pageProp.value.end_date || '';
                return `<span>${dateValue}</span>`;
            }
            return `<span>${pageProp.value}</span>`;
            
        case 'select':
        case 'status':
            return `<span class="property-tag">${pageProp.value}</span>`;
            
        case 'number':
            return `<span>${pageProp.value}</span>`;
            
        default:
            return `<span>${pageProp.value}</span>`;
    }
}

function renderPropertyEditor(property, propertyDefinition) {
    switch (propertyDefinition.type) {
        case 'text':
            return `<input type="text" class="form-control" value="${property.value || ''}" 
                           onchange="updateProperty('${property.id}', 'text', this.value)">`;
        case 'rich_text':
            return `<textarea class="form-control" data-rich-text="true" data-placeholder="Edit ${property.name.toLowerCase()}...">${property.rich_text_content || ''}</textarea>`;
            
        case 'date':
            const dateValue = typeof property.value === 'object' ? 
                (property.value.start_date || '') : (property.value || '');
            return `<input type="date" class="form-control" value="${dateValue}" 
                           onchange="updateProperty('${property.id}', 'date', this.value)">`;
            
        case 'select':
        case 'status':
            const options = propertyDefinition.options || [];
            let optionsHtml = '';
            options.forEach(option => {
                const selected = property.value === option ? 'selected' : '';
                optionsHtml += `<option value="${option}" ${selected}>${option}</option>`;
            });
            return `<select class="form-control" onchange="updateProperty('${property.id}', '${propertyDefinition.type}', this.value)">
                        ${optionsHtml}
                    </select>`;
            
        case 'number':
            return `<input type="number" class="form-control" value="${property.value || ''}" 
                           onchange="updateProperty('${property.id}', 'number', this.value)">`;
            
        default:
            return `<input type="text" class="form-control" value="${property.value || ''}" 
                           onchange="updateProperty('${property.id}', 'text', this.value)">`;
    }
}

// Property update functions
function updateProperty(propertyId, type, value) {
    if (!window.currentPageId) {
        console.error('No currentPageId set');
        return;
    }
    let payload = {
        page_id: window.currentPageId,
        property_id: propertyId,
        type: type
    };
    if (type === 'rich_text') {
        payload.value = '';
        payload.rich_text_content = value;
    } else {
        payload.value = value;
    }
    fetch('/api/update_property', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Property updated and persisted');
            if (window.currentDatabaseId) {
                loadDatabaseData(window.currentDatabaseId);
            }
        } else {
            console.error('Error updating property:', data.error);
        }
    })
    .catch(error => {
        console.error('Error updating property:', error);
    });
}

// Database table functions
function renderDatabaseTable(databaseId, pages, database) {
    const tableBody = document.getElementById(`databaseBody_${databaseId}`);
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    pages.forEach(page => {
        const row = document.createElement('div');
        row.className = 'database-table-row';
        row.setAttribute('data-page-id', page.id);
        
        // Title cell with description
        const titleCell = document.createElement('div');
        titleCell.className = 'table-cell table-cell-title';
        
        const description = page.properties.description ? page.properties.description.value : '';
        let descriptionHtml = '';
        
        if (description) {
            const isLongDescription = description.length > 50;
            const displayText = isLongDescription ? description.substring(0, 50) + '...' : description;
            const className = isLongDescription ? 'page-description has-full-text' : 'page-description';
            const dataAttr = isLongDescription ? `data-full-text="${description.replace(/"/g, '&quot;')}"` : '';
            
            descriptionHtml = `<div class="${className}" ${dataAttr}>${displayText}</div>`;
        }
        
        titleCell.innerHTML = `
            <div class="page-title-editable" contenteditable="true" 
                 onblur="updatePageTitle('${page.id}', this.textContent)">
                ${page.title}
            </div>
            ${descriptionHtml}
        `;
        row.appendChild(titleCell);
        
        // Property cells
        Object.values(database.properties).forEach(prop => {
            const cell = document.createElement('div');
            cell.className = 'table-cell';
            
            const pageProp = page.properties[prop.id];
            if (pageProp) {
                cell.innerHTML = renderPropertyValue(pageProp, prop);
            } else {
                cell.innerHTML = '<span class="empty-property">-</span>';
            }
            
            row.appendChild(cell);
        });
        
        // Actions cell
        const actionsCell = document.createElement('div');
        actionsCell.className = 'table-cell table-cell-actions';
        actionsCell.innerHTML = `
            <button class="btn btn-sm btn-secondary" onclick="editPage('${page.id}')">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-danger" onclick="deletePage('${page.id}')">
                <i class="fas fa-trash"></i>
            </button>
        `;
        row.appendChild(actionsCell);
        
        tableBody.appendChild(row);
    });
}

// Page functions
function updatePageTitle(pageId, newTitle) {
    return fetch('/api/update_page', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            page_id: pageId,
            updates: {
                title: newTitle
            }
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Page title updated');
        }
    })
    .catch(error => {
        console.error('Error updating page title:', error);
    });
}

function editPage(pageId) {
    // Load page data and show edit modal
    fetch(`/api/get_page_data/${pageId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const page = data.page;
                showPageEditModal(page);
            }
        })
        .catch(error => {
            console.error('Error loading page data:', error);
        });
}

// Global Rich Text Editor and Modal Edit Functions

// Function to get rich text content - works with both selector strings and element IDs
function getRichTextContent(selectorOrId) {
    let element = null;
    
    if (typeof selectorOrId === 'string') {
        if (selectorOrId.startsWith('#')) {
            element = document.querySelector(selectorOrId);
        } else {
            element = document.getElementById(selectorOrId);
        }
    } else if (selectorOrId instanceof HTMLElement) {
        element = selectorOrId;
    }
    
    if (element) {
        // Check if it's a rich text editor with container
        const container = element.parentNode.querySelector('.rich-editor-container');
        if (container) {
            const contentDiv = container.querySelector('.rich-editor-content');
            if (contentDiv) {
                return contentDiv.innerHTML;
            }
        }
        // Fallback to textarea value
        return element.value || '';
    }
    return '';
}

// Function to set rich text content
function setRichTextContent(selectorOrId, content) {
    let element = null;
    
    if (typeof selectorOrId === 'string') {
        if (selectorOrId.startsWith('#')) {
            element = document.querySelector(selectorOrId);
        } else {
            element = document.getElementById(selectorOrId);
        }
    }
    
    if (element) {
        const container = element.parentNode.querySelector('.rich-editor-container');
        if (container) {
            const contentDiv = container.querySelector('.rich-editor-content');
            if (contentDiv) {
                contentDiv.innerHTML = content;
                return;
            }
        }
        element.value = content;
    }
}

// Fixed function to show page edit modal with proper rich text initialization
function showPageEditModal(page) {
    let propertiesHtml = '';
    Object.values(page.properties).forEach((prop, idx) => {
        if (prop.name === 'Description') {
            return; // Skip description here as it's handled separately in page view
        }
        
        if (prop.type === 'rich_text') {
            propertiesHtml += `
                <div class="form-group" data-property-id="${prop.id || 'prop_' + idx}" data-property-type="${prop.type}">
                    <label for="editProp_${idx}">${prop.name}</label>
                    <textarea id="editProp_${idx}" data-rich-text="true" data-placeholder="Edit ${prop.name.toLowerCase()}...">${prop.rich_text_content || prop.value || ''}</textarea>
                </div>
            `;
        } else {
            propertiesHtml += `
                <div class="form-group" data-property-id="${prop.id || 'prop_' + idx}" data-property-type="${prop.type}">
                    <label for="editProp_${idx}">${prop.name}</label>
                    <input type="text" id="editProp_${idx}" class="form-control" value="${prop.value || ''}" placeholder="Edit ${prop.name.toLowerCase()}...">
                </div>
            `;
        }
    });
    
    const modalContent = `
        <div class="form-group">
            <label for="editPageTitle">Page Title</label>
            <input type="text" id="editPageTitle" class="form-control" value="${page.title}">
        </div>
        ${propertiesHtml}
        <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="confirmEditPage('${page.id}')">Save Changes</button>
        </div>
    `;
    
    document.getElementById('modalTitle').textContent = 'Edit Page';
    document.getElementById('modalContent').innerHTML = modalContent;
    document.getElementById('modalOverlay').classList.add('active');
    
    // Initialize rich text editors for all rich_text fields with a longer delay
    setTimeout(() => {
        const richTextFields = document.querySelectorAll('textarea[data-rich-text="true"]');
        console.log('Found rich text fields:', richTextFields.length);
        richTextFields.forEach(el => {
            console.log('Initializing rich text editor for:', el.id);
            initRichTextEditor('#' + el.id, el.getAttribute('data-placeholder') || 'Edit...');
        });
    }, 300); // Increased delay to ensure modal is fully rendered
}

// Fixed function to confirm page edit with proper rich text handling
function confirmEditPage(pageId) {
    const newTitle = document.getElementById('editPageTitle').value;
    const modal = document.getElementById('modalContent');
    const formGroups = modal.querySelectorAll('.form-group[data-property-id]');
    const updates = { title: newTitle, properties: {} };
    
    formGroups.forEach((group) => {
        const propertyId = group.getAttribute('data-property-id');
        const propertyType = group.getAttribute('data-property-type');
        const label = group.querySelector('label');
        const propertyName = label ? label.textContent.replace(':', '').trim() : propertyId;
        
        if (propertyType === 'rich_text') {
            const textarea = group.querySelector('textarea[data-rich-text="true"]');
            if (textarea) {
                console.log('Processing rich text field:', textarea.id);
                const value = getRichTextContent(textarea.id);
                console.log('Rich text content retrieved:', value);
                updates.properties[propertyId] = {
                    name: propertyName,
                    type: 'rich_text',
                    value: '',
                    rich_text_content: value
                };
            }
        } else {
            const input = group.querySelector('input.form-control');
            if (input) {
                updates.properties[propertyId] = {
                    name: propertyName,
                    type: propertyType,
                    value: input.value
                };
            }
        }
    });
    
    console.log('Updates being sent:', updates);
    
    fetch('/api/update_page', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            page_id: pageId,
            updates: updates
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Page updated successfully');
            closeModal();
            // Reload the current database data if we're in a database view
            if (window.currentDatabaseId) {
                loadDatabaseData(window.currentDatabaseId);
            } else {
                location.reload();
            }
        } else {
            console.error('Update failed:', data);
            alert('Failed to update page: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error updating page:', error);
        alert('Error updating page');
    });
}

// Initialize rich text editor for modal (called after modal content is set)
function initRichTextEditorForModal() {
    const richTextFields = document.querySelectorAll('textarea[data-rich-text="true"]:not(.rich-text-initialized)');
    console.log('Initializing rich text editors for modal, found fields:', richTextFields.length);
    
    richTextFields.forEach(el => {
        const placeholder = el.getAttribute('data-placeholder') || 'Enter text...';
        console.log('Initializing rich text editor for:', el.id, 'with placeholder:', placeholder);
        initRichTextEditor('#' + el.id, placeholder);
        el.classList.add('rich-text-initialized');
    });
}

// Generic rich text editor initialization function
function initRichTextEditor(selector, placeholder = 'Enter text...') {
    let element;
    if (typeof selector === 'string') {
        element = selector.startsWith('#') ? document.querySelector(selector) : document.getElementById(selector);
    } else {
        element = selector;
    }
    
    if (!element || element.classList.contains('rich-text-initialized')) {
        return;
    }
    
    console.log('Initializing rich text editor for element:', element.id);
    
    // Get initial content
    const initialContent = element.value || '';
    
    // Create rich text editor container
    const container = document.createElement('div');
    container.className = 'rich-editor-container';
    
    // Create toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'rich-editor-toolbar';
    toolbar.innerHTML = `
        <button type="button" class="toolbar-btn" data-command="bold" title="Bold">
            <i class="fas fa-bold"></i>
        </button>
        <button type="button" class="toolbar-btn" data-command="italic" title="Italic">
            <i class="fas fa-italic"></i>
        </button>
        <button type="button" class="toolbar-btn" data-command="underline" title="Underline">
            <i class="fas fa-underline"></i>
        </button>
        <div class="toolbar-separator"></div>
        <button type="button" class="toolbar-btn" data-command="insertUnorderedList" title="Bullet List">
            <i class="fas fa-list-ul"></i>
        </button>
        <button type="button" class="toolbar-btn" data-command="insertOrderedList" title="Numbered List">
            <i class="fas fa-list-ol"></i>
        </button>
    `;
    
    // Create content area
    const content = document.createElement('div');
    content.className = 'rich-editor-content';
    content.contentEditable = true;
    content.innerHTML = initialContent || `<p>${placeholder}</p>`;
    
    // Add focus/blur handling for placeholder
    content.addEventListener('focus', () => {
        if (content.innerHTML === `<p>${placeholder}</p>`) {
            content.innerHTML = '<p></p>';
        }
    });
    
    content.addEventListener('blur', () => {
        if (content.innerHTML === '<p></p>' || content.innerHTML === '') {
            content.innerHTML = `<p>${placeholder}</p>`;
        }
        // Update the original textarea
        element.value = content.innerHTML;
    });
    
    // Handle input changes
    content.addEventListener('input', () => {
        element.value = content.innerHTML;
    });
    
    // Handle toolbar commands
    toolbar.addEventListener('click', (e) => {
        if (e.target.closest('.toolbar-btn')) {
            e.preventDefault();
            const command = e.target.closest('.toolbar-btn').dataset.command;
            document.execCommand(command, false, null);
            content.focus();
        }
    });
    
    // Assemble the editor
    container.appendChild(toolbar);
    container.appendChild(content);
    
    // Replace the textarea
    element.style.display = 'none';
    element.parentNode.insertBefore(container, element.nextSibling);
    element.classList.add('rich-text-initialized');
    
    console.log('Rich text editor initialized successfully for:', element.id);
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Close modal when clicking overlay
    document.getElementById('modalOverlay').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });
    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
            closeTaskSidebar();
        }
    });
    // Correct auto-save initialization syntax
    const inputs = document.querySelectorAll('input[type="text"], input[type="number"], textarea, select');
    inputs.forEach(function(input) {
        if (!input.classList.contains('ckeditor')) {
            input.addEventListener('input', function() {
                autoSaveFormInput(this);
            });
        }
    });
});

// Export functions for use in templates
window.showModal = showModal;
window.closeModal = closeModal;
window.closeTaskSidebar = closeTaskSidebar;
window.renderDatabaseTable = renderDatabaseTable;
window.updatePageTitle = updatePageTitle;
window.editPage = editPage;
window.renderCalendar = renderCalendar;
window.showTaskDetails = showTaskDetails;
window.toggleTaskCompletion = toggleTaskCompletion;
// Export viewPageDetails if defined
if (typeof viewPageDetails === 'function') {
    window.viewPageDetails = viewPageDetails;
}

// Fix getRichTextContent selector usage
function getRichTextContent(selector) {
    let element = null;
    if (typeof selector === 'string') {
        if (selector.startsWith('#')) {
            element = document.querySelector(selector);
        } else {
            element = document.getElementById(selector);
        }
    } else if (selector instanceof HTMLElement) {
        element = selector;
    }
    if (element) {
        const container = element.parentNode.querySelector('.rich-editor-container');
        if (container) {
            const contentDiv = container.querySelector('.rich-editor-content');
            if (contentDiv) {
                return contentDiv.innerHTML;
            }
        }
        return element.value || '';
    }
    return '';
}