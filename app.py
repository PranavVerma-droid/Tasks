from flask import Flask, render_template, request, jsonify, redirect, url_for
import json
import os
from datetime import datetime, timedelta
import uuid
from typing import Dict, List, Any, Optional
import calendar
from dataclasses import dataclass, asdict
from copy import deepcopy

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'

# Data directory
DATA_DIR = './data'
DATA_FILE = os.path.join(DATA_DIR, 'notion_data.json')

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# Data structure classes
@dataclass
class Property:
    id: str
    name: str
    type: str  # 'text', 'date', 'select', 'number', 'status', 'rich_text'
    value: Any = None
    options: List[str] = None  # For select/status types
    rich_text_content: Optional[str] = None  # For rich text type

@dataclass
class Page:
    id: str
    title: str
    properties: Dict[str, Property]
    databases: List[str] = None  # List of database IDs that are children
    parent_database_id: str = None  # Parent database ID if this page is inside a database
    created_at: str = None
    updated_at: str = None

@dataclass
class Database:
    id: str
    name: str
    properties: Dict[str, Property]  # Property definitions
    pages: List[str] = None  # List of page IDs
    parent_page_id: str = None  # Parent page ID if this database is nested
    created_at: str = None
    updated_at: str = None

@dataclass
class Block:
    id: str
    type: str  # 'page', 'database'
    content: Dict[str, Any]
    parent_id: str = None
    children: List[str] = None

@dataclass
class CompletionLog:
    date: str
    completed: bool
    timestamp: str

class NotionData:
    def __init__(self):
        self.blocks: Dict[str, Block] = {}
        self.pages: Dict[str, Page] = {}
        self.databases: Dict[str, Database] = {}
        self.completion_logs: Dict[str, List[CompletionLog]] = {}  # page_id -> completion logs
        
    def to_dict(self):
        def serialize_property(prop):
            return {
                'id': prop.id,
                'name': prop.name,
                'type': prop.type,
                'value': prop.value,
                'options': prop.options,
                'rich_text_content': prop.rich_text_content
            }
        
        def serialize_page(page):
            return {
                'id': page.id,
                'title': page.title,
                'properties': {k: serialize_property(v) for k, v in page.properties.items()},
                'databases': page.databases,
                'parent_database_id': page.parent_database_id,
                'created_at': page.created_at,
                'updated_at': page.updated_at
            }
        
        def serialize_database(db):
            return {
                'id': db.id,
                'name': db.name,
                'properties': {k: serialize_property(v) for k, v in db.properties.items()},
                'pages': db.pages,
                'parent_page_id': db.parent_page_id,
                'created_at': db.created_at,
                'updated_at': db.updated_at
            }
        
        return {
            'blocks': {k: asdict(v) for k, v in self.blocks.items()},
            'pages': {k: serialize_page(v) for k, v in self.pages.items()},
            'databases': {k: serialize_database(v) for k, v in self.databases.items()},
            'completion_logs': {k: [asdict(log) for log in v] for k, v in self.completion_logs.items()}
        }
    
    @classmethod
    def from_dict(cls, data):
        instance = cls()
        
        # Convert pages
        for k, v in data.get('pages', {}).items():
            # Handle legacy description field
            if 'description' in v and 'properties' in v:
                # Move description to properties if it exists
                if v['description']:
                    v['properties']['description'] = {
                        'id': 'description',
                        'name': 'Description',
                        'type': 'text',
                        'value': v['description'],
                        'options': None,
                        'rich_text_content': None
                    }
                # Remove the legacy description field
                del v['description']
            
            # Remove other legacy fields that are not part of the Page dataclass
            legacy_fields = ['repetition_config', 'description']
            for field in legacy_fields:
                if field in v:
                    del v[field]
            
            # Convert properties to Property objects
            properties = {}
            for prop_id, prop_data in v.get('properties', {}).items():
                properties[prop_id] = Property(**prop_data)
            v['properties'] = properties
            
            instance.pages[k] = Page(**v)
        
        # Convert databases
        for k, v in data.get('databases', {}).items():
            # Convert properties to Property objects
            properties = {}
            for prop_id, prop_data in v.get('properties', {}).items():
                properties[prop_id] = Property(**prop_data)
            v['properties'] = properties
            
            instance.databases[k] = Database(**v)
        
        # Convert blocks
        for k, v in data.get('blocks', {}).items():
            instance.blocks[k] = Block(**v)
        
        # Convert completion logs
        for k, v in data.get('completion_logs', {}).items():
            instance.completion_logs[k] = [CompletionLog(**log) for log in v]
        
        return instance

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            data = json.load(f)
            return NotionData.from_dict(data)
    else:
        # Initialize with default page
        data = NotionData()
        default_page_id = str(uuid.uuid4())
        default_block_id = str(uuid.uuid4())
        
        # Create default page
        default_page = Page(
            id=default_page_id,
            title="Welcome to Your Workspace",
            properties={},
            databases=[],
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat()
        )
        
        # Create default block
        default_block = Block(
            id=default_block_id,
            type='page',
            content={'page_id': default_page_id},
            children=[]
        )
        
        data.pages[default_page_id] = default_page
        data.blocks[default_block_id] = default_block
        
        save_data(data)
        return data

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data.to_dict(), f, indent=2, default=str)

