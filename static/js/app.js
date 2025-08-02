// static/js/app.js

// =================================================================================
// GLOBAL VARIABLES & STATE
// =================================================================================
let currentModalCallback = null;
window.currentPageId = null; // Set by page.html template
window.currentDatabaseId = null; // Set dynamically
let currentNotePath = null; // Global variable to track the currently open note
let noteEditorInstance = null; // Store the single note editor instance

// =================================================================================
// MODAL DIALOG FUNCTIONS
// =================================================================================
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

// =================================================================================
// TASK SIDEBAR (from Calendar)
// =================================================================================
function closeTaskSidebar() {
    const sidebar = document.getElementById('taskSidebar');
    if (sidebar) {
        sidebar.classList.remove('active');
    }
}

// =================================================================================
// PAGE & DATABASE LOADING/RENDERING
// =================================================================================

function loadAllDatabases() {
    const databaseElements = document.querySelectorAll('.database-container');
    databaseElements.forEach(dbElement => {
        const databaseId = dbElement.dataset.databaseId;
        if (databaseId) {
            loadDatabaseData(databaseId);
        }
    });
}

function loadDatabaseData(databaseId) {
    fetch(`/api/get_database_data/${databaseId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderDatabaseTable(databaseId, data.pages, data.database);
            } else {
                console.error(`Failed to load data for database ${databaseId}:`, data.error);
            }
        });
}

function renderDatabaseTable(databaseId, pages, database) {
    const tableBody = document.getElementById(`databaseBody_${databaseId}`);
    if (!tableBody) return;

    // Dynamically build the header to match the columns
    const headerRow = tableBody.previousElementSibling; // The .database-table-header
    const gridTemplateColumns = `minmax(250px, 2fr) 200px repeat(${Object.keys(database.properties).length}, minmax(150px, 1fr)) 120px`;

    if(headerRow) {
        let headerHTML = `<div class="table-cell table-cell-title">Title</div><div class="table-cell">Description</div>`;
        Object.values(database.properties).forEach(propDef => {
            headerHTML += `<div class="table-cell">${propDef.name}</div>`;
        });
        headerHTML += `<div class="table-cell table-cell-actions">Actions</div>`;
        headerRow.innerHTML = headerHTML;
        headerRow.style.gridTemplateColumns = gridTemplateColumns;
    }

    tableBody.innerHTML = '';
    pages.forEach(page => {
        const row = document.createElement('div');
        row.className = 'database-table-row';
        row.setAttribute('data-page-id', page.id);
        row.style.gridTemplateColumns = gridTemplateColumns; // Match header columns

        // Get description
        const descriptionProp = page.properties.description;
        let descriptionText = '-';
        if (descriptionProp && descriptionProp.rich_text_content) {
            const plainText = descriptionProp.rich_text_content.replace(/<[^>]*>/g, ''); // Strip HTML for a clean preview
            descriptionText = plainText.substring(0, 50) + (plainText.length > 50 ? '...' : '');
        }

        let rowHTML = `
            <div class="table-cell table-cell-title" onclick="openPage('${page.id}')" style="cursor: pointer;">${page.title}</div>
            <div class="table-cell">${descriptionText}</div>
        `;

        Object.values(database.properties).forEach(propDef => {
            const pageProp = page.properties[propDef.id];
            let value = '-';
            if (pageProp) {
                if (propDef.type === 'date' && typeof pageProp.value === 'object' && pageProp.value) {
                    value = pageProp.value.start_date || '';
                    if (pageProp.value.start_time) {
                        value += ` ${pageProp.value.start_time}`;
                    }
                } else if (propDef.type === 'rich_text') {
                    const content = pageProp.rich_text_content || '';
                    const plainText = content.replace(/<[^>]*>/g, ''); // Strip HTML for a clean preview
                    value = plainText.substring(0, 50) + (plainText.length > 50 ? '...' : '');
                } else if (propDef.type === 'select') {
                    const selectedOption = propDef.options.find(opt => opt.id === pageProp.value);
                    if(selectedOption){
                        value = `<span class="property-tag" style="background-color:${selectedOption.color};">${selectedOption.name}</span>`;
                    } else {
                        value = '-';
                    }
                }
                else {
                    value = pageProp.value || '-';
                }
            }
            rowHTML += `<div class="table-cell">${value}</div>`;
        });

        rowHTML += `
            <div class="table-cell table-cell-actions">
                <button class="btn btn-sm btn-secondary" onclick="editPage('${page.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-primary" onclick="openPage('${page.id}')" title="Open Page"><i class="fas fa-external-link-alt"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deletePage('${page.id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        `;

        row.innerHTML = rowHTML;
        tableBody.appendChild(row);
    });
}


// =================================================================================
// PAGE ACTIONS
// =================================================================================
function openPage(pageId) {
    window.location.href = `/page/${pageId}`;
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
                if (!page.parent_database_id) {
                    alert("This page doesn't belong to a database and cannot be edited this way.");
                    return;
                }
                fetch(`/api/get_database_data/${page.parent_database_id}`).then(res => res.json()).then(dbData => {
                    if (dbData.success) {
                        showPageEditModal(page, dbData.database);
                    } else {
                        alert('Error fetching parent database data.');
                    }
                });
            }
        });
}

