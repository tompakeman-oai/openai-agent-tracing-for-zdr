import logging
import queue
import sys
import os
from datetime import datetime

# Global log queue shared across the application
log_queue = queue.Queue()
# GLOBAL VARIABLE: Log directory for current day
DEFAULT_LOG_DIR = os.path.join("log", datetime.now().strftime("%Y-%m-%d"))
os.makedirs(DEFAULT_LOG_DIR, exist_ok=True)

# ANSI color codes for formatting
RESET = "\x1b[0m"
COLOR_MAP = {
    logging.DEBUG: "\x1b[34m",    # Blue
    logging.INFO: "\x1b[32m",     # Green
    logging.WARNING: "\x1b[33m",  # Yellow
    logging.ERROR: "\x1b[31m",    # Red
    logging.CRITICAL: "\x1b[35m", # Magenta
}

class ColorFormatter(logging.Formatter):
    def format(self, record):
        color = COLOR_MAP.get(record.levelno, "")
        record.levelname = f"{color}{record.levelname}{RESET}"
        return super().format(record)

class QueueHandler(logging.Handler):
    """
    A logging handler that sends log records to a shared queue.
    """
    def __init__(self, log_queue):
        super().__init__()
        self.log_queue = log_queue

    def emit(self, record):
        try:
            log_entry = self.format(record)
            self.log_queue.put(log_entry)
        except Exception:
            self.handleError(record)

def setup_logging(level=logging.INFO, log_to_stdout=True, log_to_queue=True, log_to_file=None):
    """
    Configure the root logger to output logs to stdout, a shared queue,
    and optionally to a file. Existing handlers are removed.
    """
    root_logger = logging.getLogger()
    # Clear any existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    root_logger.setLevel(level)
    
    if log_to_stdout:
        stream_handler = logging.StreamHandler(sys.stdout)
        stream_handler.setFormatter(
            ColorFormatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S")
        )
        root_logger.addHandler(stream_handler)
    
    if log_to_queue:
        queue_handler = QueueHandler(log_queue)
        queue_handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%Y-%m-%d %H:%M:%S")
        )
        root_logger.addHandler(queue_handler)
    
    if log_to_file:
        log_file_path = os.path.join(DEFAULT_LOG_DIR, log_to_file)
        file_handler = logging.FileHandler(log_file_path)
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%Y-%m-%d %H:%M:%S")
        )
        root_logger.addHandler(file_handler)

# Initialize logging on import with default settings.
setup_logging()
