"""
This is a drop-in replacement or addition to OpenAI's AgentSDK tracing.

This will create a new SQLite database in the current working directory.

This is designed for use with OpenAI's Zero-Data-Retention plan so that trace data can still be stored locally and not sent to external servers.
"""

import json
import logging
import sqlite3
from pathlib import Path
from typing import Any

from agents.tracing import Span, Trace, TracingProcessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1  # Bump every time the schema changes
DB_NAME = "traces"


class LocalTraceProcessor(TracingProcessor):
    """Stores traces and spans to a local SQLite database."""

    TRACE_TABLE = "traces"
    SPAN_TABLE = "spans"

    def __init__(self, db_path: str = None):
        """
        Args:
            db_path: The path to the SQLite database to use for storing traces and spans.
        """
        self.db_path = (
            db_path or Path(__file__).parent / f"{DB_NAME}_v{SCHEMA_VERSION}.db"
        )
        self._create_tables()
        self._add_indexes() # TODO - test this
        self.current_trace: Trace = None
        self.current_span: Span[Any] = None

    def _create_connection(self):
        """Creates a connection to the SQLite database."""
        try:
            return sqlite3.connect(self.db_path, uri=True)
        except Exception as e:
            logger.error(f"Failed to connect to SQLite DB at {self.db_path}: {e}")
            raise

    def _create_tables(self):
        """Creates the tables in the SQLite database."""
        try:
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
        except Exception as e:
            logger.error(f"Failed to create tables: {e}")
            raise
    
    def _add_indexes(self):
        """Adds indexes to the SQLite database."""
        try:
            with self._create_connection() as conn:
                conn.execute(f"CREATE INDEX IF NOT EXISTS idx_spans_started_at ON {self.SPAN_TABLE} (started_at)")
                conn.execute(f"CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON {self.SPAN_TABLE} (trace_id)")
                conn.execute(f"CREATE INDEX IF NOT EXISTS idx_spans_parent_id ON {self.SPAN_TABLE} (parent_id)")
                conn.execute(f"CREATE INDEX IF NOT EXISTS idx_traces_trace_id ON {self.TRACE_TABLE} (trace_id)")
                conn.execute(f"CREATE INDEX IF NOT EXISTS idx_traces_workflow ON {self.TRACE_TABLE} (workflow_name)")
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to add indexes: {e}")
            raise

    def on_trace_start(self, trace: Trace) -> None:
        """Called when a trace starts."""
        self.current_trace = trace

    def on_trace_end(self, trace: Trace) -> None:
        """Called when a trace ends."""
        sql = f"""
            INSERT INTO {self.TRACE_TABLE} (
                trace_id, workflow_name, group_id, metadata
            ) VALUES (?, ?, ?, ?)
        """
        values = [
            trace.trace_id,
            trace.name,
            trace.group_id,
            json.dumps(trace.metadata),
        ]
        try:
            with self._create_connection() as conn:
                conn.execute(sql, values)
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to insert trace {trace.trace_id}: {e}")
        self.current_trace = None

    def on_span_start(self, span: Span[Any]) -> None:
        """Called when a span starts."""
        self.current_span = span

    def on_span_end(self, span: Span[Any]) -> None:
        """Called when a span ends."""
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
            json.dumps(span.error) if span.error else None,
        ]
        try:
            with self._create_connection() as conn:
                conn.execute(sql, values)
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to insert span {span.span_id}: {e}")
        self.current_span = None

    def shutdown(self) -> None:
        """Called when the application stops."""
        try:
            self.force_flush()
        except Exception as e:
            logger.error(f"Error during shutdown force_flush: {e}")

    def force_flush(self):
        """Forces an immediate flush of all queued spans/traces."""
        try:
            if self.current_trace:
                self.on_trace_end(self.current_trace)
            if self.current_span:
                self.on_span_end(self.current_span)
        except Exception as e:
            logger.error(f"Error during force_flush: {e}")
        self.current_trace = None
        self.current_span = None