function showPageEditModal(page, database) {
    let propertiesHtml = '';
    const propDefs = Object.values(database.properties);
    const descriptionContent = page.properties.description ? page.properties.description.rich_text_content || '' : '';

    propDefs.forEach((propDef, idx) => {
        const propId = propDef.id;
        const pageProp = page.properties[propId] || { value: null, rich_text_content: null };
        const uniqueId = `${propId}_${idx}`; // Create a more unique ID for elements

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
                    <div id="editSingleDateContainer_${uniqueId}" style="display:${isRepeating ? 'none' : 'block'};">
                        <div class="date-time-inputs">
                            <input type="date" id="editProp_${uniqueId}" class="form-control" value="${singleDate}">
                            <input type="time" id="editPropStartTime_${uniqueId}" class="form-control" value="${singleStartTime}">
                            <span>to</span>
                            <input type="time" id="editPropEndTime_${uniqueId}" class="form-control" value="${singleEndTime}">
                        </div>
                    </div>
                    <div style="margin-top:8px;"><label><input type="checkbox" id="editRepetitionCheckbox_${uniqueId}" onchange="toggleEditRepetitionOptions('${uniqueId}')" ${isRepeating ? 'checked' : ''}> Repetition</label></div>
                    <div id="editRepetitionOptions_${uniqueId}" style="display:${isRepeating ? 'block' : 'none'}; border: 1px solid #444; padding: 10px; border-radius: 5px;">
                        <div class="form-group"><label>Start Date & Time</label><div class="date-time-inputs"><input type="date" id="editRepetitionStartDate_${uniqueId}" class="form-control" value="${repStartDate}"><input type="time" id="editRepetitionStartTime_${uniqueId}" class="form-control" value="${repStartTime}"><span>to</span><input type="time" id="editRepetitionEndTime_${uniqueId}" class="form-control" value="${repEndTime}"></div></div>
                        <div class="form-group"><label>End Date (Optional)</label><input type="date" id="editRepetitionEndDate_${uniqueId}" class="form-control" value="${repEndDate}"></div>
                        <div class="form-group"><label>Frequency</label><select id="editRepetitionType_${uniqueId}" class="form-control"><option value="daily" ${repType === 'daily' ? 'selected' : ''}>Daily</option><option value="weekly" ${repType === 'weekly' ? 'selected' : ''}>Weekly</option><option value="monthly" ${repType === 'monthly' ? 'selected' : ''}>Monthly</option><option value="custom" ${repType === 'custom' ? 'selected' : ''}>Custom</option></select></div>
                    </div>
                </div>`;
        } else if (propDef.type === 'rich_text') {
            propertiesHtml += `<div class="form-group" data-property-id="${propId}" data-property-type="rich_text"><label for="editProp_${uniqueId}">${propDef.name}</label><textarea id="editProp_${uniqueId}" data-rich-text="true">${pageProp.rich_text_content || ''}</textarea></div>`;
        } else if (propDef.type === 'select') {
            let optionsHtml = '<option value="">-- Select --</option>';
            propDef.options.forEach(opt => {
                optionsHtml += `<option value="${opt.id}" ${pageProp.value === opt.id ? 'selected' : ''}>${opt.name}</option>`;
            });
            propertiesHtml += `
                <div class="form-group" data-property-id="${propId}" data-property-type="select">
                    <label for="editProp_${uniqueId}">${propDef.name}</label>
                    <select id="editProp_${uniqueId}" class="form-control">${optionsHtml}</select>
                </div>
            `;
        }
        else {
             propertiesHtml += `<div class="form-group" data-property-id="${propId}" data-property-type="${propDef.type}"><label for="editProp_${uniqueId}">${propDef.name}</label><input type="text" id="editProp_${uniqueId}" class="form-control" value="${pageProp.value || ''}"></div>`;
        }
    });

    const modalContent = `
        <div class="form-group"><label for="editPageTitle">Page Title</label><input type="text" id="editPageTitle" class="form-control" value="${page.title}"></div>
        <div class="form-group"><label for="editPageDescription">Description</label><textarea id="editPageDescription" data-rich-text="true">${descriptionContent}</textarea></div>
        ${propertiesHtml}
        <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="confirmEditPage('${page.id}', '${database.id}')">Save Changes</button>
        </div>`;
    showModal('Edit Page', modalContent, () => {
        initRichTextEditorForModal();
        propDefs.forEach((propDef, idx) => {
            if (propDef.type === 'date') {
                const uniqueId = `${propDef.id}_${idx}`;
                toggleEditRepetitionOptions(uniqueId);
            }
        });
    });
}

function initRichTextEditorForModal() {
    // Only initialize editors for elements that don't already have them
    document.querySelectorAll('textarea[data-rich-text="true"]').forEach(textarea => {
        if (!textarea.dataset.editorInitialized && window.RichTextEditor) {
            try {
                const editor = new RichTextEditor(textarea, {
                    placeholder: textarea.dataset.placeholder || 'Enter text...',
                    height: '200px'
                });
                textarea.dataset.editorInitialized = 'true';
            } catch (error) {
                console.error('Error initializing modal rich text editor:', error);
            }
        }
    });
}

function getRichTextContent(selector) {
    const element = document.querySelector(selector);
    if (!element) return '';
    
    // If it's a rich text editor, try to get content from it
    if (element.dataset.editorInitialized === 'true') {
        // Try to find the editor instance - this is editor-specific
        // You might need to adjust this based on your RichTextEditor implementation
        try {
            // Common method names for getting content
            if (element.editor && typeof element.editor.getContent === 'function') {
                return element.editor.getContent();
            } else if (element.value !== undefined) {
                return element.value;
            }
        } catch (error) {
            console.warn('Error getting rich text content:', error);
        }
    }
    
    // Fallback to textarea value or innerHTML
    return element.value || element.innerHTML || '';
}

function confirmEditPage(pageId, databaseId) {
    const title = document.getElementById('editPageTitle').value;
    const description = getRichTextContent('#editPageDescription');
    const updates = { 
        title: title, 
        properties: {
            description: { 
                name: 'Description', 
                type: 'rich_text', 
                value: '', 
                rich_text_content: description 
            }
        } 
    };

    document.querySelectorAll('.form-group[data-property-id]').forEach(propEl => {
        const propId = propEl.dataset.propertyId;
        const propType = propEl.dataset.propertyType;
        const propNameEl = propEl.querySelector('label');
        if (!propNameEl) return;
        const propName = propNameEl.textContent;
        const uniqueIdMatch = (propEl.innerHTML.match(/id="[^"]*?(_[^"]+)"/) || [])[1];
        if (!uniqueIdMatch) return;
        const uniqueId = propId + '_' + (propEl.querySelector('[id^=editProp_]')?.id.split('_').pop() || '0');


        if (propType === 'date') {
            const isRepeating = document.getElementById(`editRepetitionCheckbox_${uniqueId}`).checked;
            let value = {};
            if (isRepeating) {
                const startDate = document.getElementById(`editRepetitionStartDate_${uniqueId}`).value;
                if (!startDate) return; // continue to next property
                value = {
                    start_date: startDate,
                    start_time: document.getElementById(`editRepetitionStartTime_${uniqueId}`).value || null,
                    end_time: document.getElementById(`editRepetitionEndTime_${uniqueId}`).value || null,
                    repetition: true,
                    repetition_type: document.getElementById(`editRepetitionType_${uniqueId}`).value,
                    repetition_config: { end_date: document.getElementById(`editRepetitionEndDate_${uniqueId}`).value || null }
                };
            } else {
                const singleDate = document.getElementById(`editProp_${uniqueId}`).value;
                if (!singleDate) return; // continue to next property
                value = {
                    start_date: singleDate,
                    end_date: singleDate,
                    start_time: document.getElementById(`editPropStartTime_${uniqueId}`).value || null,
                    end_time: document.getElementById(`editPropEndTime_${uniqueId}`).value || null,
                    repetition: false
                };
            }
            updates.properties[propId] = { name: propName, type: 'date', value: value };
        } else if (propType === 'rich_text') {
            updates.properties[propId] = { name: propName, type: 'rich_text', value: '', rich_text_content: getRichTextContent(`#editProp_${uniqueId}`) };
        } else {
            updates.properties[propId] = { name: propName, type: propType, value: document.getElementById(`editProp_${uniqueId}`).value };
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
}

function toggleEditRepetitionOptions(uniqueId) {
    const checkbox = document.getElementById(`editRepetitionCheckbox_${uniqueId}`);
    if (checkbox) {
        document.getElementById(`editSingleDateContainer_${uniqueId}`).style.display = checkbox.checked ? 'none' : 'block';
        document.getElementById(`editRepetitionOptions_${uniqueId}`).style.display = checkbox.checked ? 'block' : 'none';
    }
}


// =================================================================================
// DATABASE ACTIONS
// =================================================================================
function addDatabase() {
    const modalContent = `
        <div class="form-group">
            <label for="modalDatabaseName">Database Name</label>
            <input type="text" id="modalDatabaseName" class="form-control" placeholder="Enter database name">
        </div>
        <div class="form-group">
            <label>Properties</label>
            <div id="modalPropertiesList">
                <div class="property-item">
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
                </div>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" onclick="addProperty()">Add Property</button>
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="confirmCreateDatabase()">Create Database</button>
        </div>
    `;
    showModal('Create Database', modalContent);
}

function confirmCreateDatabase() {
    const name = document.getElementById('modalDatabaseName').value.trim();
    if (!name) {
        alert('Please enter a database name');
        return;
    }
    
    const properties = {};
    document.querySelectorAll('#modalPropertiesList .property-item').forEach((item, index) => {
        const propName = item.querySelector('.property-name').value;
        const propType = item.querySelector('.property-type').value;
        if (propName) {
            properties[`prop_${Date.now()}_${index}`] = { name: propName, type: propType };
        }
    });
    
    fetch('/api/create_database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: window.currentPageId, name: name, properties: properties })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            location.reload();
        } else {
            alert('Error creating database: ' + data.error);
        }
    });
    closeModal();
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
    Object.values(database.properties).forEach((prop) => {
        let optionsHtml = '';
        if (prop.type === 'select') {
            optionsHtml = '<div class="select-options-editor">';
            prop.options.forEach(opt => {
                optionsHtml += `
                    <div class="select-option-item" data-option-id="${opt.id}">
                        <input type="text" class="form-control option-name" value="${opt.name}">
                        <input type="color" class="form-control option-color" value="${opt.color}">
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeSelectOption(this)">Remove</button>
                    </div>
                `;
            });
            optionsHtml += '</div><button type="button" class="btn btn-sm btn-secondary" onclick="addSelectOption(this)">Add Option</button>';
        }

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
                ${optionsHtml}
            </div>
        `;
    });

    const modalContent = `
        <div class="form-group">
            <label for="modalDatabaseName">Database Name</label>
            <input type="text" id="modalDatabaseName" class="form-control" value="${database.name}">
        </div>
        <div class="form-group">
            <label for="modalDatabaseColor">Color</label>
            <input type="color" id="modalDatabaseColor" class="form-control form-control-color" value="${database.color || '#3b82f6'}">
        </div>
        <div class="form-group">
            <label>Properties</label>
            <div id="modalPropertiesList">${propertiesHtml}</div>
            <button type="button" class="btn btn-sm btn-secondary" onclick="addProperty()">Add Property</button>
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="confirmEditDatabase('${database.id}')">Save Changes</button>
            <button type="button" class="btn btn-danger" style="margin-right: auto;" onclick="deleteDatabase('${database.id}')">Delete Database</button>
        </div>
    `;
    showModal('Edit Database', modalContent);
}

function confirmEditDatabase(databaseId) {
    const name = document.getElementById('modalDatabaseName').value.trim();
    const color = document.getElementById('modalDatabaseColor').value;
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
            const propData = { id: propId, name: propName, type: propType, options: [] };
            if (propType === 'select') {
                item.querySelectorAll('.select-option-item').forEach(optItem => {
                    const optionName = optItem.querySelector('.option-name').value;
                    const optionColor = optItem.querySelector('.option-color').value;
                    const optionId = optItem.dataset.optionId || `new_opt_${Date.now()}`;
                    if (optionName) {
                        propData.options.push({id: optionId, name: optionName, color: optionColor});
                    }
                });
            }
            properties[propId] = propData;
        }
    });
    
    fetch('/api/update_database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database_id: databaseId, name: name, properties: properties, color: color })
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

function addSelectOption(button) {
    const editor = button.previousElementSibling;
    const item = document.createElement('div');
    item.className = 'select-option-item';
    item.innerHTML = `
        <input type="text" class="form-control option-name" placeholder="Option name">
        <input type="color" class="form-control option-color" value="#808080">
        <button type="button" class="btn btn-sm btn-danger" onclick="removeSelectOption(this)">Remove</button>
    `;
    editor.appendChild(item);
}

function removeSelectOption(button) {
    button.parentElement.remove();
}

// =================================================================================
// ADDING PAGES TO A DATABASE
// =================================================================================

function addPageToDatabase(databaseId) {
    fetch(`/api/get_database_data/${databaseId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showAddPageModal(databaseId, data.database);
            }
        });
}