def get_date_property(page: Page) -> Optional[Property]:
    """Get the date property from a page"""
    for prop in page.properties.values():
        if prop.type == 'date':
            return prop
    return None

def get_status_property(page: Page) -> Optional[Property]:
    """Get the status property from a page"""
    for prop in page.properties.values():
        if prop.type == 'status':
            return prop
    return None

def calculate_repetition_dates(start_date: str, repetition_type: str, repetition_config: dict) -> List[str]:
    """Calculate all dates for a repeating task"""
    try:
        start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        dates = []
        
        if repetition_type == 'daily':
            current = start
            for _ in range(365):  # Limit to 1 year
                dates.append(current.isoformat())
                current += timedelta(days=1)
        
        elif repetition_type == 'weekly':
            days_of_week = repetition_config.get('days', [0, 1, 2, 3, 4, 5, 6])  # Monday=0
            current = start
            for _ in range(52):  # Limit to 1 year
                if current.weekday() in days_of_week:
                    dates.append(current.isoformat())
                current += timedelta(days=1)
        
        elif repetition_type == 'custom_days':
            interval = repetition_config.get('interval', 1)
            days = repetition_config.get('days', [0, 1, 2, 3, 4, 5, 6])
            current = start
            for _ in range(365):
                if current.weekday() in days:
                    dates.append(current.isoformat())
                current += timedelta(days=interval)
        
        return dates
    except ValueError as e:
        print(f"Invalid start date for repetition: {start_date}")
        return []
    except Exception as e:
        print(f"Error calculating repetition dates: {e}")
        return []

@app.route('/')
def index():
    data = load_data()
    return render_template('index.html', data=data)

@app.route('/page/<page_id>')
def view_page(page_id):
    data = load_data()
    if page_id not in data.pages:
        return redirect(url_for('index'))
    
    page = data.pages[page_id]
    databases = [data.databases[db_id] for db_id in page.databases] if page.databases else []
    
    # Get hierarchy for breadcrumb
    hierarchy_response = get_page_hierarchy(page_id)
    hierarchy_data = json.loads(hierarchy_response.get_data(as_text=True))
    hierarchy = hierarchy_data.get('hierarchy', []) if hierarchy_data.get('success') else []
    
    return render_template('page.html', page=page, databases=databases, data=data, hierarchy=hierarchy)

@app.route('/calendar')
def calendar_view():
    data = load_data()
    
    # Get all pages with date properties
    calendar_items = []
    for page in data.pages.values():
        date_prop = get_date_property(page)
        if date_prop and date_prop.value:
            try:
                if isinstance(date_prop.value, dict) and date_prop.value.get('repetition'):
                    # Handle repeating tasks
                    repetition_config = date_prop.value.get('repetition_config', {})
                    start_date = date_prop.value.get('start_date', '')
                    if start_date:
                        dates = calculate_repetition_dates(
                            start_date,
                            date_prop.value['repetition_type'],
                            repetition_config
                        )
                        for date in dates:
                            calendar_items.append({
                                'page': page,
                                'date': date,
                                'is_repeating': True,
                                'repetition_config': date_prop.value.get('repetition_config', {})
                            })
                else:
                    # Single date
                    date_str = date_prop.value if isinstance(date_prop.value, str) else date_prop.value.get('start_date', '')
                    if date_str:
                        # Validate the date string
                        try:
                            datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                            calendar_items.append({
                                'page': page,
                                'date': date_str,
                                'is_repeating': False
                            })
                        except ValueError:
                            print(f"Invalid date string: {date_str}")
                            continue
            except Exception as e:
                print(f"Error processing date property for page {page.id}: {e}")
                continue
    
    return render_template('calendar.html', calendar_items=calendar_items, data=data)

