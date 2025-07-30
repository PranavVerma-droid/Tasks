// static/js/app.js

// =================================================================================
// GLOBAL VARIABLES & STATE
// =================================================================================
let currentModalCallback = null;
window.currentPageId = null; // Set by page.html template
window.currentDatabaseId = null; // Set dynamically

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
                } else {
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

// savePage function is removed as it's no longer used by any button
// and auto-saving is handled in base.html

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
        } else {
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
        const uniqueId = uniqueIdMatch.substring(1);

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
            properties[`prop_${Date.now()}_${index}`] = { name: propName, type: propType, options: [] };
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
            properties[propId] = { id: propId, name: propName, type: propType, options: [] };
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
    }
});

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