function renderPropertyInput(property, index) {
    const inputId = `modalProp_${index}`;
    switch (property.type) {
        case 'text': return `<input type="text" id="${inputId}" class="form-control">`;
        case 'number': return `<input type="number" id="${inputId}" class="form-control">`;
        case 'rich_text': return `<textarea id="${inputId}" data-rich-text="true"></textarea>`;
        case 'select': {
            let optionsHtml = '<option value="">-- Select --</option>';
            property.options.forEach(opt => {
                optionsHtml += `<option value="${opt.id}">${opt.name}</option>`;
            });
            return `<select id="${inputId}" class="form-control">${optionsHtml}</select>`;
        }
        default: return `<input type="text" id="${inputId}" class="form-control">`;
    }
};

function showAddPageModal(databaseId, database) {
    let propertiesHtml = '';
    let dateProp = null;
    let datePropIndex = -1;

    Object.values(database.properties).forEach((prop, index) => {
        if (prop.type === 'date' && !dateProp) {
            dateProp = prop;
            datePropIndex = index;
        } else {
            propertiesHtml += `
                <div class="form-group">
                    <label for="modalProp_${index}">${prop.name}</label>
                    ${renderPropertyInput(prop, index)}
                </div>
            `;
        }
    });

    let dateRepetitionHtml = '';
    if (dateProp) {
        dateRepetitionHtml = `
            <div class="form-group">
                <label>${dateProp.name}</label>
                <div id="singleDateContainer">
                    <div class="date-time-inputs">
                        <input type="date" id="modalDate" class="form-control">
                        <input type="time" id="modalStartTime" class="form-control" placeholder="Start time">
                        <span>to</span>
                        <input type="time" id="modalEndTime" class="form-control" placeholder="End time">
                    </div>
                    <small class="form-text">Leave times empty for an all-day event.</small>
                </div>
                <div style="margin-top:8px;">
                    <label><input type="checkbox" id="repetitionCheckbox" onchange="toggleRepetitionOptions()"> Repetition</label>
                </div>
            </div>
            <div id="repetitionOptions" style="display:none; margin-bottom: 12px; border: 1px solid #444; padding: 10px; border-radius: 5px;">
                <div class="form-group"><label>Start Date & Time</label><div class="date-time-inputs"><input type="date" id="repetitionStartDate" class="form-control"><input type="time" id="repetitionStartTime" class="form-control"><span>to</span><input type="time" id="repetitionEndTime" class="form-control"></div></div>
                <div class="form-group"><label>End Date (Optional)</label><input type="date" id="repetitionEndDate" class="form-control"></div>
                <div class="form-group"><label>Frequency</label><select id="repetitionType" class="form-control" onchange="updateRepetitionOptions()"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select></div>
                <div id="dailyOptions" style="display:none"><label>Every <input type="number" id="dailyInterval" value="1" min="1" class="form-control" style="width:70px; display:inline-block;"> day(s)</label></div>
                <div id="weeklyOptions" style="display:none"><label>Every <input type="number" id="weeklyInterval" value="1" min="1" class="form-control" style="width:70px; display:inline-block;"> week(s) on:</label><div id="weeklyDaysCheckboxes" style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, i) => `<label><input type="checkbox" value="${i}"> ${day}</label>`).join('')}</div></div>
                <div id="monthlyOptions" style="display:none"><label>Every <input type="number" id="monthlyInterval" value="1" min="1" class="form-control" style="width:70px; display:inline-block;"> month(s) on day <input type="number" id="monthlyDay" value="1" min="1" max="31" class="form-control" style="width:70px; display:inline-block;"></label></div>
                <div id="customOptions" style="display:none"><label>Every <input type="number" id="customInterval" value="1" min="1" class="form-control" style="width:70px; display:inline-block;"> week(s) on:</label><div id="customDaysCheckboxes" style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, i) => `<label><input type="checkbox" value="${i}"> ${day}</label>`).join('')}</div></div>
            </div>
        `;
    }

    const modalContent = `
        <div class="form-group">
            <label for="modalPageTitle">Page Title</label>
            <input type="text" id="modalPageTitle" class="form-control" placeholder="Enter page title">
        </div>
        <div class="form-group">
            <label for="modalPageDescription">Description</label>
            <textarea id="modalPageDescription" data-rich-text="true" data-placeholder="Enter description..."></textarea>
        </div>
        ${dateRepetitionHtml}
        ${propertiesHtml}
        <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="confirmCreatePage('${databaseId}', ${datePropIndex})">Create Page</button>
        </div>
    `;
    showModal('Add Page', modalContent, () => {
        initRichTextEditorForModal();
        updateRepetitionOptions();
    });
}

