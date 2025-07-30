// Global variables
let currentModalCallback = null;

// Modal functions
function showModal(title, content, callback) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalContent').innerHTML = content;
    document.getElementById('modalOverlay').classList.add('active');
    currentModalCallback = callback;
    if (typeof callback === 'function') {
        // Allow content to render before calling back
        setTimeout(callback, 50);
    }
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
        if (!(date instanceof Date) || isNaN(date.getTime())) {
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

// Page and Database functions
function openPage(pageId) {
    window.location.href = `/page/${pageId}`;
}

function savePage() {
    // Since we have auto-save, this can just be a manual trigger or confirmation
    showAutoSaveIndicator('Page saved successfully');
    
    const titleEl = document.getElementById('pageTitle');
    if (titleEl && typeof autoSavePageTitle === 'function') {
        autoSavePageTitle(titleEl.textContent);
    }

    const editorEl = document.getElementById('pageDescriptionContainer_editor');
    if (editorEl && typeof autoSavePageDescription === 'function') {
         const content = getRichTextContent('#pageDescriptionContainer_editor');
         autoSavePageDescription(content);
    }
}

function deletePage(pageId) {
    if (confirm('Are you sure you want to delete this page?')) {
        fetch('/api/delete_page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page_id: pageId })
        }).then(() => location.reload());
    }
}

