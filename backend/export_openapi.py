import json
import sys
import os

# Add current directory to sys.path so we can import main
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app

if __name__ == "__main__":
    print(json.dumps(app.openapi(), indent=2))