function confirmCreatePage(databaseId, datePropIndex) {
    const title = document.getElementById('modalPageTitle').value;
    if (!title.trim()) {
        alert('Please enter a page title');
        return;
    }

    fetch(`/api/get_database_data/${databaseId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const database = data.database;
                const properties = {};
                
                Object.values(database.properties).forEach((prop, index) => {
                    if (index === datePropIndex) return;
                    const inputElement = document.getElementById(`modalProp_${index}`);
                    if (inputElement) {
                        let value = prop.type === 'rich_text' ? getRichTextContent(`#modalProp_${index}`) : inputElement.value;
                        if (value) {
                            properties[prop.id] = { name: prop.name, type: prop.type, value: prop.type === 'rich_text' ? '' : value, rich_text_content: prop.type === 'rich_text' ? value : null };
                        }
                    }
                });

                if (datePropIndex !== -1) {
                    const datePropId = Object.keys(database.properties)[datePropIndex];
                    const datePropName = Object.values(database.properties)[datePropIndex].name;
                    const repetitionChecked = document.getElementById('repetitionCheckbox').checked;

                    let dateValue = {};
                    if (!repetitionChecked) {
                        const singleDate = document.getElementById('modalDate').value;
                        if (singleDate) {
                            dateValue = { start_date: singleDate, end_date: singleDate, start_time: document.getElementById('modalStartTime').value || null, end_time: document.getElementById('modalEndTime').value || null, repetition: false };
                        }
                    } else {
                        const startDate = document.getElementById('repetitionStartDate').value;
                        if (!startDate) { alert('Please select a start date for repetition.'); return; }
                        const repetitionType = document.getElementById('repetitionType').value;
                        dateValue = { start_date: startDate, start_time: document.getElementById('repetitionStartTime').value || null, end_time: document.getElementById('repetitionEndTime').value || null, repetition: true, repetition_type: repetitionType, repetition_config: { end_date: document.getElementById('repetitionEndDate').value || null } };
                        if (repetitionType === 'daily') {
                            dateValue.repetition_config.interval = parseInt(document.getElementById('dailyInterval').value) || 1;
                        } else if (repetitionType === 'weekly' || repetitionType === 'custom') {
                            const interval = parseInt(document.getElementById(`${repetitionType}Interval`).value) || 1;
                            const daysChecked = Array.from(document.querySelectorAll(`#${repetitionType}DaysCheckboxes input:checked`)).map(cb => parseInt(cb.value));
                            if (daysChecked.length === 0) { alert('Please select at least one day of the week.'); return; }
                            dateValue.repetition_config.interval = interval;
                            dateValue.repetition_config.days_of_week = daysChecked;
                        } else if (repetitionType === 'monthly') {
                            dateValue.repetition_config.interval = parseInt(document.getElementById('monthlyInterval').value) || 1;
                            dateValue.repetition_config.day_of_month = parseInt(document.getElementById('monthlyDay').value) || 1;
                        }
                    }
                    if (dateValue.start_date) {
                         properties[datePropId] = { name: datePropName, type: 'date', value: dateValue };
                    }
                }

                const descriptionContent = getRichTextContent('#modalPageDescription');
                if (descriptionContent && descriptionContent.trim()) {
                    properties['description'] = { name: 'Description', type: 'rich_text', value: '', rich_text_content: descriptionContent };
                }

                createPageWithProperties(databaseId, title, properties);
            }
        });
    
    closeModal();
}