function editPage(pageId) {
    fetch(`/api/get_page_data/${pageId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const page = data.page;
                fetch(`/api/get_database_data/${page.parent_database_id}`).then(res => res.json()).then(dbData => {
                    if (dbData.success) {
                        showPageEditModal(page, dbData.database);
                    }
                });
            }
        });
}

function showPageEditModal(page, database) {
    let propertiesHtml = '';
    Object.values(database.properties).forEach((propDef, idx) => {
        const propId = propDef.id;
        const pageProp = page.properties[propId] || { value: null, rich_text_content: null };

        if (propDef.type === 'date') {
            const value = pageProp.value || {};
            const isRepeating = typeof value === 'object' && value.repetition;
            const singleDate = isRepeating ? '' : (typeof value === 'object' ? value.start_date : value) || '';
            const singleStartTime = isRepeating ? '' : (value.start_time || '');
            const singleEndTime = isRepeating ? '' : (value.end_time || '');
            
            const repStartDate = isRepeating ? value.start_date || '' : '';
            const repStartTime = isRepeating ? value.start_time || '' : '';
            const repEndTime = isRepeating ? value.end_time || '' : '';
            const repEndDate = isRepeating ? (value.repetition_config && value.repetition_config.end_date) || '' : '';
            const repType = isRepeating ? value.repetition_type : 'daily';

            propertiesHtml += `
                <div class="form-group" data-property-id="${propId}" data-property-type="date">
                    <label>${propDef.name}</label>
                    <div id="editSingleDateContainer_${idx}" style="display:${isRepeating ? 'none' : 'block'};">
                        <div class="date-time-inputs">
                            <input type="date" id="editProp_${idx}" class="form-control" value="${singleDate}">
                            <input type="time" id="editPropStartTime_${idx}" class="form-control" value="${singleStartTime}">
                            <span>to</span>
                            <input type="time" id="editPropEndTime_${idx}" class="form-control" value="${singleEndTime}">
                        </div>
                    </div>
                    <div style="margin-top:8px;"><label><input type="checkbox" id="editRepetitionCheckbox_${idx}" onchange="toggleEditRepetitionOptions(${idx})" ${isRepeating ? 'checked' : ''}> Repetition</label></div>
                    <div id="editRepetitionOptions_${idx}" style="display:${isRepeating ? 'block' : 'none'}; border: 1px solid #444; padding: 10px; border-radius: 5px;">
                        <div class="form-group"><label>Start Date & Time</label><div class="date-time-inputs"><input type="date" id="editRepetitionStartDate_${idx}" class="form-control" value="${repStartDate}"><input type="time" id="editRepetitionStartTime_${idx}" class="form-control" value="${repStartTime}"><span>to</span><input type="time" id="editRepetitionEndTime_${idx}" class="form-control" value="${repEndTime}"></div></div>
                        <div class="form-group"><label>End Date (Optional)</label><input type="date" id="editRepetitionEndDate_${idx}" class="form-control" value="${repEndDate}"></div>
                        <div class="form-group"><label>Frequency</label><select id="editRepetitionType_${idx}" class="form-control" onchange="updateEditRepetitionOptions(${idx})"><option value="daily" ${repType === 'daily' ? 'selected' : ''}>Daily</option><option value="weekly" ${repType === 'weekly' ? 'selected' : ''}>Weekly</option><option value="monthly" ${repType === 'monthly' ? 'selected' : ''}>Monthly</option><option value="custom" ${repType === 'custom' ? 'selected' : ''}>Custom</option></select></div>
                    </div>
                </div>`;
        } else if (propDef.type === 'rich_text') {
            propertiesHtml += `<div class="form-group" data-property-id="${propId}" data-property-type="rich_text"><label for="editProp_${idx}">${propDef.name}</label><textarea id="editProp_${idx}" data-rich-text="true">${pageProp.rich_text_content || ''}</textarea></div>`;
        } else {
             propertiesHtml += `<div class="form-group" data-property-id="${propId}" data-property-type="${propDef.type}"><label for="editProp_${idx}">${propDef.name}</label><input type="text" id="editProp_${idx}" class="form-control" value="${pageProp.value || ''}"></div>`;
        }
    });

    const modalContent = `
        <div class="form-group"><label for="editPageTitle">Page Title</label><input type="text" id="editPageTitle" class="form-control" value="${page.title}"></div>
        ${propertiesHtml}
        <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="confirmEditPage('${page.id}', '${database.id}')">Save Changes</button>
        </div>`;
    showModal('Edit Page', modalContent, () => {
        initRichTextEditorForModal();
        document.querySelectorAll('[data-property-type="date"]').forEach(el => {
            const propId = el.dataset.propertyId;
            const idx = Object.keys(database.properties).findIndex(id => id === propId);
            if (idx !== -1) {
                toggleEditRepetitionOptions(idx);
            }
        });
    });
}

function toggleEditRepetitionOptions(idx) {
    const checkbox = document.getElementById(`editRepetitionCheckbox_${idx}`);
    document.getElementById(`editSingleDateContainer_${idx}`).style.display = checkbox.checked ? 'none' : 'block';
    document.getElementById(`editRepetitionOptions_${idx}`).style.display = checkbox.checked ? 'block' : 'none';
}

function confirmEditPage(pageId, databaseId) {
    const title = document.getElementById('editPageTitle').value;
    const updates = { title: title, properties: {} };

    fetch(`/api/get_database_data/${databaseId}`).then(res => res.json()).then(dbData => {
        if (!dbData.success) return;
        
        Object.values(dbData.database.properties).forEach((propDef, idx) => {
            const propId = propDef.id;
            if (propDef.type === 'date') {
                const isRepeating = document.getElementById(`editRepetitionCheckbox_${idx}`).checked;
                let value = {};
                if (isRepeating) {
                    const startDate = document.getElementById(`editRepetitionStartDate_${idx}`).value;
                    if (!startDate) return;
                    value = {
                        start_date: startDate,
                        start_time: document.getElementById(`editRepetitionStartTime_${idx}`).value || null,
                        end_time: document.getElementById(`editRepetitionEndTime_${idx}`).value || null,
                        repetition: true,
                        repetition_type: document.getElementById(`editRepetitionType_${idx}`).value,
                        repetition_config: { end_date: document.getElementById(`editRepetitionEndDate_${idx}`).value || null }
                    };
                } else {
                    const singleDate = document.getElementById(`editProp_${idx}`).value;
                    if (!singleDate) return;
                    value = {
                        start_date: singleDate,
                        end_date: singleDate,
                        start_time: document.getElementById(`editPropStartTime_${idx}`).value || null,
                        end_time: document.getElementById(`editPropEndTime_${idx}`).value || null,
                        repetition: false
                    };
                }
                updates.properties[propId] = { name: propDef.name, type: 'date', value: value };
            } else if (propDef.type === 'rich_text') {
                updates.properties[propId] = { name: propDef.name, type: 'rich_text', value: '', rich_text_content: getRichTextContent(`editProp_${idx}`) };
            } else {
                updates.properties[propId] = { name: propDef.name, type: propDef.type, value: document.getElementById(`editProp_${idx}`).value };
            }
        });

        fetch('/api/update_page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page_id: pageId, updates: updates })
        }).then(res => res.json()).then(data => {
            if (data.success) {
                closeModal();
                if (window.location.pathname.includes('/calendar')) {
                    location.reload();
                } else {
                    loadDatabaseData(databaseId);
                }
            } else {
                alert('Error updating page: ' + data.error);
            }
        });
    });
}

function editDatabase(databaseId) {
    fetch(`/api/get_database_data/${databaseId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showEditDatabaseModal(data.database);
            } else {
                alert('Error fetching database data: ' + data.error);
            }
        });
}

