from flask import Flask, render_template, request, jsonify, redirect, url_for
import json
import os
import sqlite3
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
DATABASE_FILE = os.path.join(DATA_DIR, 'notion_data.db')

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

def init_database():
    """Initialize the SQLite database with required tables"""
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    
    # Create pages table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pages (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            parent_database_id TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    ''')
    
    # Create databases table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS databases (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_page_id TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    ''')
    
    # Create properties table (for both page and database properties)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS properties (
            id TEXT,
            owner_id TEXT NOT NULL,
            owner_type TEXT NOT NULL, -- 'page' or 'database'
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            value TEXT,
            options TEXT, -- JSON array for select/status options
            rich_text_content TEXT,
            PRIMARY KEY (id, owner_id)
        )
    ''')
    
    # Create blocks table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS blocks (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            content TEXT NOT NULL, -- JSON
            parent_id TEXT,
            children TEXT -- JSON array
        )
    ''')
    
    # Create page_databases relationship table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS page_databases (
            page_id TEXT,
            database_id TEXT,
            PRIMARY KEY (page_id, database_id)
        )
    ''')
    
    # Create database_pages relationship table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS database_pages (
            database_id TEXT,
            page_id TEXT,
            PRIMARY KEY (database_id, page_id)
        )
    ''')
    
    # Create completion_logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS completion_logs (
            page_id TEXT,
            date TEXT,
            completed INTEGER,
            timestamp TEXT,
            PRIMARY KEY (page_id, date)
        )
    ''')
    
    conn.commit()
    conn.close()

def get_db_connection():
    """Get a database connection"""
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

class NotionData:
    def __init__(self):
        self.blocks: Dict[str, Block] = {}
        self.pages: Dict[str, Page] = {}
        self.databases: Dict[str, Database] = {}
        self.completion_logs: Dict[str, List[CompletionLog]] = {}

def load_data():
    """Load all data from SQLite database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    data = NotionData()
    
    # Load pages
    cursor.execute('SELECT * FROM pages')
    for row in cursor.fetchall():
        page = Page(
            id=row['id'],
            title=row['title'],
            properties={},
            databases=[],
            parent_database_id=row['parent_database_id'],
            created_at=row['created_at'],
            updated_at=row['updated_at']
        )
        data.pages[row['id']] = page
    
    # Load databases
    cursor.execute('SELECT * FROM databases')
    for row in cursor.fetchall():
        database = Database(
            id=row['id'],
            name=row['name'],
            properties={},
            pages=[],
            parent_page_id=row['parent_page_id'],
            created_at=row['created_at'],
            updated_at=row['updated_at']
        )
        data.databases[row['id']] = database
    
    # Load properties
    cursor.execute('SELECT * FROM properties')
    for row in cursor.fetchall():
        prop = Property(
            id=row['id'],
            name=row['name'],
            type=row['type'],
            value=json.loads(row['value']) if row['value'] and row['value'] != 'null' else None,
            options=json.loads(row['options']) if row['options'] else None,
            rich_text_content=row['rich_text_content']
        )
        
        if row['owner_type'] == 'page' and row['owner_id'] in data.pages:
            data.pages[row['owner_id']].properties[row['id']] = prop
        elif row['owner_type'] == 'database' and row['owner_id'] in data.databases:
            data.databases[row['owner_id']].properties[row['id']] = prop
    
    # Load blocks
    cursor.execute('SELECT * FROM blocks')
    for row in cursor.fetchall():
        block = Block(
            id=row['id'],
            type=row['type'],
            content=json.loads(row['content']),
            parent_id=row['parent_id'],
            children=json.loads(row['children']) if row['children'] else []
        )
        data.blocks[row['id']] = block
    
    # Load page-database relationships
    cursor.execute('SELECT * FROM page_databases')
    for row in cursor.fetchall():
        if row['page_id'] in data.pages:
            data.pages[row['page_id']].databases.append(row['database_id'])
    
    # Load database-page relationships
    cursor.execute('SELECT * FROM database_pages')
    for row in cursor.fetchall():
        if row['database_id'] in data.databases:
            data.databases[row['database_id']].pages.append(row['page_id'])
    
    # Load completion logs
    cursor.execute('SELECT * FROM completion_logs')
    for row in cursor.fetchall():
        if row['page_id'] not in data.completion_logs:
            data.completion_logs[row['page_id']] = []
        
        log = CompletionLog(
            date=row['date'],
            completed=bool(row['completed']),
            timestamp=row['timestamp']
        )
        data.completion_logs[row['page_id']].append(log)
    
    conn.close()
    
    # Initialize default page if no data exists
    if not data.pages and not data.databases:
        _create_default_page(data)
    
    return data

def _create_default_page(data):
    """Create default page if database is empty"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    default_page_id = str(uuid.uuid4())
    default_block_id = str(uuid.uuid4())
    current_time = datetime.now().isoformat()
    
    # Insert default page
    cursor.execute('''
        INSERT INTO pages (id, title, parent_database_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
    ''', (default_page_id, "Welcome to Your Workspace", None, current_time, current_time))
    
    # Insert default block
    cursor.execute('''
        INSERT INTO blocks (id, type, content, parent_id, children)
        VALUES (?, ?, ?, ?, ?)
    ''', (default_block_id, 'page', json.dumps({'page_id': default_page_id}), None, json.dumps([])))
    
    conn.commit()
    conn.close()
    
    # Create in-memory objects
    default_page = Page(
        id=default_page_id,
        title="Welcome to Your Workspace",
        properties={},
        databases=[],
        created_at=current_time,
        updated_at=current_time
    )
    
    default_block = Block(
        id=default_block_id,
        type='page',
        content={'page_id': default_page_id},
        children=[]
    )
    
    data.pages[default_page_id] = default_page
    data.blocks[default_block_id] = default_block

def save_page(page: Page):
    """Save a single page to database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT OR REPLACE INTO pages (id, title, parent_database_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
    ''', (page.id, page.title, page.parent_database_id, page.created_at, page.updated_at))
    
    # Save properties
    cursor.execute('DELETE FROM properties WHERE owner_id = ? AND owner_type = ?', (page.id, 'page'))
    for prop_id, prop in page.properties.items():
        cursor.execute('''
            INSERT INTO properties (id, owner_id, owner_type, name, type, value, options, rich_text_content)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (prop.id, page.id, 'page', prop.name, prop.type, 
              json.dumps(prop.value) if prop.value is not None else None,
              json.dumps(prop.options) if prop.options else None,
              prop.rich_text_content))
    
    # Save page-database relationships
    cursor.execute('DELETE FROM page_databases WHERE page_id = ?', (page.id,))
    if page.databases:
        for db_id in page.databases:
            cursor.execute('INSERT INTO page_databases (page_id, database_id) VALUES (?, ?)', (page.id, db_id))
    
    conn.commit()
    conn.close()

def save_database(database: Database):
    """Save a single database to database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT OR REPLACE INTO databases (id, name, parent_page_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
    ''', (database.id, database.name, database.parent_page_id, database.created_at, database.updated_at))
    
    # Save properties
    cursor.execute('DELETE FROM properties WHERE owner_id = ? AND owner_type = ?', (database.id, 'database'))
    for prop_id, prop in database.properties.items():
        cursor.execute('''
            INSERT INTO properties (id, owner_id, owner_type, name, type, value, options, rich_text_content)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (prop.id, database.id, 'database', prop.name, prop.type,
              json.dumps(prop.value) if prop.value is not None else None,
              json.dumps(prop.options) if prop.options else None,
              prop.rich_text_content))
    
    # Save database-page relationships
    cursor.execute('DELETE FROM database_pages WHERE database_id = ?', (database.id,))
    if database.pages:
        for page_id in database.pages:
            cursor.execute('INSERT INTO database_pages (database_id, page_id) VALUES (?, ?)', (database.id, page_id))
    
    conn.commit()
    conn.close()

def save_block(block: Block):
    """Save a single block to database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT OR REPLACE INTO blocks (id, type, content, parent_id, children)
        VALUES (?, ?, ?, ?, ?)
    ''', (block.id, block.type, json.dumps(block.content), block.parent_id, json.dumps(block.children)))
    
    conn.commit()
    conn.close()