function createPageWithProperties(databaseId, title, properties) {
    fetch('/api/create_page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database_id: databaseId, title: title, properties: properties })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadDatabaseData(databaseId);
        } else {
            alert('Error creating page: ' + data.error);
        }
    });
}

function toggleRepetitionOptions() {
    const checkbox = document.getElementById('repetitionCheckbox');
    const singleDateContainer = document.getElementById('singleDateContainer');
    const repetitionOptions = document.getElementById('repetitionOptions');
    
    if (checkbox && singleDateContainer && repetitionOptions) {
        singleDateContainer.style.display = checkbox.checked ? 'none' : 'block';
        repetitionOptions.style.display = checkbox.checked ? 'block' : 'none';
        if (checkbox.checked) {
            updateRepetitionOptions();
        }
    }
}

function updateRepetitionOptions() {
    const typeEl = document.getElementById('repetitionType');
    if (!typeEl) return;
    const type = typeEl.value;
    ['dailyOptions', 'weeklyOptions', 'monthlyOptions', 'customOptions'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const targetGroup = document.getElementById(type + 'Options');
    if (targetGroup) targetGroup.style.display = 'block';
}

// =================================================================================
// NOTES ACTIONS (Updated)
// =================================================================================

function listNotesAndFolders() {
    fetch('/api/notes/list')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderNoteTree(data.notes_tree, document.getElementById('noteTree'));
            } else {
                console.error('Error listing notes:', data.error);
            }
        })
        .catch(error => console.error('Error fetching note list:', error));
}

