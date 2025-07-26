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
    type: str  # 'text', 'date', 'select', 'number', 'status'
    value: Any = None
    options: List[str] = None  # For select/status types

@dataclass
class Page:
    id: str
    title: str
    properties: Dict[str, Property]
    databases: List[str] = None  # List of database IDs that are children
    created_at: str = None
    updated_at: str = None

@dataclass
class Database:
    id: str
    name: str
    properties: Dict[str, Property]  # Property definitions
    pages: List[str] = None  # List of page IDs
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
        return {
            'blocks': {k: asdict(v) for k, v in self.blocks.items()},
            'pages': {k: asdict(v) for k, v in self.pages.items()},
            'databases': {k: asdict(v) for k, v in self.databases.items()},
            'completion_logs': {k: [asdict(log) for log in v] for k, v in self.completion_logs.items()}
        }
    
    @classmethod
    def from_dict(cls, data):
        instance = cls()
        instance.blocks = {k: Block(**v) for k, v in data.get('blocks', {}).items()}
        instance.pages = {k: Page(**v) for k, v in data.get('pages', {}).items()}
        instance.databases = {k: Database(**v) for k, v in data.get('databases', {}).items()}
        instance.completion_logs = {k: [CompletionLog(**log) for log in v] for k, v in data.get('completion_logs', {}).items()}
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
    start = datetime.fromisoformat(start_date)
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
    
    return render_template('page.html', page=page, databases=databases, data=data)

@app.route('/calendar')
def calendar_view():
    data = load_data()
    
    # Get all pages with date properties
    calendar_items = []
    for page in data.pages.values():
        date_prop = get_date_property(page)
        if date_prop and date_prop.value:
            if isinstance(date_prop.value, dict) and date_prop.value.get('repetition'):
                # Handle repeating tasks
                repetition_config = date_prop.value.get('repetition_config', {})
                dates = calculate_repetition_dates(
                    date_prop.value['start_date'],
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
                    calendar_items.append({
                        'page': page,
                        'date': date_str,
                        'is_repeating': False
                    })
    
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
        page_properties[prop_id] = Property(
            id=prop_id,
            name=prop_data['name'],
            type=prop_data['type'],
            value=prop_data.get('value')
        )
    
    # Create page
    page = Page(
        id=page_id,
        title=title,
        properties=page_properties,
        databases=[],
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
        if prop_id in page.properties:
            page.properties[prop_id].value = prop_data.get('value')
    
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

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000) 