def save_completion_log(page_id: str, log: CompletionLog):
    """Save a completion log to database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT OR REPLACE INTO completion_logs (page_id, date, completed, timestamp)
        VALUES (?, ?, ?, ?)
    ''', (page_id, log.date, int(log.completed), log.timestamp))
    
    conn.commit()
    conn.close()

def delete_page_from_db(page_id: str):
    """Delete a page and all related data from database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM pages WHERE id = ?', (page_id,))
    cursor.execute('DELETE FROM properties WHERE owner_id = ? AND owner_type = ?', (page_id, 'page'))
    cursor.execute('DELETE FROM page_databases WHERE page_id = ?', (page_id,))
    cursor.execute('DELETE FROM database_pages WHERE page_id = ?', (page_id,))
    cursor.execute('DELETE FROM completion_logs WHERE page_id = ?', (page_id,))
    cursor.execute('DELETE FROM blocks WHERE type = ? AND content LIKE ?', ('page', f'%"page_id": "{page_id}"%'))
    
    conn.commit()
    conn.close()

def delete_database_from_db(database_id: str):
    """Delete a database and all related data from database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM databases WHERE id = ?', (database_id,))
    cursor.execute('DELETE FROM properties WHERE owner_id = ? AND owner_type = ?', (database_id, 'database'))
    cursor.execute('DELETE FROM page_databases WHERE database_id = ?', (database_id,))
    cursor.execute('DELETE FROM database_pages WHERE database_id = ?', (database_id,))
    cursor.execute('DELETE FROM blocks WHERE type = ? AND content LIKE ?', ('database', f'%"database_id": "{database_id}"%'))
    
    conn.commit()
    conn.close()

# Initialize database on startup
init_database()

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
    """Calculate all dates for a repeating task, supporting advanced options."""
    try:
        start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        end_date = repetition_config.get('end_date')
        if end_date:
            end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        else:
            # Default: 1 year from start
            end = start + timedelta(days=365)
        
        dates = []
        
        if repetition_type == 'daily':
            interval_days = repetition_config.get('interval', 1)
            current = start
            while current <= end:
                dates.append(current.date().isoformat())
                current += timedelta(days=interval_days)
        
        elif repetition_type == 'weekly':
            days_of_week = repetition_config.get('days_of_week', [start.weekday()])
            interval_weeks = repetition_config.get('interval', 1)
            
            # Start from the beginning of the start week
            current_week_start = start - timedelta(days=start.weekday())
            week_count = 0
            
            while current_week_start <= end:
                # Only process weeks that match the interval
                if week_count % interval_weeks == 0:
                    for day_of_week in days_of_week:
                        date = current_week_start + timedelta(days=day_of_week)
                        if start.date() <= date.date() <= end.date():
                            dates.append(date.date().isoformat())
                
                current_week_start += timedelta(weeks=1)
                week_count += 1
        
        elif repetition_type == 'monthly':
            interval_months = repetition_config.get('interval', 1)
            day_of_month = repetition_config.get('day_of_month', start.day)
            current = start.replace(day=min(day_of_month, calendar.monthrange(start.year, start.month)[1]))
            
            while current <= end:
                if start.date() <= current.date() <= end.date():
                    dates.append(current.date().isoformat())
                
                # Move to next month
                current_month = current.month + interval_months
                current_year = current.year
                while current_month > 12:
                    current_month -= 12
                    current_year += 1

                try:
                    max_day = calendar.monthrange(current_year, current_month)[1]
                    next_day = min(day_of_month, max_day)
                    current = current.replace(year=current_year, month=current_month, day=next_day)
                except calendar.IllegalMonthError:
                    break

        elif repetition_type == 'custom':
            # Handle custom patterns - same as weekly but with more flexibility
            days_of_week = repetition_config.get('days_of_week', [start.weekday()])
            interval_weeks = repetition_config.get('interval', 1)
            
            current_week_start = start - timedelta(days=start.weekday())
            week_count = 0
            
            while current_week_start <= end:
                if week_count % interval_weeks == 0:
                    for day_of_week in days_of_week:
                        date = current_week_start + timedelta(days=day_of_week)
                        if start.date() <= date.date() <= end.date():
                            dates.append(date.date().isoformat())
                
                current_week_start += timedelta(weeks=1)
                week_count += 1
        
        return sorted(list(set(dates)))
    except (ValueError, TypeError) as e:
        print(f"Invalid start date for repetition: {start_date}, error: {e}")
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
    databases = [data.databases[db_id] for db_id in page.databases if db_id in data.databases] if page.databases else []
    
    # Get hierarchy for breadcrumb
    hierarchy_response = get_page_hierarchy(page_id)
    hierarchy_data = json.loads(hierarchy_response.get_data(as_text=True))
    hierarchy = hierarchy_data.get('hierarchy', []) if hierarchy_data.get('success') else []
    
    return render_template('page.html', page=page, databases=databases, data=data, hierarchy=hierarchy)

@app.route('/calendar')
def calendar_view():
    data = load_data()
    calendar_items = []
    all_completion_logs = {}
    for page in data.pages.values():
        date_prop = get_date_property(page)
        all_completion_logs[page.id] = [asdict(log) for log in data.completion_logs.get(page.id, [])]
        if date_prop and date_prop.value:
            try:
                if isinstance(date_prop.value, dict):
                    is_repeating = date_prop.value.get('repetition', False)
                    start_date = date_prop.value.get('start_date')
                    start_time = date_prop.value.get('start_time') or None
                    end_time = date_prop.value.get('end_time') or None

                    if is_repeating and start_date:
                        repetition_config = date_prop.value.get('repetition_config', {})
                        repetition_type = date_prop.value.get('repetition_type', 'daily')
                        dates = calculate_repetition_dates(start_date, repetition_type, repetition_config)
                        for date in dates:
                            calendar_items.append({
                                'page': asdict(page),
                                'date': date,
                                'start_time': start_time,
                                'end_time': end_time,
                                'is_repeating': True,
                                'is_all_day': not start_time
                            })
                    elif start_date:
                        calendar_items.append({
                            'page': asdict(page),
                            'date': start_date,
                            'start_time': start_time,
                            'end_time': end_time,
                            'is_repeating': False,
                            'is_all_day': not start_time
                        })

                elif isinstance(date_prop.value, str): # Backwards compatibility
                    calendar_items.append({
                        'page': asdict(page),
                        'date': date_prop.value,
                        'start_time': None,
                        'end_time': None,
                        'is_repeating': False,
                        'is_all_day': True
                    })
            except Exception as e:
                print(f"Could not process date for page {page.id}: {e}")
                continue

    return render_template('calendar.html', calendar_items=calendar_items, data=data, completion_logs=all_completion_logs)

@app.route('/api/create_database', methods=['POST'])
def create_database():
    database_id = str(uuid.uuid4())
    page_id = request.json.get('page_id')
    name = request.json.get('name', 'Untitled Database')
    properties = request.json.get('properties', {})
    current_time = datetime.now().isoformat()
    
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
        parent_page_id=page_id,
        created_at=current_time,
        updated_at=current_time
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
    
    # Save to database
    save_database(database)
    save_block(block)
    
    # Update parent page
    if page_id:
        data = load_data()
        if page_id in data.pages:
            if data.pages[page_id].databases is None:
                data.pages[page_id].databases = []
            data.pages[page_id].databases.append(database_id)
            save_page(data.pages[page_id])
    
    return jsonify({'success': True, 'database_id': database_id})

@app.route('/api/create_page', methods=['POST'])
def create_page():
    page_id = str(uuid.uuid4())
    database_id = request.json.get('database_id')
    title = request.json.get('title', 'Untitled')
    properties = request.json.get('properties', {})
    current_time = datetime.now().isoformat()
    
    # Convert properties to Property objects
    page_properties = {}
    for prop_id, prop_data in properties.items():
        page_properties[prop_id] = Property(
            id=prop_id,
            name=prop_data['name'],
            type=prop_data['type'],
            value=prop_data.get('value'),
            rich_text_content=prop_data.get('rich_text_content')
        )
    
    # Create page
    page = Page(
        id=page_id,
        title=title,
        properties=page_properties,
        databases=[],
        parent_database_id=database_id,
        created_at=current_time,
        updated_at=current_time
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
    
    # Save to database
    save_page(page)
    save_block(block)
    
    # Update parent database
    if database_id:
        data = load_data()
        if database_id in data.databases:
            if data.databases[database_id].pages is None:
                data.databases[database_id].pages = []
            data.databases[database_id].pages.append(page_id)
            save_database(data.databases[database_id])
    
    return jsonify({'success': True, 'page_id': page_id})

@app.route('/api/update_page', methods=['POST'])
def update_page():
    page_id = request.json.get('page_id')
    updates = request.json.get('updates', {})
    
    data = load_data()
    if page_id not in data.pages:
        return jsonify({'success': False, 'error': 'Page not found'})
    
    page = data.pages[page_id]
    
    # Update properties
    if 'properties' in updates:
        for prop_id, prop_data in updates.get('properties', {}).items():
            if prop_id in page.properties:
                page.properties[prop_id].value = prop_data.get('value')
                if prop_data.get('type') == 'rich_text':
                    page.properties[prop_id].rich_text_content = prop_data.get('rich_text_content')
            else:
                 page.properties[prop_id] = Property(
                    id=prop_id,
                    name=prop_data['name'],
                    type=prop_data['type'],
                    value=prop_data.get('value'),
                    rich_text_content=prop_data.get('rich_text_content')
                )
    
    # Update title
    if 'title' in updates:
        page.title = updates['title']
    
    page.updated_at = datetime.now().isoformat()
    save_page(page)
    
    return jsonify({'success': True})

@app.route('/api/mark_completed', methods=['POST'])
def mark_completed():
    page_id = request.json.get('page_id')
    date = request.json.get('date')
    completed = request.json.get('completed', True)
    
    data = load_data()
    if page_id not in data.pages:
        return jsonify({'success': False, 'error': 'Page not found'})
    
    # Create completion log
    log = CompletionLog(
        date=date,
        completed=completed,
        timestamp=datetime.now().isoformat()
    )
    
    save_completion_log(page_id, log)
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
    pages = [data.pages[page_id] for page_id in database.pages if page_id in data.pages] if database.pages else []
    
    return jsonify({
        'success': True,
        'database': asdict(database),
        'pages': [asdict(page) for page in pages]
    })

@app.route('/api/update_database', methods=['POST'])
def update_database():
    database_id = request.json.get('database_id')
    name = request.json.get('name')
    properties = request.json.get('properties', {})
    
    data = load_data()
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
    
    save_database(database)
    return jsonify({'success': True})

@app.route('/api/delete_database', methods=['POST'])
def delete_database():
    database_id = request.json.get('database_id')
    
    data = load_data()
    if database_id not in data.databases:
        return jsonify({'success': False, 'error': 'Database not found'})
    
    database = data.databases[database_id]
    
    # Delete all pages in the database
    if database.pages:
        for page_id in database.pages:
            delete_page_from_db(page_id)
    
    # Remove database from parent page
    if database.parent_page_id and database.parent_page_id in data.pages:
        parent_page = data.pages[database.parent_page_id]
        if parent_page.databases and database_id in parent_page.databases:
            parent_page.databases.remove(database_id)
            save_page(parent_page)
    
    # Delete the database
    delete_database_from_db(database_id)
    
    return jsonify({'success': True})

@app.route('/api/delete_page', methods=['POST'])
def delete_page():
    page_id = request.json.get('page_id')
    
    data = load_data()
    if page_id not in data.pages:
        return jsonify({'success': False, 'error': 'Page not found'})
    
    page = data.pages[page_id]
    
    # Remove page from parent database
    if page.parent_database_id and page.parent_database_id in data.databases:
        parent_db = data.databases[page.parent_database_id]
        if parent_db.pages and page_id in parent_db.pages:
            parent_db.pages.remove(page_id)
            save_database(parent_db)
    
    # Delete the page
    delete_page_from_db(page_id)
    
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
    databases = [data.databases[db_id] for db_id in page.databases if db_id in data.databases] if page.databases else []
    
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
    pages = [data.pages[page_id] for page_id in database.pages if page_id in data.pages] if database.pages else []
    
    # Get hierarchy for breadcrumb
    hierarchy_response = get_database_hierarchy(database_id)
    hierarchy_data = json.loads(hierarchy_response.get_data(as_text=True))
    hierarchy = hierarchy_data.get('hierarchy', []) if hierarchy_data.get('success') else []
    
    return render_template('database.html', database=database, pages=pages, data=data, hierarchy=hierarchy, render_property_value=render_property_value)

def render_property_value(pageProp, propDef):
    if propDef.type == 'text':
        return f"<span>{pageProp.value or ''}</span>"
    elif propDef.type == 'rich_text':
        richContent = pageProp.rich_text_content or pageProp.value or ''
        if richContent:
            return f'<div class="rich-text-preview">{richContent}</div>'
        return '<span class="empty-property">-</span>'
    elif propDef.type == 'date':
        if pageProp.value and isinstance(pageProp.value, dict):
            dateValue = pageProp.value.get('start_date') or pageProp.value.get('end_date') or ''
            return f"<span>{dateValue}</span>"
        return f"<span>{pageProp.value or ''}</span>"
    elif propDef.type in ['select', 'status']:
        return f'<span class="property-tag">{pageProp.value or ''}</span>'
    elif propDef.type == 'number':
        return f"<span>{pageProp.value or ''}</span>"
    else:
        return f"<span>{pageProp.value or ''}</span>"

@app.route('/api/update_property', methods=['POST'])
def update_property():
    page_id = request.json.get('page_id')
    property_id = request.json.get('property_id')
    value = request.json.get('value')
    property_type = request.json.get('type', 'text')
    
    data = load_data()
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
    else:
        page.properties[property_id] = Property(
            id=property_id,
            name=property_id,
            type=property_type,
            value='' if property_type == 'rich_text' else value,
            rich_text_content=value if property_type == 'rich_text' else None
        )
        page.updated_at = datetime.now().isoformat()
    
    save_page(page)
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