function renderNoteTree(items, parentElement, currentPath = '') {
    parentElement.innerHTML = '';
    items.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'note-tree-item';
        if (item.type === 'folder') {
            itemEl.innerHTML = `
                <div class="note-tree-folder-header">
                    <span class="folder-icon"><i class="fas fa-folder"></i></span>
                    <span>${item.name}</span>
                    <div class="note-item-actions">
                        <button class="btn btn-sm btn-secondary" onclick="showCreateModal('${item.path}', 'file')" title="New Note"><i class="fas fa-plus"></i></button>
                        <button class="btn btn-sm btn-secondary" onclick="showCreateModal('${item.path}', 'folder')" title="New Folder"><i class="fas fa-folder-plus"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteNoteOrFolder('${item.path}', 'folder')" title="Delete Folder"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            const childrenEl = document.createElement('div');
            childrenEl.className = 'note-tree-folder-children';
            renderNoteTree(item.children, childrenEl, item.path);
            itemEl.appendChild(childrenEl);
        } else {
            itemEl.innerHTML = `
                <div class="note-tree-file-header">
                    <span class="file-icon"><i class="fas fa-file-alt"></i></span>
                    <span onclick="openNote('${item.path}')" style="cursor:pointer;">${item.name}</span>
                    <div class="note-item-actions">
                        <button class="btn btn-sm btn-secondary" onclick="showShareNoteModal('${item.path}')" title="Share"><i class="fas fa-share-alt"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteNoteOrFolder('${item.path}', 'file')" title="Delete Note"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
        }
        parentElement.appendChild(itemEl);
    });
}

function openNote(notePath) {
    // Save current note before switching if there's an active editor
    if (noteEditorInstance && currentNotePath && currentNotePath !== notePath) {
        saveCurrentNote();
    }

    currentNotePath = notePath;
    document.getElementById('noteEditor').style.display = 'block';
    document.getElementById('notesEmptyState').style.display = 'none';
    document.getElementById('noteEditorTitle').textContent = notePath.split('/').pop().replace('.md', '');

    const editorEl = document.getElementById('noteEditor_editor');
    if (editorEl) {
        editorEl.dataset.currentNotePath = notePath;
    }

    // First, fetch the note content
    fetch(`/api/notes/get?path=${encodeURIComponent(notePath)}`)
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { 
                    throw new Error(err.error || `HTTP error! Status: ${response.status}`); 
                }).catch(() => { 
                    throw new Error(`HTTP error! Status: ${response.status}`); 
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                let content = data.content || '';
                console.log('Loaded content:', content); // Debug log
                
                // Initialize or recreate the editor for this specific note
                initializeNoteEditor(content);
            } else {
                throw new Error(data.error || 'Failed to load note content.');
            }
        })
        .catch(error => {
            console.error('Error loading note:', error);
            alert(`Could not load note: ${error.message}`);
            document.getElementById('noteEditor').style.display = 'none';
            document.getElementById('notesEmptyState').style.display = 'flex';
        });
}

function initializeNoteEditor(content) {
    console.log('initializeNoteEditor called with content:', content); // Debug log
    
    // Clean up existing editor if it exists
    if (noteEditorInstance) {
        try {
            if (typeof noteEditorInstance.destroy === 'function') {
                noteEditorInstance.destroy();
            }
        } catch (e) {
            console.warn('Error destroying previous editor instance:', e);
        }
        noteEditorInstance = null;
    }

    // Clear the editor container
    const editorContainer = document.getElementById('noteEditor_editor');
    if (!editorContainer) {
        console.error('Editor container not found!');
        return;
    }
    
    editorContainer.innerHTML = '';

    // Try to initialize rich text editor
    if (window.RichTextEditor) {
        try {
            console.log('Attempting to create RichTextEditor...');
            
            // Create the editor on the container div
            noteEditorInstance = new RichTextEditor('#noteEditor_editor', {
                placeholder: 'Start writing your note...',
                height: 'calc(100vh - 200px)',
                autoSave: true,
            });
            
            console.log('RichTextEditor created:', noteEditorInstance);
            
            // Wait for editor to be ready and set content
            setTimeout(() => {
                setEditorContent(content);
                setupEditorEventListeners();
            }, 300); // Increased timeout
            
        } catch (error) {
            console.error('Error initializing RichTextEditor:', error);
            createFallbackEditor(content);
        }
    } else {
        console.warn('RichTextEditor not available, using fallback');
        createFallbackEditor(content);
    }
}