function showEditDatabaseModal(database) {
    let propertiesHtml = '';
    Object.values(database.properties).forEach((prop, index) => {
        propertiesHtml += `
            <div class="property-item" data-property-id="${prop.id}">
                <input type="text" class="form-control property-name" value="${prop.name}">
                <select class="form-control property-type" disabled>
                    <option value="text" ${prop.type === 'text' ? 'selected' : ''}>Text</option>
                    <option value="rich_text" ${prop.type === 'rich_text' ? 'selected' : ''}>Rich Text</option>
                    <option value="date" ${prop.type === 'date' ? 'selected' : ''}>Date</option>
                    <option value="select" ${prop.type === 'select' ? 'selected' : ''}>Select</option>
                    <option value="status" ${prop.type === 'status' ? 'selected' : ''}>Status</option>
                    <option value="number" ${prop.type === 'number' ? 'selected' : ''}>Number</option>
                </select>
                <button type="button" class="btn btn-sm btn-danger" onclick="removeProperty(this)">Remove</button>
            </div>
        `;
    });

    const modalContent = `
        <div class="form-group">
            <label for="modalDatabaseName">Database Name</label>
            <input type="text" id="modalDatabaseName" class="form-control" value="${database.name}">
        </div>
        <div class="form-group">
            <label>Properties</label>
            <div id="modalPropertiesList">
                ${propertiesHtml}
            </div>
            <button type="button" class="btn btn-sm btn-secondary" onclick="addProperty()">Add Property</button>
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="confirmEditDatabase('${database.id}')">Save Changes</button>
            <button type="button" class="btn btn-danger" style="float: left;" onclick="deleteDatabase('${database.id}')">Delete Database</button>
        </div>
    `;
    showModal('Edit Database', modalContent);
}

function confirmEditDatabase(databaseId) {
    const name = document.getElementById('modalDatabaseName').value.trim();
    if (!name) {
        alert('Please enter a database name');
        return;
    }
    
    const properties = {};
    document.querySelectorAll('#modalPropertiesList .property-item').forEach((item, index) => {
        const propName = item.querySelector('.property-name').value;
        const propType = item.querySelector('.property-type').value;
        const propId = item.dataset.propertyId || `new_prop_${Date.now()}_${index}`;
        if (propName) {
            properties[propId] = { id: propId, name: propName, type: propType, options: [] };
        }
    });
    
    fetch('/api/update_database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database_id: databaseId, name: name, properties: properties })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            location.reload();
        } else {
            alert('Error updating database: ' + data.error);
        }
    });
    closeModal();
}

function deleteDatabase(databaseId) {
    if (confirm('Are you sure you want to delete this database and all its pages? This action cannot be undone.')) {
        fetch('/api/delete_database', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ database_id: databaseId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = '/';
            } else {
                alert('Error deleting database: ' + data.error);
            }
        });
    }
}