@app.route('/api/create_database', methods=['POST'])
def create_database():
    data = load_data()
    
    database_id = str(uuid.uuid4())
    page_id = request.json.get('page_id')
    name = request.json.get('name', 'Untitled Database')
    properties = request.json.get('properties', {})
    
    # Convert properties to Property objects
    db_properties = {}
    for prop_id, prop_data in properties.items():
        db_properties[prop_id] = Property(
            id=prop_id,
            name=prop_data['name'],
            type=prop_data['type'],
            options=prop_data.get('options', [])
        )
    
    # Create database
    database = Database(
        id=database_id,
        name=name,
        properties=db_properties,
        pages=[],
        parent_page_id=page_id,  # Set parent page
        created_at=datetime.now().isoformat(),
        updated_at=datetime.now().isoformat()
    )
    
    # Create block for database
    block_id = str(uuid.uuid4())
    block = Block(
        id=block_id,
        type='database',
        content={'database_id': database_id},
        parent_id=page_id,
        children=[]
    )
    
    data.databases[database_id] = database
    data.blocks[block_id] = block
    
    # Add database to page
    if page_id in data.pages:
        if data.pages[page_id].databases is None:
            data.pages[page_id].databases = []
        data.pages[page_id].databases.append(database_id)
    
    save_data(data)
    return jsonify({'success': True, 'database_id': database_id})

@app.route('/api/create_page', methods=['POST'])
def create_page():
    data = load_data()
    
    page_id = str(uuid.uuid4())
    database_id = request.json.get('database_id')
    title = request.json.get('title', 'Untitled')
    properties = request.json.get('properties', {})
    
    # Convert properties to Property objects
    page_properties = {}
    for prop_id, prop_data in properties.items():
        rich_text_content = prop_data.get('rich_text_content')
        
        # Ensure rich_text_content is preserved properly
        if prop_data['type'] == 'rich_text' and rich_text_content is not None:
            # For rich text, always preserve the content even if it's an empty string
            final_rich_text_content = rich_text_content
        else:
            final_rich_text_content = None
            
        page_properties[prop_id] = Property(
            id=prop_id,
            name=prop_data['name'],
            type=prop_data['type'],
            value=prop_data.get('value'),
            rich_text_content=final_rich_text_content
        )
    
    # Create page
    page = Page(
        id=page_id,
        title=title,
        properties=page_properties,
        databases=[],
        parent_database_id=database_id,  # Set parent database
        created_at=datetime.now().isoformat(),
        updated_at=datetime.now().isoformat()
    )
    
    # Create block for page
    block_id = str(uuid.uuid4())
    block = Block(
        id=block_id,
        type='page',
        content={'page_id': page_id},
        parent_id=database_id,
        children=[]
    )
    
    data.pages[page_id] = page
    data.blocks[block_id] = block
    
    # Add page to database
    if database_id in data.databases:
        if data.databases[database_id].pages is None:
            data.databases[database_id].pages = []
        data.databases[database_id].pages.append(page_id)
    
    save_data(data)
    
    return jsonify({'success': True, 'page_id': page_id})

@app.route('/api/update_page', methods=['POST'])
def update_page():
    data = load_data()
    
    page_id = request.json.get('page_id')
    updates = request.json.get('updates', {})
    
    if page_id not in data.pages:
        return jsonify({'success': False, 'error': 'Page not found'})
    
    page = data.pages[page_id]
    
    # Update properties
    for prop_id, prop_data in updates.get('properties', {}).items():
        rich_text_content = prop_data.get('rich_text_content')
        
        # Ensure rich_text_content is preserved properly
        if prop_data.get('type') == 'rich_text' and rich_text_content is not None:
            final_rich_text_content = rich_text_content
        else:
            final_rich_text_content = None
            
        if prop_id in page.properties:
            page.properties[prop_id].value = prop_data.get('value')
            page.properties[prop_id].rich_text_content = final_rich_text_content
        else:
            # Create the property if it doesn't exist
            page.properties[prop_id] = Property(
                id=prop_id,
                name=prop_data.get('name', prop_id),
                type=prop_data.get('type', 'text'),
                value=prop_data.get('value'),
                rich_text_content=final_rich_text_content
            )
    
    # Update title
    if 'title' in updates:
        page.title = updates['title']
    
    page.updated_at = datetime.now().isoformat()
    save_data(data)
    
    return jsonify({'success': True})