function setEditorContent(content) {
    console.log('setEditorContent called with:', content);
    
    if (!noteEditorInstance) {
        console.error('No editor instance available');
        const fallback = document.getElementById('fallbackEditor');
        if (fallback) fallback.value = content;
        return;
    }

    // Try multiple methods to set content
    const methods = [
        () => noteEditorInstance.setContent(content),
        () => noteEditorInstance.setHTML(content),
        () => noteEditorInstance.setValue(content),
        () => noteEditorInstance.html(content),
        () => {
            // Direct DOM manipulation as last resort
            const editableElement = document.querySelector('#noteEditor_editor [contenteditable="true"]');
            if (editableElement) {
                editableElement.innerHTML = content;
                console.log('Content set via DOM manipulation');
                return true;
            }
            return false;
        }
    ];

    for (let i = 0; i < methods.length; i++) {
        try {
            const result = methods[i]();
            if (result !== false) {
                console.log(`Content set successfully using method ${i + 1}`);
                return;
            }
        } catch (error) {
            console.warn(`Method ${i + 1} failed:`, error);
        }
    }
    
    console.error('All methods to set content failed');
}

function setupEditorEventListeners() {
    if (!noteEditorInstance) return;
    
    let saveTimeout;
    const debouncedSave = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveCurrentNote();
        }, 1000);
    };

    // Try multiple event binding methods
    const eventMethods = [
        () => noteEditorInstance.onChange && noteEditorInstance.onChange(debouncedSave),
        () => noteEditorInstance.on && noteEditorInstance.on('input', debouncedSave),
        () => noteEditorInstance.on && noteEditorInstance.on('change', debouncedSave),
        () => noteEditorInstance.on && noteEditorInstance.on('text-change', debouncedSave),
        () => {
            // Direct DOM event binding
            const editableElement = document.querySelector('#noteEditor_editor [contenteditable="true"]');
            if (editableElement) {
                editableElement.addEventListener('input', debouncedSave);
                editableElement.addEventListener('keyup', debouncedSave);
                editableElement.addEventListener('paste', debouncedSave);
                console.log('Event listeners set up via DOM');
                return true;
            }
            return false;
        }
    ];

    for (let i = 0; i < eventMethods.length; i++) {
        try {
            const result = eventMethods[i]();
            if (result !== false) {
                console.log(`Event listeners set up using method ${i + 1}`);
                break;
            }
        } catch (error) {
            console.warn(`Event method ${i + 1} failed:`, error);
        }
    }
}

/**
 * FIX: This function now creates the textarea element programmatically
 * to avoid DOM parsing issues with innerHTML. It's more robust and ensures
 * the element exists before we try to add an event listener to it.
 * It also targets the correct container element.
 * I also removed the duplicate definition of this function.
 */
function createFallbackEditor(content) {
    console.log('Creating fallback editor with content:', content);
    const editorContainer = document.getElementById('noteEditor_editor');

    if (!editorContainer) {
        console.error("Fallback editor container '#noteEditor_editor' not found.");
        return;
    }

    // Create the textarea element programmatically
    const fallbackEditor = document.createElement('textarea');
    fallbackEditor.id = 'fallbackEditor';
    fallbackEditor.style.width = '100%';
    fallbackEditor.style.height = 'calc(100vh - 200px)';
    fallbackEditor.style.padding = '10px';
    fallbackEditor.style.border = '1px solid #ccc';
    fallbackEditor.style.borderRadius = '4px';
    fallbackEditor.style.fontFamily = 'monospace';
    fallbackEditor.style.background = '#2d2d2d';
    fallbackEditor.style.color = '#fff';
    fallbackEditor.style.resize = 'none';
    
    // Use .value to set content for a textarea
    fallbackEditor.value = content;

    // Add the event listener
    let saveTimeout;
    fallbackEditor.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveCurrentNote();
        }, 1000);
    });

    // Clear the container and append the new editor
    editorContainer.innerHTML = '';
    editorContainer.appendChild(fallbackEditor);
    
    console.log('Fallback editor created and appended.');
}


function saveCurrentNote() {
    if (!currentNotePath) {
        console.log('No current note path, skipping save');
        return;
    }

    let content = '';
    
    // Try to get content from various sources
    if (noteEditorInstance) {
        const methods = [
            () => noteEditorInstance.getContent && noteEditorInstance.getContent(),
            () => noteEditorInstance.getHTML && noteEditorInstance.getHTML(),
            () => noteEditorInstance.getValue && noteEditorInstance.getValue(),
            () => noteEditorInstance.html && noteEditorInstance.html(),
            () => {
                const editableElement = document.querySelector('#noteEditor_editor [contenteditable="true"]');
                return editableElement ? editableElement.innerHTML : null;
            }
        ];

        for (let method of methods) {
            try {
                const result = method();
                if (result !== null && result !== undefined) {
                    content = result;
                    break;
                }
            } catch (error) {
                console.warn('Content retrieval method failed:', error);
            }
        }
    }
    
    // Fallback to textarea
    if (!content) {
        const fallbackEditor = document.getElementById('fallbackEditor');
        if (fallbackEditor) {
            content = fallbackEditor.value;
        }
    }

    console.log('Saving content:', content);

    // Only save if content is not empty or undefined
    if (content !== undefined && content !== null) {
        fetch('/api/notes/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                path: currentNotePath, 
                content: content 
            })
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                console.error('Error saving note:', data.error);
            } else {
                console.log('Note saved successfully');
            }
        })
        .catch(error => {
            console.error('Error saving note:', error);
        });
    }
}

function showCreateModal(parentPath, type) {
    const title = type === 'file' ? 'Create New Note' : 'Create New Folder';
    const label = type === 'file' ? 'Note Name' : 'Folder Name';
    const placeholder = type === 'file' ? 'My New Note' : 'My New Folder';

    const modalContent = `
        <div class="form-group">
            <label for="itemName">${label}</label>
            <input type="text" id="itemName" class="form-control" placeholder="${placeholder}">
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="confirmCreateNoteOrFolder('${parentPath}', '${type}')">Create</button>
        </div>
    `;
    showModal(title, modalContent);
}

