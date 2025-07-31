import logging
import json
import sqlite3
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response
from logging_setup import setup_logging
from pathlib import Path
from pydantic import BaseModel
from typing import List

setup_logging(log_to_file="api.log")

logger = logging.getLogger(__name__)

# Load environment variables from local .env file
load_dotenv(dotenv_path="../.env", override=True)

class RunSqlRequest(BaseModel):
    columns: List[str]
    query: str

# GLOBAL VARIABLES
app = FastAPI()
DB_PATH = "/Users/tompakeman/code/agent-tracing-zdr/traces_v1.db"

def run_query(query: str, db_path=DB_PATH):
    db_path = Path(db_path)
    if not db_path.exists():
        raise FileNotFoundError(f"Database {db_path} does not exist.")
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        return [row for row in cursor.fetchall()]

@app.post("/sql")
async def run_sql(request: RunSqlRequest):
    try:
        result = run_query(request.query)
        # Convert the result to a JSON-friendly format
        result = [dict(zip(request.columns, row)) for row in result]
        return Response(content=json.dumps(result), media_type="application/json")
    except Exception as e:
        logger.error(f"Error running query: {e}")
        raise HTTPException(status_code=500, detail=str(e))