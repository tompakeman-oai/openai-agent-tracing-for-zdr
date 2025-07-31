from agents.tracing import TracingProcessor, Trace, Span
from typing import Any
import logging
import sqlite3
from pathlib import Path
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1 # Bump every time the schema changes
DB_NAME = "traces"

class LocalTraceProcessor(TracingProcessor):
    """Stores traces and spans to a local SQLite database."""
    TRACE_TABLE = "traces"
    SPAN_TABLE = "spans"
    
    def __init__(self, db_path:str = None):
        """
        Args:
            db_path: The path to the SQLite database to use for storing traces and spans.
        """
        self.db_path = (
            db_path or Path(__file__).parent / f"{DB_NAME}_v{SCHEMA_VERSION}.db"
        )
        self._create_tables()
        self.current_trace: Trace = None
        self.current_span: Span[Any] = None


    def _create_connection(self):
        return sqlite3.connect(self.db_path, uri=True)
    
    def _create_tables(self):
        with self._create_connection() as conn:
            conn.execute(
                f"""CREATE TABLE IF NOT EXISTS {self.TRACE_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trace_id TEXT,
                workflow_name TEXT,
                group_id TEXT,
                metadata TEXT
                )"""
            )
            conn.execute(
                f"""CREATE TABLE IF NOT EXISTS {self.SPAN_TABLE} (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        span_id TEXT,
                        trace_id TEXT,
                        parent_id TEXT,
                        started_at TIMESTAMPTZ,
                        ended_at TIMESTAMPTZ,
                        span_data TEXT,
                        error TEXT
                )"""
            )
            conn.commit()

    def on_trace_start(self, trace: Trace) -> None:
        self.current_trace = trace
    
    def on_trace_end(self, trace: Trace) -> None:
        sql = f"""
            INSERT INTO {self.TRACE_TABLE} (
                trace_id, workflow_name, group_id, metadata
            ) VALUES (?, ?, ?, ?)
        """
        values = [
            trace.trace_id,
            trace.name,
            trace.group_id,
            json.dumps(trace.metadata)
        ]
        with self._create_connection() as conn:
            conn.execute(sql, values)
            conn.commit()
        self.current_trace = None
    
    def on_span_start(self, span: Span[Any]) -> None:
        self.current_span = span
    
    def on_span_end(self, span: Span[Any]) -> None:
        sql = f"""
            INSERT INTO {self.SPAN_TABLE} (
                span_id, trace_id, parent_id, started_at, ended_at, span_data, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        values = [
            span.span_id,
            span.trace_id,
            span.parent_id,
            span.started_at,
            span.ended_at,
            json.dumps(span.export()),
            span.error,
        ]
        with self._create_connection() as conn:
            conn.execute(sql, values)
            conn.commit()
        self.current_span = None


    def shutdown(self) -> None:
        """Called when the application stops."""
        self.force_flush()
 
    def force_flush(self):
        """Forces an immediate flush of all queued spans/traces."""
        if self.current_trace:
            self.on_trace_end(self.current_trace)
        if self.current_span:
            self.on_span_end(self.current_span)
        self.current_trace = None
        self.current_span = None
    