function confirmCreateNoteOrFolder(parentPath, type) {
    const name = document.getElementById('itemName').value.trim();
    if (!name) {
        alert(`${type === 'file' ? 'Note' : 'Folder'} name cannot be empty.`);
        return;
    }

    fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, type: type, parent_path: parentPath })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            closeModal();
            listNotesAndFolders(); // Refresh tree
            if (type === 'file') {
                // Wait a bit for the tree to refresh, then open the note
                setTimeout(() => {
                    openNote(data.path);
                }, 500);
            }
        } else {
            alert('Error creating ' + type + ': ' + data.error);
        }
    });
}

function deleteNoteOrFolder(itemPath, type) {
    const confirmMessage = `Are you sure you want to delete this ${type} (${itemPath})? This action cannot be undone.`;
    if (confirm(confirmMessage)) {
        fetch('/api/notes/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: itemPath, type: type })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                listNotesAndFolders(); // Refresh tree
                if (currentNotePath === itemPath) {
                    document.getElementById('noteEditor').style.display = 'none';
                    document.getElementById('notesEmptyState').style.display = 'flex';
                    currentNotePath = null;
                    // Clean up editor instance when the current note is deleted
                    if (noteEditorInstance) {
                        try {
                            if (typeof noteEditorInstance.destroy === 'function') {
                                noteEditorInstance.destroy();
                            }
                        } catch (e) {
                            console.warn('Error destroying editor:', e);
                        }
                        noteEditorInstance = null;
                    }
                }
            } else {
                alert('Error deleting ' + type + ': ' + data.error);
            }
        });
    }
}

// =================================================================================
// INITIALIZATION & EVENT LISTENERS
// =================================================================================
document.addEventListener('DOMContentLoaded', function() {
    // Attach global event listeners
    const modalOverlay = document.getElementById('modalOverlay');
    if(modalOverlay) {
        modalOverlay.addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
            closeTaskSidebar();
        }
    });

    // Page-specific initializations
    if (document.querySelector('.page-container')) { // We are on page.html
        loadAllDatabases();
    } else if (document.querySelector('.notes-page-container')) { // We are on notes.html
        listNotesAndFolders();
        document.getElementById('notesEmptyState').style.display = 'flex';
        document.getElementById('noteEditor').style.display = 'none';
    }
});

// =================================================================================
// RICH TEXT EDITOR SINGLETON WRAPPER
// =================================================================================
// Store RichTextEditor instances globally to prevent re-initialization on the same element.
window.richTextEditors = window.richTextEditors || [];
if (window.RichTextEditor) {
    const originalRichTextEditor = window.RichTextEditor;
    // We are overwriting the global RichTextEditor constructor with our own logic.
    window.RichTextEditor = function(...args) {
        const selector = args[0];
        const element = document.querySelector(selector);

        // If the target element doesn't exist, we can't create an editor.
        if (!element) {
            console.error(`RichTextEditor target element "${selector}" not found.`);
            return null;
        }

        // Check if an editor instance for this specific element already exists in our cache.
        let existingEditor = window.richTextEditors.find(editor => editor.element === element);
        
        if (existingEditor) {
            // If it exists, return the stored instance instead of creating a new one.
            // This is the key to preventing duplicate toolbars.
            return existingEditor.instance;
        }

        // If no instance exists for this element, create a new one using the original constructor.
        const newInstance = new originalRichTextEditor(...args);
        
        // Store the element and the new instance together in our cache for future checks.
        window.richTextEditors.push({ element: element, instance: newInstance });
        
        // Return the newly created instance.
        return newInstance;
    };
}

// =================================================================================
// EXPORT FUNCTIONS TO WINDOW OBJECT
// =================================================================================
// Modals & Sidebars
window.showModal = showModal;
window.closeModal = closeModal;
window.confirmModal = confirmModal;
window.closeTaskSidebar = closeTaskSidebar;

// Page & Database CRUD
window.openPage = openPage;
window.deletePage = deletePage;
window.editPage = editPage;
window.confirmEditPage = confirmEditPage;
window.toggleEditRepetitionOptions = toggleEditRepetitionOptions;

window.addDatabase = addDatabase;
window.confirmCreateDatabase = confirmCreateDatabase;
window.editDatabase = editDatabase;
window.confirmEditDatabase = confirmEditDatabase;
window.deleteDatabase = deleteDatabase;

window.addPageToDatabase = addPageToDatabase;
window.confirmCreatePage = confirmCreatePage;
window.createPageWithProperties = createPageWithProperties;

// Properties
window.addProperty = addProperty;
window.removeProperty = removeProperty;
window.addSelectOption = addSelectOption;
window.removeSelectOption = removeSelectOption;


// Repetition Modals
window.toggleRepetitionOptions = toggleRepetitionOptions;
window.updateRepetitionOptions = updateRepetitionOptions;

// For Calendar
window.markTaskCompleted = (pageId, date, completed) => {
    fetch('/api/mark_completed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: pageId, date: date, completed: completed })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            location.reload(); // Simple reload to show changes
        } else {
            alert('Failed to update task status.');
        }
    });
};

// Notes specific functions
window.openNote = openNote;
window.showCreateModal = showCreateModal;
window.confirmCreateNoteOrFolder = confirmCreateNoteOrFolder;
window.deleteNoteOrFolder = deleteNoteOrFolder;
window.saveCurrentNote = saveCurrentNote;