@app.route('/api/mark_completed', methods=['POST'])
def mark_completed():
    data = load_data()
    
    page_id = request.json.get('page_id')
    date = request.json.get('date')
    completed = request.json.get('completed', True)
    
    if page_id not in data.pages:
        return jsonify({'success': False, 'error': 'Page not found'})
    
    # Initialize completion logs for page if not exists
    if page_id not in data.completion_logs:
        data.completion_logs[page_id] = []
    
    # Check if log already exists for this date
    existing_log = None
    for log in data.completion_logs[page_id]:
        if log.date == date:
            existing_log = log
            break
    
    if existing_log:
        existing_log.completed = completed
        existing_log.timestamp = datetime.now().isoformat()
    else:
        new_log = CompletionLog(
            date=date,
            completed=completed,
            timestamp=datetime.now().isoformat()
        )
        data.completion_logs[page_id].append(new_log)
    
    save_data(data)
    return jsonify({'success': True})

@app.route('/api/get_page_data/<page_id>')
def get_page_data(page_id):
    data = load_data()
    
    if page_id not in data.pages:
        return jsonify({'success': False, 'error': 'Page not found'})
    
    page = data.pages[page_id]
    completion_logs = data.completion_logs.get(page_id, [])
    
    return jsonify({
        'success': True,
        'page': asdict(page),
        'completion_logs': [asdict(log) for log in completion_logs]
    })

@app.route('/api/get_database_data/<database_id>')
def get_database_data(database_id):
    data = load_data()
    
    if database_id not in data.databases:
        return jsonify({'success': False, 'error': 'Database not found'})
    
    database = data.databases[database_id]
    pages = [data.pages[page_id] for page_id in database.pages] if database.pages else []
    
    return jsonify({
        'success': True,
        'database': asdict(database),
        'pages': [asdict(page) for page in pages]
    })

@app.route('/api/update_database', methods=['POST'])
def update_database():
    data = load_data()
    
    database_id = request.json.get('database_id')
    name = request.json.get('name')
    properties = request.json.get('properties', {})
    
    if database_id not in data.databases:
        return jsonify({'success': False, 'error': 'Database not found'})
    
    database = data.databases[database_id]
    
    # Update database name
    database.name = name
    
    # Convert properties to Property objects
    db_properties = {}
    for prop_id, prop_data in properties.items():
        db_properties[prop_id] = Property(
            id=prop_id,
            name=prop_data['name'],
            type=prop_data['type'],
            options=prop_data.get('options', [])
        )
    
    # Update database properties
    database.properties = db_properties
    database.updated_at = datetime.now().isoformat()
    
    save_data(data)
    return jsonify({'success': True})

@app.route('/api/delete_database', methods=['POST'])
def delete_database():
    data = load_data()
    
    database_id = request.json.get('database_id')
    
    if database_id not in data.databases:
        return jsonify({'success': False, 'error': 'Database not found'})
    
    database = data.databases[database_id]
    
    # Remove database from all pages that contain it
    for page in data.pages.values():
        if page.databases and database_id in page.databases:
            page.databases.remove(database_id)
    
    # Delete all pages in the database
    if database.pages:
        for page_id in database.pages:
            if page_id in data.pages:
                del data.pages[page_id]
    
    # Delete the database
    del data.databases[database_id]
    
    # Delete associated blocks
    blocks_to_delete = []
    for block_id, block in data.blocks.items():
        if block.type == 'database' and block.content.get('database_id') == database_id:
            blocks_to_delete.append(block_id)
    
    for block_id in blocks_to_delete:
        del data.blocks[block_id]
    
    save_data(data)
    return jsonify({'success': True})

@app.route('/api/delete_page', methods=['POST'])
def delete_page():
    data = load_data()
    
    page_id = request.json.get('page_id')
    
    if page_id not in data.pages:
        return jsonify({'success': False, 'error': 'Page not found'})
    
    page = data.pages[page_id]
    
    # Remove page from all databases that contain it
    for database in data.databases.values():
        if database.pages and page_id in database.pages:
            database.pages.remove(page_id)
    
    # Delete the page
    del data.pages[page_id]
    
    # Delete associated blocks
    blocks_to_delete = []
    for block_id, block in data.blocks.items():
        if block.type == 'page' and block.content.get('page_id') == page_id:
            blocks_to_delete.append(block_id)
    
    for block_id in blocks_to_delete:
        del data.blocks[block_id]
    
    # Delete completion logs for this page
    if page_id in data.completion_logs:
        del data.completion_logs[page_id]
    
    save_data(data)
    return jsonify({'success': True})