function addProperty() {
    const list = document.getElementById('modalPropertiesList');
    const item = document.createElement('div');
    item.className = 'property-item';
    item.innerHTML = `
        <input type="text" class="form-control property-name" placeholder="Property name">
        <select class="form-control property-type">
            <option value="text">Text</option>
            <option value="rich_text">Rich Text</option>
            <option value="date">Date</option>
            <option value="select">Select</option>
            <option value="status">Status</option>
            <option value="number">Number</option>
        </select>
        <button type="button" class="btn btn-sm btn-danger" onclick="removeProperty(this)">Remove</button>
    `;
    list.appendChild(item);
}

function removeProperty(button) {
    button.parentElement.remove();
}


// Rich Text Editor initialization
function initRichTextEditorForModal() {
    const richTextFields = document.querySelectorAll('.modal-overlay.active textarea[data-rich-text="true"]');
    richTextFields.forEach(el => {
        if (!el.classList.contains('rich-text-initialized')) {
            el.classList.add('rich-text-initialized');
        }
    });
}

function getRichTextContent(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('modalOverlay').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
            closeTaskSidebar();
        }
    });
});

// Export functions for use in templates
window.showModal = showModal;
window.closeModal = closeModal;
window.closeTaskSidebar = closeTaskSidebar;
window.editPage = editPage;
window.openPage = openPage;
window.deletePage = deletePage;
window.savePage = savePage;
window.editDatabase = editDatabase;
window.deleteDatabase = deleteDatabase;
window.addProperty = addProperty;
window.removeProperty = removeProperty;
window.renderPropertyInput = (property, index) => {
    const inputId = `modalProp_${index}`;
    switch (property.type) {
        case 'text': return `<input type="text" id="${inputId}" class="form-control">`;
        case 'number': return `<input type="number" id="${inputId}" class="form-control">`;
        case 'rich_text': return `<textarea id="${inputId}" data-rich-text="true"></textarea>`;
        default: return `<input type="text" id="${inputId}" class="form-control">`;
    }
};

// Functions for page.html to call
if (typeof loadDatabaseData !== 'function') {
    window.loadDatabaseData = (databaseId) => {
        fetch(`/api/get_database_data/${databaseId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    renderDatabaseTable(databaseId, data.pages, data.database);
                }
            });
    };
}

if (typeof renderDatabaseTable !== 'function') {
    window.renderDatabaseTable = (databaseId, pages, database) => {
        const tableBody = document.getElementById(`databaseBody_${databaseId}`);
        if (!tableBody) return;
        tableBody.innerHTML = '';
        pages.forEach(page => {
            const row = document.createElement('div');
            row.className = 'database-table-row';
            row.setAttribute('data-page-id', page.id);
            let propertiesHtml = '';
            Object.values(database.properties).forEach(propDef => {
                const pageProp = page.properties[propDef.id];
                let value = '-';
                if(pageProp) {
                    if(propDef.type === 'date' && typeof pageProp.value === 'object' && pageProp.value) {
                        value = pageProp.value.start_date || '';
                         if(pageProp.value.start_time) {
                            value += ` ${pageProp.value.start_time}`;
                        }
                    } else if (propDef.type === 'rich_text') {
                         value = pageProp.rich_text_content ? pageProp.rich_text_content.substring(0, 50) + '...' : '-';
                    }
                    else {
                        value = pageProp.value || '-';
                    }
                }
                propertiesHtml += `<div class="table-cell">${value}</div>`;
            });
            const description = page.properties.description ? (page.properties.description.rich_text_content || '').substring(0,50) + '...' : '-';
            row.innerHTML = `
                <div class="table-cell table-cell-title">${page.title}</div>
                <div class="table-cell">${description}</div>
                ${propertiesHtml}
                <div class="table-cell table-cell-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editPage('${page.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-primary" onclick="openPage('${page.id}')"><i class="fas fa-external-link-alt"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deletePage('${page.id}')"><i class="fas fa-trash"></i></button>
                </div>
            `;
            tableBody.appendChild(row);
        });
    };
}
