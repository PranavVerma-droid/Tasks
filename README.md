# Notion Alternative - Task Manager

A self-hostable alternative to Notion with powerful inline databases, calendar views, and task repetition features. Built with Python Flask and featuring a beautiful dark mode UI.

## Features

### 🗄️ Inline Databases
- Create custom databases with different property types (text, date, select, status, number)
- Add pages (rows) to databases with custom properties
- Nested databases - databases inside database pages
- Real-time editing and updates

### 📅 Calendar View
- View all tasks with date properties in a beautiful calendar layout
- Support for repeating tasks with various repetition patterns
- Click on tasks to view details in a sidebar
- Mark tasks as completed for specific dates

### 🔄 Task Repetition
- Daily repetition
- Weekly repetition with custom days
- Custom interval repetition (every X days)
- Different from Notion - focuses on task repetition like Google Calendar + Tasks

### ✅ Status Tracking
- Custom status properties with tags
- Mark tasks as completed "FOR THE DAY"
- Track completion history
- Status visible in calendar view but not in database view

### 🎨 Beautiful UI
- Dark mode interface exactly like Notion
- Responsive design
- Smooth animations and transitions
- Modern, clean interface

## Installation

### Prerequisites
- Python 3.7 or higher
- pip (Python package installer)

### Setup

1. **Clone or download the project**
   ```bash
   git clone <repository-url>
   cd task-manager
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**
   ```bash
   python app.py
   ```

4. **Access the application**
   Open your browser and go to `http://localhost:5000`

## Usage

### Getting Started

1. **Home Page**: The application starts with a welcome page showing quick actions
2. **Create Database**: Click "Add Database" to create your first inline database
3. **Add Properties**: Define custom properties for your database (text, date, select, etc.)
4. **Add Pages**: Add pages (rows) to your database with the defined properties
5. **Calendar View**: Switch to calendar view to see all tasks with date properties

### Creating Databases

1. Navigate to any page
2. Click "Add Database"
3. Enter a name for your database
4. Add properties with different types:
   - **Text**: Simple text input
   - **Date**: Date picker with repetition options
   - **Select**: Dropdown with custom options
   - **Status**: Status tags (Not Started, In Progress, Done)
   - **Number**: Numeric input

### Adding Pages to Databases

1. Click "Add Page" on any database
2. Enter a title for the page
3. Fill in the properties as needed
4. For date properties, you can set:
   - Single date
   - Repeating date with various patterns

### Calendar View

1. Click "Calendar" in the sidebar
2. View all tasks with date properties
3. Click on any task to see details in the sidebar
4. Mark tasks as completed for specific dates
5. Navigate between months using the arrow buttons

### Task Repetition

When setting a date property, you can configure repetition:

- **Daily**: Task repeats every day
- **Weekly**: Task repeats on specific days of the week
- **Custom**: Task repeats every X days on specific weekdays

## Data Storage

The application stores all data in JSON files in the `./data` directory:
- `notion_data.json`: Main data file containing all pages, databases, and completion logs
- The data directory is created automatically when the application starts

## API Endpoints

### Database Management
- `POST /api/create_database`: Create a new database
- `GET /api/get_database_data/<database_id>`: Get database data and pages

### Page Management
- `POST /api/create_page`: Create a new page in a database
- `POST /api/update_page`: Update page properties
- `GET /api/get_page_data/<page_id>`: Get page data and completion logs

### Task Completion
- `POST /api/mark_completed`: Mark a task as completed for a specific date

## Project Structure

```
task-manager/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── README.md             # This file
├── data/                 # Data storage directory (created automatically)
│   └── notion_data.json  # Main data file
├── templates/            # HTML templates
│   ├── base.html         # Base template with layout
│   ├── index.html        # Home page
│   ├── page.html         # Page view with databases
│   └── calendar.html     # Calendar view
└── static/              # Static files
    ├── css/
    │   └── style.css     # Main stylesheet
    └── js/
        └── app.js        # JavaScript functionality
```

## Features in Detail

### Block Structure
The application uses a block-based structure similar to Notion's backend:
- **Blocks**: Represent pages and databases
- **Pages**: Contain properties and can have nested databases
- **Databases**: Contain property definitions and page references
- **Properties**: Define the structure of data (text, date, select, etc.)

### Date Properties
Date properties support complex repetition patterns:
- **Single Date**: One-time tasks
- **Daily Repetition**: Tasks that repeat every day
- **Weekly Repetition**: Tasks that repeat on specific weekdays
- **Custom Repetition**: Tasks that repeat every X days on specific weekdays

### Completion Tracking
- Track completion status for each date
- Mark tasks as completed "FOR THE DAY"
- View completion history
- Completion status is separate from database view

### Responsive Design
- Works on desktop, tablet, and mobile devices
- Sidebar collapses on smaller screens
- Calendar view adapts to screen size
- Touch-friendly interface

## Customization

### Adding New Property Types
To add new property types, modify:
1. `app.py`: Add new property type handling
2. `static/js/app.js`: Add rendering functions
3. `templates/page.html`: Add UI elements

### Styling
The application uses CSS custom properties for easy theming:
- Modify `static/css/style.css` to change colors and styling
- All colors are defined as CSS variables for easy customization

### Data Structure
The data structure is extensible:
- Add new property types by extending the Property class
- Add new block types by extending the Block class
- Modify the data schema in `app.py`

## Troubleshooting

### Common Issues

1. **Port already in use**
   - Change the port in `app.py` line 557
   - Or kill the process using the port

2. **Data not persisting**
   - Check that the `./data` directory exists
   - Ensure write permissions for the application

3. **Calendar not showing tasks**
   - Ensure tasks have date properties
   - Check that date properties have valid values

### Debug Mode
The application runs in debug mode by default. For production:
- Set `debug=False` in `app.py`
- Use a proper WSGI server like Gunicorn

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the code comments
3. Create an issue in the repository

---

**Built with ❤️ using Python Flask and modern web technologies** 