@app.route('/api/get_page_hierarchy/<page_id>')
def get_page_hierarchy(page_id):
    """Get the complete hierarchy path for a page"""
    data = load_data()
    
    if page_id not in data.pages:
        return jsonify({'success': False, 'error': 'Page not found'})
    
    hierarchy = []
    current_page = data.pages[page_id]
    
    # Build hierarchy from current page up to root
    while current_page:
        hierarchy.insert(0, {
            'id': current_page.id,
            'title': current_page.title,
            'type': 'page'
        })
        
        # Find parent database
        if current_page.parent_database_id:
            parent_db = data.databases.get(current_page.parent_database_id)
            if parent_db:
                hierarchy.insert(0, {
                    'id': parent_db.id,
                    'title': parent_db.name,
                    'type': 'database'
                })
                
                # Find parent page of the database
                if parent_db.parent_page_id:
                    current_page = data.pages.get(parent_db.parent_page_id)
                else:
                    current_page = None
            else:
                current_page = None
        else:
            current_page = None
    
    return jsonify({
        'success': True,
        'hierarchy': hierarchy
    })

@app.route('/api/get_database_hierarchy/<database_id>')
def get_database_hierarchy(database_id):
    """Get the complete hierarchy path for a database"""
    data = load_data()
    
    if database_id not in data.databases:
        return jsonify({'success': False, 'error': 'Database not found'})
    
    hierarchy = []
    current_database = data.databases[database_id]
    
    # Build hierarchy from current database up to root
    while current_database:
        hierarchy.insert(0, {
            'id': current_database.id,
            'title': current_database.name,
            'type': 'database'
        })
        
        # Find parent page
        if current_database.parent_page_id:
            parent_page = data.pages.get(current_database.parent_page_id)
            if parent_page:
                hierarchy.insert(0, {
                    'id': parent_page.id,
                    'title': parent_page.title,
                    'type': 'page'
                })
                
                # Find parent database of the page
                if parent_page.parent_database_id:
                    current_database = data.databases.get(parent_page.parent_database_id)
                else:
                    current_database = None
            else:
                current_database = None
        else:
            current_database = None
    
    return jsonify({
        'success': True,
        'hierarchy': hierarchy
    })

@app.route('/api/navigate_to_page/<page_id>')
def navigate_to_page(page_id):
    """Navigate to a page, showing its databases and hierarchy"""
    data = load_data()
    
    if page_id not in data.pages:
        return redirect(url_for('index'))
    
    page = data.pages[page_id]
    databases = [data.databases[db_id] for db_id in page.databases] if page.databases else []
    
    # Get hierarchy for breadcrumb
    hierarchy_response = get_page_hierarchy(page_id)
    hierarchy_data = json.loads(hierarchy_response.get_data(as_text=True))
    hierarchy = hierarchy_data.get('hierarchy', []) if hierarchy_data.get('success') else []
    
    return render_template('page.html', page=page, databases=databases, data=data, hierarchy=hierarchy)

@app.route('/api/navigate_to_database/<database_id>')
def navigate_to_database(database_id):
    """Navigate to a database, showing its pages and hierarchy"""
    data = load_data()
    
    if database_id not in data.databases:
        return redirect(url_for('index'))
    
    database = data.databases[database_id]
    pages = [data.pages[page_id] for page_id in database.pages] if database.pages else []
    
    # Get hierarchy for breadcrumb
    hierarchy_response = get_database_hierarchy(database_id)
    hierarchy_data = json.loads(hierarchy_response.get_data(as_text=True))
    hierarchy = hierarchy_data.get('hierarchy', []) if hierarchy_data.get('success') else []
    
    return render_template('database.html', database=database, pages=pages, data=data, hierarchy=hierarchy)

@app.route('/api/update_property', methods=['POST'])
def update_property():
    data = load_data()
    
    page_id = request.json.get('page_id')
    property_id = request.json.get('property_id')
    value = request.json.get('value')
    property_type = request.json.get('type', 'text')
    
    if page_id not in data.pages:
        return jsonify({'success': False, 'error': 'Page not found'})
    
    page = data.pages[page_id]
    
    # Update the property
    if property_id in page.properties:
        if property_type == 'rich_text':
            page.properties[property_id].value = ''
            page.properties[property_id].rich_text_content = value if value is not None else ''
        else:
            page.properties[property_id].value = value
            page.properties[property_id].rich_text_content = None
        page.updated_at = datetime.now().isoformat()
    
    save_data(data)
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000) 