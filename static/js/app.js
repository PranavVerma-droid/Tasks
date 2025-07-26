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
        propertyObjects[propId] = {
            name: properties[propId].name,
            type: properties[propId].type,
            value: properties[propId].value
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
function renderPropertyValue(property, propertyDefinition) {
    if (!property || !property.value) {
        return '<span class="empty-property">-</span>';
    }
    
    switch (propertyDefinition.type) {
        case 'text':
            return `<span>${property.value}</span>`;
            
        case 'date':
            if (typeof property.value === 'object') {
                const dateValue = property.value.start_date || property.value.end_date || '';
                return `<span>${dateValue}</span>`;
            }
            return `<span>${property.value}</span>`;
            
        case 'select':
        case 'status':
            return `<span class="property-tag">${property.value}</span>`;
            
        case 'number':
            return `<span>${property.value}</span>`;
            
        default:
            return `<span>${property.value}</span>`;
    }
}

function renderPropertyEditor(property, propertyDefinition) {
    switch (propertyDefinition.type) {
        case 'text':
            return `<input type="text" class="form-control" value="${property.value || ''}" 
                           onchange="updateProperty('${property.id}', 'text', this.value)">`;
            
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
    // This would typically update the property via API
    console.log('Updating property:', propertyId, type, value);
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

function showPageEditModal(page) {
    let propertiesHtml = '';
    
    Object.values(page.properties).forEach(prop => {
        propertiesHtml += `
            <div class="form-group">
                <label>${prop.name}</label>
                ${renderPropertyEditor(prop, { type: prop.type, options: prop.options })}
            </div>
        `;
    });
    
    showModal('Edit Page', `
        <div class="form-group">
            <label for="editPageTitle">Page Title</label>
            <input type="text" id="editPageTitle" class="form-control" value="${page.title}">
        </div>
        ${propertiesHtml}
    `, () => {
        const newTitle = document.getElementById('editPageTitle').value;
        updatePage(page.id, newTitle, page.properties);
    });
}

function updatePage(pageId, title, properties) {
    const updates = {
        title: title,
        properties: {}
    };
    
    // Update properties
    Object.keys(properties).forEach(propId => {
        const prop = properties[propId];
        updates.properties[propId] = {
            value: prop.value
        };
    });
    
    return fetch('/api/update_page', {
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
            location.reload();
        }
    })
    .catch(error => {
        console.error('Error updating page:', error);
    });
}

// deletePage function is implemented in page.html template

// Calendar functions
function renderCalendar(calendarItems, currentMonth, currentYear) {
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    document.getElementById('currentMonth').textContent = `${monthNames[currentMonth]} ${currentYear}`;
    
    const calendarDays = document.getElementById('calendarDays');
    calendarDays.innerHTML = '';
    
    // Get first day of month and number of days
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    // Generate calendar grid
    for (let week = 0; week < 6; week++) {
        for (let day = 0; day < 7; day++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + (week * 7) + day);
            
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day';
            
            // Check if it's current month
            if (date.getMonth() === currentMonth) {
                dayElement.classList.add('current-month');
            }
            
            // Check if it's today
            const today = new Date();
            if (date.toDateString() === today.toDateString()) {
                dayElement.classList.add('today');
            }
            
            // Add day number
            const dayNumber = document.createElement('div');
            dayNumber.className = 'day-number';
            dayNumber.textContent = date.getDate();
            dayElement.appendChild(dayNumber);
            
            // Add events for this day
            const eventsContainer = document.createElement('div');
            eventsContainer.className = 'day-events';
            
            const dateString = formatDate(date);
            const dayEvents = calendarItems.filter(item => {
                try {
                    const eventDate = new Date(item.date);
                    // Check if the date is valid
                    if (isNaN(eventDate.getTime())) {
                        return false;
                    }
                    return eventDate.toDateString() === date.toDateString();
                } catch (error) {
                    console.warn('Invalid date in calendar item:', item.date);
                    return false;
                }
            });
            
            dayEvents.forEach(event => {
                const eventElement = document.createElement('div');
                eventElement.className = 'calendar-event';
                
                // Check if page has description
                const description = event.page.properties.description ? event.page.properties.description.value : '';
                if (description) {
                    eventElement.classList.add('has-description');
                    eventElement.setAttribute('data-description', description);
                }
                
                eventElement.textContent = event.page.title;
                eventElement.onclick = () => showTaskDetails(event.page, dateString);
                
                if (event.is_repeating) {
                    eventElement.classList.add('repeating');
                }
                
                eventsContainer.appendChild(eventElement);
            });
            
            dayElement.appendChild(eventsContainer);
            calendarDays.appendChild(dayElement);
        }
    }
}

function showTaskDetails(page, date) {
    fetch(`/api/get_page_data/${page.id}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const pageData = data.page;
                const completionLogs = data.completion_logs;
                
                // Check if task is completed for this date
                const completionLog = completionLogs.find(log => log.date === date);
                const isCompleted = completionLog ? completionLog.completed : false;
                
                // Build task details HTML
                let detailsHtml = `
                    <div class="task-details">
                        <h3>${pageData.title}</h3>
                `;
                
                // Add description if it exists
                const description = pageData.properties.description ? pageData.properties.description.value : '';
                if (description) {
                    detailsHtml += `
                        <div class="task-description">${description}</div>
                    `;
                }
                
                detailsHtml += `
                        <div class="task-properties">
                `;
                
                // Add properties (excluding description since we already showed it)
                Object.values(pageData.properties).forEach(prop => {
                    if (prop.value && prop.name !== 'Description') {
                        detailsHtml += `
                            <div class="task-property">
                                <label>${prop.name}:</label>
                                <span>${prop.value}</span>
                            </div>
                        `;
                    }
                });
                
                detailsHtml += `
                        </div>
                        <div class="task-actions">
                            <label class="checkbox-container">
                                <input type="checkbox" ${isCompleted ? 'checked' : ''} 
                                       onchange="toggleTaskCompletion('${pageData.id}', '${date}', this.checked)">
                                <span class="checkmark"></span>
                                Mark as completed for ${date}
                            </label>
                        </div>
                    </div>
                `;
                
                // Show in sidebar
                document.getElementById('taskSidebarTitle').textContent = pageData.title;
                document.getElementById('taskSidebarContent').innerHTML = detailsHtml;
                document.getElementById('taskSidebar').classList.add('active');
            }
        })
        .catch(error => {
            console.error('Error loading task details:', error);
        });
}

function toggleTaskCompletion(pageId, date, completed) {
    return fetch('/api/mark_completed', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            page_id: pageId,
            date: date,
            completed: completed
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Task completion updated');
        }
    })
    .catch(error => {
        console.error('Error updating task completion:', error);
    });
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